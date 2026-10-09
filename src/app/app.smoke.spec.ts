import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const artifactUrl = pathToFileURL(resolve(import.meta.dirname, '../../dist/index.html')).href;

async function engageControlledBrake(page: Page, targetPercent: 50 | 100): Promise<void> {
  const indicator = page.locator('[data-ui="brake-effectiveness"]');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.keyboard.down(' ');
    if (await indicator.innerText() === `FRENO ${targetPercent} %`) return;
    await page.keyboard.up(' ');
  }
  throw new Error(`El freno no recorrió el nivel de ${targetPercent} %.`);
}

async function pickupStoppedRequest(page: Page, requestId: string): Promise<void> {
  const capacity = page.locator('[data-ui="capacity"]');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.keyboard.press('ArrowDown');
    if (await capacity.innerText() === '1 / 1') return;
    await page.keyboard.down('d');
    await page.waitForTimeout(400);
    await page.keyboard.up('d');
    await engageControlledBrake(page, 100);
    await expect.poll(async () => Math.abs(Number.parseFloat(
      await page.locator('[data-ui="speed"]').innerText())), { timeout: 4_000 }).toBeLessThanOrEqual(0.05);
    await page.keyboard.up(' ');
  }
  await expect(capacity, `No se recogió ${requestId}.`).toHaveText('1 / 1');
}

async function clickRequestOnRoute(page: Page, requestId: string): Promise<void> {
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-pickup-request', requestId, { timeout: 15_000 });
  await page.keyboard.up('d');
  await page.keyboard.up('ArrowRight');
  await engageControlledBrake(page, 100);
  await expect.poll(async () => Math.abs(Number.parseFloat(
    await page.locator('[data-ui="speed"]').innerText())), { timeout: 8_000 }).toBeLessThanOrEqual(0.05);
  await page.keyboard.up(' ');
  await pickupStoppedRequest(page, requestId);
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
  const sellSeat = page.getByRole('button', { name: 'Vender Asiento libre por S/ 11' });
  await expect(sellSeat).toBeVisible();
  await sellSeat.click();
  await expect(sellSeat).toHaveCount(0);

  const engine = page.getByRole('button', { name: /Retirar Motor urbano de columna 7, fila 4/ });
  const targetCell = page.getByRole('button', { name: 'Celda columna 1, fila 1' });
  await engine.evaluate((source) => {
    const target = document.querySelector<HTMLElement>('[aria-label="Celda columna 1, fila 1"]');
    if (!target) throw new Error('No se encontró la celda de prueba.');
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    Reflect.set(window, '__dragData', dataTransfer);
  });
  await expect(page.locator('.grid-drag-preview')).toBeVisible();
  await expect(page.locator('.grid-drag-preview')).toHaveClass(/is-valid/);
  await targetCell.evaluate((target) => {
    const dataTransfer = Reflect.get(window, '__dragData') as DataTransfer;
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    Reflect.deleteProperty(window, '__dragData');
  });
  await expect(page.locator('.grid-piece.is-loose')).toHaveCount(1);
  await page.getByRole('button', { name: /Retirar Rueda/ }).last().click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
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
  await expect(page.getByRole('meter', { name: 'Esfuerzo del motor' })).toBeVisible();
  await expect(page.locator('[data-ui="brake-effectiveness"]')).toHaveText('FRENO 0 %');
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
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  page.once('dialog', async (dialog) => dialog.accept());
  await page.keyboard.press('r');
  await expect(page.locator('[data-ui="time"]')).toHaveText('60 s');

  await page.keyboard.down('d');
  const revenue = page.locator('[data-ui="revenue"]');
  await expect(page.locator('canvas')).toHaveAttribute('data-route-code', 'CR27');
  await clickRequestOnRoute(page, 'primer-pasajero');
  await expect(revenue).toHaveText('S/ 5', { timeout: 20_000 });
  await expect(page.locator('[data-ui="capacity"]')).toHaveText('0 / 1');
  await clickRequestOnRoute(page, 'segundo-pasajero');
  await expect(page.locator('[data-ui="capacity"]')).toHaveText('1 / 1');
  await expect(revenue).toHaveText('S/ 10', { timeout: 20_000 });
  await clickRequestOnRoute(page, 'tercer-pasajero');
  await expect(revenue).toHaveText('S/ 15', { timeout: 20_000 });
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
    ['primer-pasajero', 'S/ 5'],
    ['segundo-pasajero', 'S/ 10'],
    ['tercer-pasajero', 'S/ 15'],
  ]);

  await page.getByRole('button', { name: /Siguiente: Subida al cerro/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, false, false);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    ['cerro-uno-a', 'S/ 5'], ['cerro-dos-a', 'S/ 10'],
    ['cerro-tres-a', 'S/ 15'], ['cerro-cuatro-a', 'S/ 20'],
  ]);

  await page.getByRole('button', { name: /Siguiente: Día de mercado/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    ['mercado-uno-a', 'S/ 5'], ['mercado-dos-a', 'S/ 10'],
    ['mercado-tres-a', 'S/ 15'], ['mercado-cuatro-a', 'S/ 20'],
  ]);
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
  await expect(page.getByText('Masa máxima').locator('..')).toContainText('kg');

  await page.getByRole('button', { name: /Siguiente: Pista dañada/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, true);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    ['pista-uno-a', 'S/ 5'], ['pista-dos-a', 'S/ 10'],
    ['pista-tres-a', 'S/ 15'], ['pista-cuatro-a', 'S/ 20'],
  ]);

  await page.getByRole('button', { name: /Siguiente: Hora punta/ }).click();
  await dismissGoals(page);
  await assembleVehicle(page, true);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, [
    ['punta-uno-a', 'S/ 5'], ['punta-dos-a', 'S/ 10'], ['punta-tres-a', 'S/ 15'],
    ['punta-cuatro-a', 'S/ 20'], ['punta-cinco-a', 'S/ 25'],
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
  expect(finalRevenue).toBe(25);
});

async function completeRoute(page: Page,
  deliveries: readonly (readonly [requestId: string, revenue: string])[]): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  const revenue = page.locator('[data-ui="revenue"]');
  await page.keyboard.down('d');
  for (const [requestId, expectedRevenue] of deliveries) {
    await clickRequestOnRoute(page, requestId);
    await expect(revenue).toHaveText(expectedRevenue, { timeout: 22_000 });
  }
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 45_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
}
