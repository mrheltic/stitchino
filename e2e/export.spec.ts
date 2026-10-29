import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fromPhoto } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

async function download(page: Page): Promise<{ name: string; bytes: Buffer }> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Scarica/ }).click();
  const d = await pending;
  return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
}

test('exports the chart PDF and an OXS file that opens again', async ({ page }) => {
  await fromPhoto(page, 'Casetta da esportare');
  await page.getByRole('button', { name: 'Esporta', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Esporta lo schema' });
  await expect(dialog.getByText(/pagin[ae] di schema/)).toBeVisible();

  const pdf = await download(page);
  expect(pdf.name).toBe('Casetta-da-esportare.pdf');
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(dialog.getByText(/^Pronto: Casetta-da-esportare\.pdf/)).toBeVisible();

  await dialog.getByText('Per Pattern Keeper').click();
  const pk = await download(page);
  expect(pk.name).toBe('Casetta-da-esportare-pattern-keeper.pdf');

  await dialog.getByText('File OXS').click();
  const oxs = await download(page);
  expect(oxs.name).toBe('Casetta-da-esportare.oxs');
  expect(oxs.bytes.toString()).toContain('<chart>');

  await page.keyboard.press('Escape');
  await page.getByRole('navigation').getByRole('link', { name: 'Progetti' }).click();
  await page.getByLabel('Apri un file').setInputFiles({
    name: 'scambio.oxs',
    mimeType: 'application/xml',
    buffer: oxs.bytes,
  });
  await expect(page.getByText('File OXS aperto.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Casetta da esportare', exact: true }),
  ).toBeVisible();
});
