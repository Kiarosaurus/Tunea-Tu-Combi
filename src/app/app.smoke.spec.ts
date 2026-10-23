import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const artifactUrl = pathToFileURL(resolve(import.meta.dirname, '../../dist/index.html')).href;

async function engageControlledBrake(page: Page, targetPercent: 50 | 100): Promise<void> {
  const indicator = page.locator('[data-ui="brake-effectiveness"]');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.keyboard.down('ArrowDown');
    if (await indicator.innerText() === `FRENO ${targetPercent} %`) return;
    await page.keyboard.up('ArrowDown');
  }
  throw new Error(`El freno no recorrió el nivel de ${targetPercent} %.`);
}

async function pickupStoppedRequest(page: Page, requestId: string, originX: number): Promise<void> {
  const canvas = page.locator('canvas');
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const currentX = Number(await canvas.getAttribute('data-vehicle-x'));
    const onboardDestination = Number(await canvas.getAttribute('data-onboard-destination-x'));
    const approachGap = onboardDestination > originX - 3 && onboardDestination < originX
      ? 1.7 : 3;
    if (currentX < originX - approachGap) {
      const approachX = currentX < originX - 6 ? originX - 6 : originX - approachGap;
      await page.keyboard.down('d');
      await expect.poll(async () => {
        const engineLoad = Number(await page.getByRole('meter', { name: 'Esfuerzo del motor' })
          .getAttribute('aria-valuenow'));
        if (engineLoad >= 82) await page.keyboard.up('d');
        else await page.keyboard.down('d');
        return Number(await canvas.getAttribute('data-vehicle-x'));
      }, { timeout: 30_000, intervals: [50] }).toBeGreaterThanOrEqual(approachX);
      await page.keyboard.up('d');
      await engageControlledBrake(page, 100);
      await expect.poll(async () => Math.abs(Number.parseFloat(
        await page.locator('[data-ui="speed"]').innerText())),
      { timeout: 4_000 }).toBeLessThanOrEqual(0.05);
      await page.keyboard.up('ArrowDown');
      continue;
    }
    await page.keyboard.press('Space');
    const onboard = JSON.parse(await canvas.getAttribute('data-onboard-request-ids') ?? '[]') as string[];
    if (onboard.includes(requestId)) return;
    const vehicleX = Number(await canvas.getAttribute('data-vehicle-x'));
    if (vehicleX > originX + 3.4) throw new Error(`Se rebasó el origen de ${requestId}.`);
  }
  throw new Error(`No se recogió ${requestId}.`);
}

