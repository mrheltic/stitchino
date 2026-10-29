import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fromPhoto } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

test('imports a chart PDF, checks it and opens it for stitching', async ({ page }) => {
  await fromPhoto(page, 'Comprato', 50);
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  await page.getByText('Per Pattern Keeper').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Scarica/ }).click();
  const pdf = readFileSync((await (await pending).path())!);
  await page.keyboard.press('Escape');

  await page.goto('./#/import-pdf');
  await page.getByTestId('pdf-input').setInputFiles({
    name: 'schema.pdf',
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await expect(page.getByRole('heading', { name: 'Controlla lo schema' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText(/^Schema di 50 × \d+ punti, \d+ colori, da 1 pagina\./),
  ).toBeVisible();
  await expect(page.getByText('Filo da scegliere')).toHaveCount(0);
  await page.getByRole('button', { name: 'Importa e ricama' }).click();

  await expect(page.getByTestId('stitch-percent')).toHaveText('0%');
  await page.getByRole('link', { name: 'Progetti' }).first().click();
  await expect(page.getByText(/importato, uso personale/)).toBeVisible();
});
