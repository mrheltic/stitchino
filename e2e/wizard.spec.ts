import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const scene = fileURLToPath(new URL('./fixtures/scene.png', import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

test('creates a project from a photo and lists it on the home page', async ({ page }) => {
  await page.goto('./#/new');
  await page.getByTestId('photo-input').setInputFiles(scene);
  await expect(page.getByRole('img', { name: 'Foto da ritagliare' })).toBeVisible();

  await page.getByRole('button', { name: /Dimensioni e tessuto/ }).click();
  const width = page.getByRole('spinbutton', { name: 'Larghezza' });
  await width.fill('60');
  await expect(page.getByText('× 45 punti')).toBeVisible();

  await page.getByRole('button', { name: /Crea lo schema/ }).click();
  await page.getByLabel('Nome del progetto').fill('Casetta al sole');
  const create = page.getByRole('button', { name: 'Crea il progetto' });
  await expect(create).toBeEnabled({ timeout: 20_000 });
  await create.click();

  await expect(page).toHaveURL(/#\/project\/[0-9a-f-]+$/);
  await expect(page.getByRole('button', { name: 'Casetta al sole', exact: true })).toBeVisible();
  await expect(page.getByTitle('Colore attivo')).toContainText('DMC');

  await page.getByRole('navigation').getByRole('link', { name: 'Progetti' }).click();
  await expect(page.getByRole('link', { name: 'Casetta al sole' })).toBeVisible();
  await expect(page.getByText('60 × 45 punti')).toBeVisible();
});

test('creates a blank pattern', async ({ page }) => {
  await page.goto('./#/new?blank=1');
  await page.getByLabel('Nome del progetto').fill('Bordo');
  await page.getByRole('spinbutton', { name: 'Larghezza in punti' }).fill('40');
  await page.getByRole('button', { name: 'Crea lo schema' }).click();
  await expect(page.getByRole('button', { name: 'Bordo', exact: true })).toBeVisible();
});
