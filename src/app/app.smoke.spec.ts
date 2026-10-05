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
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'WORKSHOP');
  await expect(page.getByRole('heading', { name: 'Taller de la combi' })).toBeVisible();

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
  await page.getByRole('button', { name: 'Comprar Asiento' }).click();
  await page.getByRole('button', { name: 'Colocar Asiento de pasajero' }).click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PAUSED');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');

  await page.keyboard.down('d');
  const delivery = page.locator('[data-ui="deliver"]');
  const revenue = page.locator('[data-ui="revenue"]');
  await interactUntil(page, delivery, 'Bajar en Centro');
  await interactUntil(page, revenue, 'S/ 15');
  await interactUntil(page, delivery, 'Bajar en Mercado');
  await interactUntil(page, revenue, 'S/ 30');
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 30_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Cuota alcanzada' })).toBeVisible();

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'MENU');
  await expect(page.getByText(/Nivel desbloqueado: 2/)).toBeVisible();
  page.once('dialog', async (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Borrar progreso' }).click();
  await expect(page.getByText(/Billetera: S\/ 100 \| Nivel desbloqueado: 1/)).toBeVisible();
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

test('desbloquea y completa la campaña de cinco recorridos', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto(artifactUrl);
  await page.getByRole('button', { name: 'Empezar recorrido' }).click();
  await page.getByRole('button', { name: /Primer recorrido/ }).click();
  await page.getByRole('button', { name: 'Comprar Asiento' }).click();
  await page.getByRole('button', { name: 'Colocar Asiento de pasajero' }).click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await completeRoute(page, [
    ['Bajar en Centro', 'S/ 15'],
    ['Bajar en Mercado', 'S/ 30'],
  ]);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Subida al cerro/ })).toBeEnabled();
  await page.getByRole('button', { name: /Subida al cerro/ }).click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await completeRoute(page, [
    ['Bajar en Mirador', 'S/ 18'],
    ['Bajar en Curva alta', 'S/ 39'],
    ['Bajar en Cumbre', 'S/ 60'],
  ]);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Día de mercado/ })).toBeEnabled();
  await page.getByRole('button', { name: /Día de mercado/ }).click();
  for (const [buy, place] of [
    ['Comprar Parrilla de techo', 'Colocar Parrilla de techo'],
    ['Comprar Portacarga posterior', 'Colocar Portacarga posterior'],
    ['Comprar Suspensión reforzada', 'Colocar Suspensión'],
  ] as const) {
    await page.getByRole('button', { name: buy }).click();
    await page.getByRole('button', { name: place }).click();
  }
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await completeRoute(page, [
    ['Bajar en Mercado', 'S/ 18'],
    ['Entregar carga en Mayorista', 'S/ 45'],
    ['Entregar carga en Terminal', 'S/ 72'],
  ]);
  await expect(page.getByRole('heading', { name: 'Cuota alcanzada' })).toBeVisible();
  await expect(page.getByText('Masa máxima').locator('..')).toContainText('kg');

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Pista dañada/ })).toBeEnabled();
  await page.getByRole('button', { name: /Pista dañada/ }).click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await completeRoute(page, [
    ['Bajar en Puente', 'S/ 22'],
    ['Entregar carga en Rompemuelles', 'S/ 52'],
    ['Entregar carga en Meta', 'S/ 82'],
  ]);

  await page.getByRole('button', { name: 'Elegir nivel' }).click();
  await expect(page.getByRole('button', { name: /Hora punta/ })).toBeEnabled();
  await page.getByRole('button', { name: /Hora punta/ }).click();
  await page.getByRole('button', { name: 'Iniciar recorrido de 30 segundos' }).click();
  await completeRoute(page, [
    ['Bajar en Cruce', 'S/ 25'],
    ['Entregar carga en Mercado', 'S/ 55'],
    ['Entregar carga en Óvalo', 'S/ 85'],
    ['Bajar en Terminal', 'S/ 110'],
  ]);
  await page.reload();
  await expect(page.getByText(/Nivel desbloqueado: 5/)).toBeVisible();
  const finalRevenue = await page.evaluate(() => {
    const raw = window.localStorage.getItem('tunea-tu-combi:save:v1');
    if (!raw) return 0;
    const saved = JSON.parse(raw) as {
      completedLevels?: Record<string, { bestRevenue?: number }>;
    };
    return saved.completedLevels?.['hora-punta']?.bestRevenue ?? 0;
  });
  expect(finalRevenue).toBe(110);
});

async function completeRoute(page: Page, deliveries: readonly (readonly [string, string])[]): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'PLAYING');
  const delivery = page.locator('[data-ui="deliver"]');
  const revenue = page.locator('[data-ui="revenue"]');
  await page.keyboard.down('d');
  for (const [deliveryLabel, expectedRevenue] of deliveries) {
    await interactUntil(page, delivery, deliveryLabel);
    await interactUntil(page, revenue, expectedRevenue);
  }
  await expect(page.locator('#app')).toHaveAttribute('data-app-state', 'RESULTS', { timeout: 30_000 });
  await page.keyboard.up('d');
  await expect(page.getByRole('heading', { name: 'Cuota alcanzada' })).toBeVisible();
}
