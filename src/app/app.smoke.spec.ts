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
    if (currentX < originX - 3) {
      const approachX = currentX < originX - 6 ? originX - 6 : originX - 3;
      await page.keyboard.down('d');
      await expect.poll(async () => Number(await canvas.getAttribute('data-vehicle-x')),
        { timeout: 20_000, intervals: [50] }).toBeGreaterThanOrEqual(approachX);
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
    { id: string; color: string; destinationX: number; destinationStop: string;
      remainingMeters: number }[]).find((item) => item.id === requestId);
  expect(marker?.destinationX).toBeGreaterThan(routePosition.vehicleX);
  expect(marker?.remainingMeters).toBeCloseTo(
    (marker?.destinationX ?? 0) - routePosition.vehicleX, 1);
  expect(marker?.destinationStop).toBe(targetRequest?.destinationStop);
  expect(marker?.color).toBe(targetRequest?.markerColor);
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

async function assembleVehicle(page: Page, suspension = false, cargoSupports = true): Promise<void> {
  await placeWorkshopPart(page, 'Rueda estándar', 2, 6);
  await placeWorkshopPart(page, 'Rueda estándar', 8, 6);
  await placeWorkshopPart(page, 'Motor urbano', 7, 4);
  await placeWorkshopPart(page, 'Asiento', 5, 4);
  await placeWorkshopPart(page, 'Asiento', 6, 4);
  if (cargoSupports) {
    await placeWorkshopPart(page, 'Parrilla de techo', 3, 3);
    await placeWorkshopPart(page, 'Portacarga posterior', 1, 5);
  }
  if (suspension) await placeWorkshopPart(page, 'Suspensión reforzada', 5, 6);
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
  await expect(page.getByRole('heading', { name: 'Tu ruta. Tu máquina.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tu ruta. Tu máquina.' })).toBeFocused();
  await expect(page.locator('canvas')).toBeVisible();
  await expect.poll(async () =>
    Number(await page.locator('canvas').getAttribute('data-physics-y')),
  ).toBeLessThan(1.5);

  await page.keyboard.press('F1');
  await expect(page.getByRole('button', { name: 'Depuración: sí' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Depuración: sí' }).click();
  await expect(page.getByRole('button', { name: 'Depuración: no' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'LEVEL_SELECT');
  await expect(page.getByRole('button', { name: /Primer recorrido/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Subida al cerro/ })).toBeDisabled();
  await expect(page.getByText(/Récord/)).toHaveCount(0);
  await expect(page.getByText('Solicitudes simultáneas y decisiones de capacidad')).toBeVisible();

  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'WORKSHOP');
  await expect(page.getByRole('heading', { name: 'Arma tu combi' })).toBeVisible();
  await expect(page.getByLabel('Cuadrícula libre de construcción de la combi')).toBeVisible();
  await expect(page.locator('.construction-cell.is-chassis')).toHaveCount(20);
  await expect(page.locator('.grid-piece')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Mover asiento del conductor/ })).toBeVisible();
  await page.getByRole('button', { name: 'Metas' }).click();
  await expect(page.getByRole('dialog', { name: 'Metas de estrellas' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al taller' }).click();
  await assembleVehicle(page);
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeEnabled();

  const driverSeat = page.getByRole('button', { name: /Mover asiento del conductor de columna 4, fila 4/ });
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
  const targetCell = page.getByRole('button', { name: 'Celda columna 1, fila 1' });
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
  await expect(page.getByRole('button', { name: /Retirar Motor urbano de columna 1, fila 1/ })).toBeVisible();
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
  await accelerate.dispatchEvent('pointerup', { pointerType: 'touch', button: 0 });
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PAUSED');
  await expect(page.getByText('Primer recorrido', { exact: true })).toBeVisible();
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
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
  await expect(page.getByLabel('3 de 3 estrellas')).toBeVisible();

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'MENU');
  await expect(page.getByText(/Ruta 2/)).toBeVisible();
  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Borrar progreso' }).click();
  await expect(page.getByText(/^Ruta 1$/)).toBeVisible();
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

test('carga un perfil de demostración y conserva preferencias accesibles', async ({ page }) => {
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Movimiento reducido: no' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-reduced-motion', 'true');
  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cargar perfil de demostración' }).click();
  await expect(page.getByText(/Ruta 5/)).toBeVisible();
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-reduced-motion', 'true');
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await expect(page.getByRole('button', { name: /Hora punta/ })).toBeEnabled();
  await page.getByRole('button', { name: /Hora punta/ }).click();
  await expect(page.getByText('Peso').locator('..')).toContainText('602 kg');
  await expect(page.locator('.grid-piece')).toHaveCount(1);
  await expect(page.locator('.grid-piece.is-loose')).toHaveCount(0);
});

test('desbloquea y completa la campaña de cinco recorridos', async ({ page }) => {
  test.setTimeout(360_000);
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
  await assembleVehicle(page, false, false);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'cerro-uno-a', 'cerro-dos-a', 'cerro-tres-a', 'cerro-cuatro-a',
  ]);

  await page.getByRole('button', { name: /Siguiente: Día de mercado/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'mercado-uno-a', 'mercado-dos-a', 'mercado-tres-a', 'mercado-cuatro-a',
  ]);
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
  await expect(page.getByText('Masa máxima').locator('..')).toContainText('kg');

  await page.getByRole('button', { name: /Siguiente: Pista dañada/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, true);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'pista-uno-a', 'pista-dos-a', 'pista-tres-a', 'pista-cuatro-a',
  ]);

  await page.getByRole('button', { name: /Siguiente: Hora punta/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, true);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    'punta-uno-a', 'punta-dos-a', 'punta-tres-a', 'punta-cuatro-a', 'punta-cinco-a',
  ]);
  await expect(page.getByText('Estabilidad').locator('..')).toContainText('%');
  await expect(page.getByText('Piezas sueltas').locator('..')).toContainText('0');
  await page.reload();
  await expect(page.getByText(/Ruta 5/)).toBeVisible();
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
  await page.keyboard.down('d');
  for (const requestId of deliveries) {
    await clickRequestOnRoute(page, requestId);
  }
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 45_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
  await expect(page.getByLabel('3 de 3 estrellas')).toBeVisible();
}
