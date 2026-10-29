import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { scene } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

test('keeps a thread stash, converts with it and lists what to buy', async ({ page }) => {
  await page.goto('./#/inventory');
  await page.getByLabel('Più codici insieme').fill('310, blanc, 321, 3865, 700-703');
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  await expect(page.getByText('Aggiunti 8 fili.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '8 colori · 8 matasse' })).toBeVisible();
  await page.getByRole('button', { name: 'Una matassa in più di DMC 310' }).click();
  await expect(page.getByLabel('Matasse di DMC 310')).toHaveValue('2');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Esporta CSV' }).click();
  const csv = readFileSync((await (await pending).path())!).toString();
  expect(csv).toContain('DMC,310,Black,2');

  // A pattern made only with these threads.
  await page.goto('./#/new');
  await page.getByTestId('photo-input').setInputFiles(scene);
  await page.getByRole('button', { name: /Dimensioni e tessuto/ }).click();
  await page.getByRole('spinbutton', { name: 'Larghezza' }).fill('40');
  await page.getByRole('button', { name: /^5 Colori/ }).click();
  await expect(page.getByText('Nel tuo inventario ci sono 8 fili.')).toBeVisible();
  await page.getByText('Solo i miei', { exact: true }).click();
  await page.getByRole('button', { name: /Crea lo schema/ }).click();
  await page.getByLabel('Nome del progetto').fill('Coi miei fili');
  const create = page.getByRole('button', { name: 'Crea il progetto' });
  await expect(create).toBeEnabled({ timeout: 20_000 });
  await create.click();
  await expect(page.getByRole('button', { name: 'Coi miei fili', exact: true })).toBeVisible();

  // The shopping list only has threads from the stash.
  await page.getByRole('link', { name: 'Dimensione reale' }).click();
  await expect(page.getByRole('columnheader', { name: 'Da comprare' })).toBeVisible();
  const rows = page.locator('tbody tr');
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(8);
  for (const code of await rows.locator('td:first-child .font-medium').allTextContents())
    expect([
      'DMC 310',
      'DMC Blanc',
      'DMC 321',
      'DMC 3865',
      'DMC 700',
      'DMC 701',
      'DMC 702',
      'DMC 703',
    ]).toContain(code);
});