async function clickRequestOnRoute(page: Page, requestId: string): Promise<void> {
  const canvas = page.locator('canvas');
  const waiting = JSON.parse(await canvas.getAttribute('data-waiting-requests') ?? '[]') as
    { id: string; originX: number; destinationStop: string; markerColor: string;
      kind: 'passenger' | 'roofCargo' | 'scooter' }[];
  const targetRequest = waiting.find((request) => request.id === requestId);
  const originX = targetRequest?.originX ?? Number.NaN;
  expect(originX, `${requestId} debe seguir esperando en la ruta.`).toBeGreaterThan(0);
  await expect.poll(async () => {
    const vehicleX = Number(await canvas.getAttribute('data-vehicle-x'));
    const speed = Math.abs(Number.parseFloat(await page.locator('[data-ui="speed"]').innerText()));
    return originX - vehicleX <= Math.max(10, speed * 3.2);
  }, { timeout: 15_000 }).toBe(true);
  await page.keyboard.up('d');
  await page.keyboard.up('ArrowRight');
  await engageControlledBrake(page, 100);
  await expect.poll(async () => Math.abs(Number.parseFloat(
    await page.locator('[data-ui="speed"]').innerText())), { timeout: 8_000 }).toBeLessThanOrEqual(0.05);
  await page.keyboard.up('ArrowDown');
  await pickupStoppedRequest(page, requestId, originX);
  const routePosition = await page.locator('canvas').evaluate((canvas) => ({
    vehicleX: Number((canvas as HTMLElement).dataset.vehicleX),
  }));
  const marker = (JSON.parse(await canvas.getAttribute('data-onboard-markers') ?? '[]') as
    { id: string; color: string; kind: 'passenger' | 'roofCargo' | 'scooter';
      destinationX: number; destinationStop: string;
      remainingMeters: number }[]).find((item) => item.id === requestId);
  expect(marker?.destinationX).toBeGreaterThan(routePosition.vehicleX);
  expect(marker?.remainingMeters).toBeCloseTo(
    (marker?.destinationX ?? 0) - routePosition.vehicleX, 1);
  expect(marker?.destinationStop).toBe(targetRequest?.destinationStop);
  expect(marker?.color).toBe(targetRequest?.markerColor);
  expect(marker?.kind).toBe(targetRequest?.kind);
  const routeCardIds = JSON.parse(await canvas.getAttribute('data-route-card-request-ids') ?? '[]') as string[];
  expect(routeCardIds.includes(requestId)).toBe(targetRequest?.kind === 'passenger');
  const fareNotice = JSON.parse(await canvas.getAttribute('data-fare-notice') ?? 'null') as
    { baseFare: number; surcharge: number; total: number } | null;
  expect(fareNotice?.total).toBe((fareNotice?.baseFare ?? 0) + (fareNotice?.surcharge ?? 0));
  expect(fareNotice?.surcharge).toBe(targetRequest?.kind === 'passenger' ? 0 : 2);
  const fareLabel = await canvas.getAttribute('data-fare-notice-label');
  expect(fareLabel).toBe(targetRequest?.kind === 'passenger'
    ? `+S/ ${fareNotice?.total}`
    : `S/ ${fareNotice?.baseFare} + S/ 2 = +S/ ${fareNotice?.total}`);
  const fareReward = page.locator('[data-ui="fare-reward"]');
  await expect(fareReward).toBeVisible();
  await expect(fareReward.locator('[data-ui="fare-reward-value"]')).toHaveText(fareLabel ?? '');
  await expect(fareReward.locator('img')).toHaveCount(2);
  expect(await fareReward.locator('img').last().evaluate((image) =>
    new DOMMatrix(getComputedStyle(image).transform).a)).toBeGreaterThan(0);
  const expectedSource = targetRequest?.kind === 'passenger' ? 'passenger' : 'system';
  await expect(page.locator('.ride-toast')).toHaveAttribute('data-source', expectedSource);
  await expect(page.locator('.ride-toast')).toHaveAttribute('aria-label',
    targetRequest?.kind === 'passenger' ? /Pasajero:/ : /Juego:/);
  await expect.poll(() => page.locator('.ride-toast').evaluate((element) =>
    element.style.getPropertyValue('--passenger-color'))).toBe(
    targetRequest?.kind === 'passenger' ? targetRequest.markerColor : '',
  );
  await page.keyboard.down('d');
}

async function dismissGoals(page: Page): Promise<void> {
  await expect(page.getByRole('dialog', { name: 'Metas de estrellas', includeHidden: true })).toBeHidden();
}

async function placeWorkshopPart(page: Page, partName: string, column: number, row: number): Promise<void> {
  const partButton = page.getByRole('button', { name: new RegExp(`(?:Seleccionar|Comprar) ${partName}`) });
  if (await partButton.getAttribute('aria-pressed') !== 'true') await partButton.click();
  await page.getByRole('button', { name: `Celda columna ${column}, fila ${row}` }).click();
}

async function assembleVehicle(page: Page, equipment: {
  seats?: number; roof?: boolean; rear?: boolean; suspension?: boolean;
} = {}): Promise<void> {
  await placeWorkshopPart(page, 'Rueda estándar', 2, 6);
  await placeWorkshopPart(page, 'Rueda estándar', 8, 6);
  await placeWorkshopPart(page, 'Motor urbano', 7, 4);
  if ((equipment.seats ?? 2) >= 1) await placeWorkshopPart(page, 'Asiento', 5, 4);
  if ((equipment.seats ?? 2) >= 2) await placeWorkshopPart(page, 'Asiento', 6, 4);
  if (equipment.roof) await placeWorkshopPart(page, 'Parrilla de techo', 2, 1);
  if (equipment.rear) await placeWorkshopPart(page, 'Portabicis posterior', 1, 5);
  if (equipment.suspension) await placeWorkshopPart(page, 'Suspensión reforzada', 5, 6);
}

