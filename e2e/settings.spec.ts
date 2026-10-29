import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

test('a backup made here restores everything on another device', async ({ page, browser }) => {
  await page.goto('./#/new?blank=1');
  await page.getByLabel('Nome del progetto').fill('Da salvare');
  await page.getByRole('button', { name: 'Crea lo schema' }).click();
  await expect(page.getByRole('button', { name: 'Da salvare', exact: true })).toBeVisible();

  await page.goto('./#/settings');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Scarica la copia' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/^stitchino-\d{4}-\d{2}-\d{2}\.stitchino-backup$/);
  const backup = readFileSync((await download.path())!);

  const other = await browser.newContext();
  const there = await other.newPage();
  await there.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
  await there.goto('./#/settings');
  await there.getByLabel('Ripristina una copia').setInputFiles({
    name: 'copia.stitchino-backup',
    mimeType: 'application/zip',
    buffer: backup,
  });
  await expect(there.getByText('Ripristinato 1 progetto.')).toBeVisible();
  await there.getByRole('navigation').getByRole('link', { name: 'Progetti' }).click();
  await expect(there.getByRole('link', { name: 'Da salvare' })).toBeVisible();
  await other.close();
});

test('guide, support and privacy pages', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Scegli una foto', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Prima volta col punto croce? Leggi la guida' }).click();
  await expect(page.getByRole('heading', { name: 'Leggere lo schema' })).toBeVisible();
  await page.getByText('Funziona con Pattern Keeper?').click();
  await expect(page.getByText(/scegliendo «Per Pattern Keeper»/)).toBeVisible();

  await page.getByRole('link', { name: '♥ Sostieni Stitchino' }).click();
  await expect(page.getByRole('heading', { name: 'Sostieni Stitchino' })).toBeVisible();
  await page.getByRole('link', { name: 'Privacy e condizioni' }).click();
  await expect(page.getByText(/Non ci sono account, cookie/)).toBeVisible();
});
