import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

const artifactUrl = pathToFileURL(resolve(import.meta.dirname, '../../dist/index.html')).href;

async function interactUntil(page: Page, locator: Locator, expectedText: string): Promise<void> {
  await expect.poll(async () => {
    await page.keyboard.press('e');
    return locator.textContent();
  }, { timeout: 10_000, intervals: [50] }).toBe(expectedText);
}

async function clickPassengerOnRoute(page: Page, requestId: string): Promise<void> {
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveAttribute('data-pickup-request', requestId, { timeout: 15_000 });
  await page.keyboard.up('d');
  await page.waitForTimeout(120);
  const point = await canvas.evaluate((element) => ({
    x: Number((element as HTMLElement).dataset.pickupX),
    y: Number((element as HTMLElement).dataset.pickupY),
  }));
  await canvas.click({ position: point });
  await page.keyboard.down('d');
}

async function dismissGoals(page: Page): Promise<void> {
  await expect(page.getByRole('dialog', { name: 'Metas de estrellas' })).toBeVisible();
  await page.getByRole('button', { name: 'Listo' }).click();
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

  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'WORKSHOP');
  await expect(page.getByRole('heading', { name: 'Arma tu combi' })).toBeVisible();
  await expect(page.getByLabel('Cuadrícula libre de construcción de la combi')).toBeVisible();
  await expect(page.locator('.construction-cell.is-chassis')).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeEnabled();

  const driverSeat = page.getByRole('button', { name: /Retirar Asiento de columna 4, fila 4/ });
  await driverSeat.scrollIntoViewIfNeeded();
  const scrollBeforeChange = await page.evaluate(() => window.scrollY);
  await driverSeat.click();
  await page.getByRole('button', { name: /Retirar Asiento/ }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(Math.max(0, scrollBeforeChange - 10));
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeDisabled();
  await expect(page.getByText('Falta el asiento del conductor.')).toBeVisible();
  await page.getByRole('button', { name: 'Celda columna 5, fila 4' }).click();
  await expect(page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' })).toBeEnabled();

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
  await expect(page.locator('canvas')).toHaveAttribute('data-missing-requirement', 'seat');
  await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-engine-health')),
    { timeout: 5_000 }).toBeLessThanOrEqual(75);

  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('completa el primer recorrido y conserva el progreso tras recargar', async ({ page }) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  const accelerate = page.getByRole('button', { name: 'Acelerar' });
  await accelerate.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await expect.poll(async () => Number.parseFloat(await page.locator('[data-ui="position"]').innerText()))
    .toBeGreaterThan(2.1);
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
  await clickPassengerOnRoute(page, 'primer-pasajero');
  await expect(revenue).toHaveText('S/ 3', { timeout: 15_000 });
  await expect(page.locator('[data-ui="capacity"]')).toHaveText('0 / 1');
  await expect(page.locator('canvas')).toHaveAttribute('data-pickup-request', 'segundo-pasajero',
    { timeout: 15_000 });
  await page.keyboard.up('d');
  await page.keyboard.press('Space');
  await expect(page.locator('[data-ui="capacity"]')).toHaveText('1 / 1');
  await page.keyboard.down('d');
  await expect(revenue).toHaveText('S/ 6', { timeout: 15_000 });
  await interactUntil(page, revenue, 'S/ 8');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 30_000 });
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
  await expect(page.getByText('Peso').locator('..')).toContainText('796 kg');
  await expect(page.locator('.grid-piece.is-loose')).toHaveCount(0);
});

test('desbloquea y completa la campaña de cinco recorridos', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, ['S/ 3', 'S/ 6', 'S/ 8']);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Subida al cerro/ })).toBeEnabled();
  await page.getByRole('button', { name: /Subida al cerro/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, ['S/ 3', 'S/ 6', 'S/ 9']);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Día de mercado/ })).toBeEnabled();
  await page.getByRole('button', { name: /Día de mercado/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, ['S/ 3', 'S/ 7', 'S/ 10']);
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
  await expect(page.getByText('Masa máxima').locator('..')).toContainText('kg');

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Pista dañada/ })).toBeEnabled();
  await page.getByRole('button', { name: /Pista dañada/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, ['S/ 3', 'S/ 7', 'S/ 11']);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Hora punta/ })).toBeEnabled();
  await page.getByRole('button', { name: /Hora punta/ }).click();
  await dismissGoals(page);
  await page.getByRole('button', { name: 'Iniciar recorrido de 60 segundos' }).click();
  await completeRoute(page, ['S/ 3', 'S/ 6', 'S/ 9', 'S/ 12']);
  await expect(page.getByText('Estabilidad').locator('..')).toContainText('%');
  await expect(page.getByText('Piezas perdidas').locator('..')).toContainText('0');
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
  expect(finalRevenue).toBe(12);
});

async function completeRoute(page: Page, revenues: readonly string[]): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  const revenue = page.locator('[data-ui="revenue"]');
  await page.keyboard.down('d');
  for (const expectedRevenue of revenues) await interactUntil(page, revenue, expectedRevenue);
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 30_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Ruta completa' })).toBeVisible();
}