test('abre offline y recorre menú, niveles y taller sin errores', async ({ page }) => {
  const errors: string[] = [];
  const remoteRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });

  await page.goto(artifactUrl);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'MENU');
  await expect(page.getByRole('heading', { name: 'Tunea Tu Combi' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tunea Tu Combi' })).toBeFocused();
  await expect(page.locator('.menu-panel .primary-action')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Demo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Movimiento/ })).toHaveCount(0);
  expect(await page.locator('.screen').evaluate((element) => getComputedStyle(element).scrollbarWidth))
    .toBe('none');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () =>
    Number(await page.locator('canvas').getAttribute('data-physics-y')),
  ).toBeLessThan(1.5);
  await expect(page.getByRole('button', { name: /físicas|Física/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'LEVEL_SELECT');
  await expect(page.getByRole('button', { name: /Primer recorrido/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Subida al cerro/ })).toBeDisabled();
  await expect(page.getByText(/Récord/)).toHaveCount(0);
  await expect(page.getByText('Solicitudes simultáneas y decisiones de capacidad')).toBeVisible();

  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'WORKSHOP');
  await expect(page.getByRole('button', { name: /físicas|Física/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Métele mano' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'No hay un arreglo anterior para recuperar' })).toBeDisabled();
  await expect(page.getByLabel('Cuadrícula libre de construcción de la combi')).toBeVisible();
  await expect(page.locator('.construction-cell.is-chassis')).toHaveCount(20);

  await expect(page.locator('.grid-piece')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Mover asiento del conductor/ })).toBeVisible();
  await page.getByRole('button', { name: 'Metas' }).click();
  await expect(page.getByRole('dialog', { name: 'Metas de estrellas' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al taller' }).click();
  await assembleVehicle(page);
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeEnabled();

  const driverSeat = page.getByRole('button', { name: /Mover asiento del conductor de columna 9, fila 4/ });
  await driverSeat.scrollIntoViewIfNeeded();
  const scrollBeforeChange = await page.evaluate(() => window.scrollY);
  await driverSeat.click();
  await expect.poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(Math.max(0, scrollBeforeChange - 10));
  await expect(page.getByText(/asiento del conductor es fijo/i)).toBeVisible();
  await expect(driverSeat.locator('.grid-driver-person')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeEnabled();

  const passengerSeat = page.getByRole('button', { name: /Retirar Asiento de columna 5, fila 4/ });
  await passengerSeat.click();
  const refundSeat = page.getByRole('button', { name: 'Reembolsar Asiento libre por S/ 15' });
  await expect(refundSeat).toBeVisible();
  await refundSeat.click();
  await expect(refundSeat).toHaveCount(0);

  const engine = page.getByRole('button', { name: /Retirar Motor urbano de columna 7, fila 4/ });
  const targetCell = page.getByRole('button', { name: 'Celda columna 6, fila 1' });
  const engineBox = await engine.boundingBox();
  const targetBox = await targetCell.boundingBox();
  if (!engineBox || !targetBox) throw new Error('No se pudo medir el arrastre del taller.');
  const grabOffset = { x: engineBox.width - 6, y: engineBox.height - 6 };
  await page.mouse.move(engineBox.x + grabOffset.x, engineBox.y + grabOffset.y);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + grabOffset.x, targetBox.y + grabOffset.y, { steps: 4 });
  await expect(page.locator('.grid-drag-preview')).toBeVisible();
  await expect(page.locator('.grid-drag-preview')).toHaveClass(/is-valid/);
  await expect(page.locator('.pointer-drag-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /Retirar Motor urbano de columna 6, fila 1/ })).toBeVisible();
  await expect(page.locator('.grid-piece.is-loose')).toHaveCount(1);
  await page.getByRole('button', { name: /Retirar Rueda/ }).last().click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  const waitingRequests = JSON.parse(await page.locator('canvas')
    .getAttribute('data-waiting-requests') ?? '[]') as
    { destinationStop: string; servedByRoute: boolean }[];
  expect(waitingRequests).toContainEqual(expect.objectContaining({
    destinationStop: 'Gamarra', servedByRoute: false,
  }));
  await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-engine-health')),
    { timeout: 5_000 }).toBeLessThanOrEqual(75);

  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('completa el primer recorrido y conserva el progreso tras recargar', async ({ page }) => {
  test.setTimeout(80_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  await page.getByRole('button', { name: 'Física: desactivada' }).click();
  await expect(page.getByRole('button', { name: 'Física: activada' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => JSON.parse(await page.locator('canvas')
    .getAttribute('data-debug-readout') ?? '{}')).toEqual(expect.objectContaining({
    massKg: expect.any(Number),
    payloadMassKg: expect.any(Number),
    gravityMps2: 9.81,
  }));
  await page.getByRole('button', { name: 'Física: activada' }).click();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.getByRole('meter', { name: 'Esfuerzo del motor' })).toBeVisible();
  await expect(page.locator('[data-ui="brake-effectiveness"]')).toHaveText('FRENO 0 %');
  await expect(page.getByRole('button', { name: 'Recoger pasajero o carga' })).toBeVisible();
  const accelerate = page.getByRole('button', { name: 'Acelerar' });
  await accelerate.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await expect.poll(async () => Number.parseFloat(await page.locator('[data-ui="position"]').innerText()))
    .toBeGreaterThan(2.1);
  await expect.poll(async () => Number(
    await page.getByRole('meter', { name: 'Esfuerzo del motor' }).getAttribute('aria-valuenow')))
    .toBeGreaterThan(0);
  expect(await page.locator('.engine-load-fill').evaluate((element) =>
    getComputedStyle(element).backgroundImage)).toBe('none');
  await expect.poll(async () => Number(
    await page.getByRole('meter', { name: 'Esfuerzo del motor' }).getAttribute('aria-valuenow')),
  { timeout: 7_000 }).toBe(100);
  await expect(page.getByRole('meter', { name: 'Esfuerzo del motor' })).toHaveClass(/is-maxed/);
  await expect(page.locator('[data-ui="engine-card"]')).toHaveClass(/is-maxed/);
  expect(await page.getByRole('meter', { name: 'Esfuerzo del motor' }).evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    fill: getComputedStyle(element.querySelector('.engine-load-fill') as Element).backgroundColor,
    fillAnimation: getComputedStyle(element.querySelector('.engine-load-fill') as Element).animationName,
  }))).toEqual({
    animation: 'engine-indicator-shake',
    fill: 'rgb(228, 49, 49)',
    fillAnimation: 'engine-fill-shake',
  });
  await expect(page.locator('.engine-overload-warning')).toBeVisible();
  await expect(page.locator('.ride-toast')).toContainText('Motor al límite');
  await accelerate.dispatchEvent('pointerup', { pointerType: 'touch', button: 0 });
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PAUSED');
  expect(await page.locator('.pause-panel').evaluate((element) =>
    element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(page.getByText('Primer recorrido', { exact: true })).toBeVisible();
  await expect(page.locator('.pause-panel button')).toHaveCount(5);
  const messageToggle = page.getByRole('button', { name: 'Desactivar avisos en ruta' });
  await expect(messageToggle).toHaveAttribute('aria-pressed', 'true');
  await messageToggle.click();
  await expect(page.getByRole('button', { name: 'Activar avisos en ruta' }))
    .toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Activar avisos en ruta' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  page.once('dialog', async (dialog) => dialog.accept());
  await page.keyboard.press('r');
  await expect(page.locator('[data-ui="time"]')).toHaveText('60 s');

  await page.keyboard.down('d');
  await expect(page.locator('canvas')).toHaveAttribute('data-route-code', 'CR27');
  await clickRequestOnRoute(page, 'primer-pasajero');
  await clickRequestOnRoute(page, 'segundo-pasajero');
  await clickRequestOnRoute(page, 'tercer-pasajero');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 40_000 });
  expect(await page.locator('.results-panel').evaluate((element) =>
    element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: '¡Buena ruta!' })).toBeVisible();
  await expect(page.getByLabel('3 de 3 estrellas')).toBeVisible();
  await expect(page.locator('.result-details')).toHaveJSProperty('open', false);
  await expect(page.locator('.topbar')).toBeHidden();
  await page.getByRole('button', { name: /Siguiente: Subida al cerro/ }).click();
  const restoreBuild = page.getByRole('button', { name: 'Recuperar el arreglo del último nivel jugado' });
  await expect(restoreBuild).toBeEnabled();
  await restoreBuild.click();
  await expect(page.locator('.grid-piece')).toHaveCount(6);
  const launch = page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' });
  await expect(launch).toBeEnabled();

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'MENU');
  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Borrar progreso' }).click();
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await expect(page.getByRole('button', { name: /Subida al cerro/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('recupera un guardado corrupto sin bloquear el menú', async ({ page }) => {
  await page.goto(artifactUrl);
  await page.evaluate(() => window.localStorage.setItem('tunea-tu-combi:save:v1', '{mal-json'));
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'MENU');
  await expect(page.getByRole('status')).toContainText('Guardado inválido recuperado');
  await expect(page.getByRole('button', { name: 'Empezar recorrido' })).toBeEnabled();
});

test('anima la portada con composiciones, pasajeros, terreno y cobros variables', async ({ page }) => {
  test.setTimeout(15_000);
  await page.goto(artifactUrl);
  const canvas = page.locator('canvas');
  const initialX = Number(await canvas.getAttribute('data-vehicle-x'));
  const initialParts = await canvas.getAttribute('data-menu-showcase-parts');
  await expect.poll(async () => Number(await canvas.getAttribute('data-vehicle-x')),
    { timeout: 1_800 }).toBeGreaterThan(initialX + 0.2);
  await expect(canvas).toHaveAttribute('data-menu-showcase-money-sprite', /png/);
  const movingX = Number(await canvas.getAttribute('data-vehicle-x'));
  await expect.poll(async () => Number(await canvas.getAttribute('data-menu-showcase-variant')),
    { timeout: 3_000 }).toBe(1);
  await expect.poll(async () => Number(await canvas.getAttribute('data-vehicle-x')))
    .toBeGreaterThanOrEqual(movingX - 0.05);
  await expect(canvas).toHaveAttribute('data-menu-showcase-passengers', '3');
  await expect(canvas).toHaveAttribute('data-menu-showcase-fare', '4');
  expect(await canvas.getAttribute('data-menu-showcase-parts')).not.toBe(initialParts);
  await expect.poll(async () => Number(await canvas.getAttribute('data-menu-showcase-variant')),
    { timeout: 3_000 }).toBe(2);
  await expect(canvas).toHaveAttribute('data-menu-showcase-passengers', '2');
  await expect(canvas).toHaveAttribute('data-menu-showcase-fare', '3');
  await expect.poll(async () => Number(await canvas.getAttribute('data-menu-showcase-variant')),
    { timeout: 3_000 }).toBe(3);
  await expect(canvas).toHaveAttribute('data-menu-showcase-passengers', '3');
});

test('desbloquea y completa la campaña de cinco recorridos', async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'primer-pasajero', 'segundo-pasajero', 'tercer-pasajero',
  ]);

  await page.getByRole('button', { name: /Siguiente: Subida al cerro/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'cerro-uno-a', 'cerro-dos-a', 'cerro-tres-a', 'cerro-cuatro-a',
  ]);

  await page.getByRole('button', { name: /Siguiente: Día de mercado/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, { roof: true });
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'mercado-uno-a', 'mercado-uno-b', 'mercado-tres-b', 'mercado-cuatro-b',
  ]);
  await expect(page.getByRole('heading', { name: '¡Buena ruta!' })).toBeVisible();
  await page.getByText('Ver detalles', { exact: true }).click();
  await expect(page.getByText('Masa máxima').locator('..')).toContainText('kg');

  await page.getByRole('button', { name: /Siguiente: Pista dañada/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, { roof: true, rear: true });
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'pista-uno-a', 'pista-uno-b', 'pista-tres-a', 'pista-cuatro-a', 'pista-cuatro-b',
  ]);

  await page.getByRole('button', { name: /Siguiente: Hora punta/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, { roof: true, rear: true, suspension: true });
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'punta-uno-a', 'punta-uno-b', 'punta-dos-b', 'punta-cuatro-a', 'punta-cuatro-b',
  ]);
  await page.getByText('Ver detalles', { exact: true }).click();
  await expect(page.getByText('Estabilidad').locator('..')).toContainText('%');
  await expect(page.getByText('Piezas sueltas').locator('..')).toContainText('0');
  await page.reload();
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await expect(page.getByRole('button', { name: /Hora punta/ })).toBeEnabled();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Recuperar el arreglo del último nivel jugado' }).click();
  const overBudgetLaunch = page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' });
  await expect(overBudgetLaunch).toBeDisabled();
  await expect(overBudgetLaunch).toHaveClass(/is-over-budget/);
  await expect(page.getByText(/Faltan S\/ 100/)).toBeVisible();
  expect(await overBudgetLaunch.evaluate((element) =>
    getComputedStyle(element).backgroundColor)).toBe('rgb(166, 140, 84)');
  const finalRevenue = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tunea-tu-combi:save:v1');
    if (!raw) return 0;
    const saved = JSON.parse(raw) as {
      completedLevels?: Record<string, { bestRevenue?: number }>;
    };
    return saved.completedLevels?.['hora-punta']?.bestRevenue ?? 0;
  });
  expect(finalRevenue).toBeGreaterThan(0);
});

