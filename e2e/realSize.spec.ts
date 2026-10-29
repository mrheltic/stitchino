import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

test('shows the framed preview, measures and downloads the 1:1 PDF', async ({ page }) => {
  await page.goto('./#/new?blank=1');
  await page.getByLabel('Nome del progetto').fill('Misure');
  await page.getByRole('spinbutton', { name: 'Larghezza in punti' }).fill('140');
  await page.getByRole('spinbutton', { name: 'Altezza in punti' }).fill('70');
  await page.getByRole('button', { name: 'Crea lo schema' }).click();
  await page.getByRole('link', { name: 'Dimensione reale' }).click();

  await expect(page.getByRole('heading', { name: 'Dimensione reale' })).toBeVisible();
  await expect(page.getByText('25,4 × 12,7 cm')).toBeVisible();
  await expect(page.getByRole('img', { name: 'In cornice' })).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica il PDF 1:1' }).click();
  const file = await (await download).path();
  const bytes = readFileSync(file);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
});
