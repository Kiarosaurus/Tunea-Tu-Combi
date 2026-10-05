import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const artifactUrl = pathToFileURL(resolve(import.meta.dirname, '../../dist/index.html')).href;

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