async function completeRoute(page: Page, deliveries: readonly string[]): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  const obstacleXs: Record<string, readonly number[]> = {
    primer: [23, 74], cerro: [41, 82], mercado: [19, 69, 100],
    pista: [23, 51, 77, 106], punta: [18, 40, 64, 89, 113],
  };
  const route = deliveries[0]?.split('-')[0] ?? '';
  const obstacles = obstacleXs[route] ?? [];
  let nextObstacle = 0;
  await page.keyboard.down('d');
  for (const requestId of deliveries) {
    const onboard = JSON.parse(await page.locator('canvas').getAttribute('data-onboard-request-ids') ?? '[]') as
      string[];
    if (onboard.includes(requestId)) continue;
    const waiting = JSON.parse(await page.locator('canvas').getAttribute('data-waiting-requests') ?? '[]') as
      { id: string; originX: number }[];
    const originX = waiting.find((item) => item.id === requestId)?.originX ?? Number.POSITIVE_INFINITY;
    while (nextObstacle < obstacles.length && (obstacles[nextObstacle] ?? 0) < originX) {
      await slowForObstacle(page, obstacles[nextObstacle] ?? 0);
      nextObstacle += 1;
    }
    await clickRequestOnRoute(page, requestId);
  }
  while (nextObstacle < obstacles.length) {
    await slowForObstacle(page, obstacles[nextObstacle] ?? 0);
    nextObstacle += 1;
  }
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 45_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: '¡Buena ruta!' })).toBeVisible();
  await expect(page.getByLabel('3 de 3 estrellas')).toBeVisible();
}

async function slowForObstacle(page: Page, obstacleX: number): Promise<void> {
  const canvas = page.locator('canvas');
  await expect.poll(async () => {
    const engineLoad = Number(await page.getByRole('meter', { name: 'Esfuerzo del motor' })
      .getAttribute('aria-valuenow'));
    if (engineLoad >= 82) await page.keyboard.up('d');
    else await page.keyboard.down('d');
    return Number(await canvas.getAttribute('data-vehicle-x'));
  }, { timeout: 20_000, intervals: [50] }).toBeGreaterThanOrEqual(obstacleX - 4.5);
  await page.keyboard.up('d');
  await engageControlledBrake(page, 100);
  await expect.poll(async () => Math.abs(Number.parseFloat(
    await page.locator('[data-ui="speed"]').innerText())),
  { timeout: 5_000 }).toBeLessThanOrEqual(1.5);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('d');
}
