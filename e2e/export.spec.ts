import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const scene = fileURLToPath(new URL('./fixtures/scene.png', import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

async function fromPhoto(page: Page, title: string) {
  await page.goto('./#/new');
  await page.getByTestId('photo-input').setInputFiles(scene);
  await page.getByRole('button', { name: /Dimensioni e tessuto/ }).click();
  await page.getByRole('spinbutton', { name: 'Larghezza' }).fill('40');
  await page.getByRole('button', { name: /Crea lo schema/ }).click();
  await page.getByLabel('Nome del progetto').fill(title);
  const create = page.getByRole('button', { name: 'Crea il progetto' });
  await expect(create).toBeEnabled({ timeout: 20_000 });
  await create.click();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
}

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
