import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

async function newBlank(page: Page, title: string) {
  await page.goto('./#/new?blank=1');
  await page.getByLabel('Nome del progetto').fill(title);
  await page.getByRole('spinbutton', { name: 'Larghezza in punti' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Altezza in punti' }).fill('20');
  await page.getByRole('button', { name: 'Crea lo schema' }).click();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const canvas = page.getByRole('img', { name: /^Schema/ });
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 8 });
  await page.mouse.up();
}

test('adds a colour, draws, undoes and keeps the work after a reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse drawing is covered on desktop and tablet');
  await newBlank(page, 'Prova editor');
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Aggiungi un colore' });
  await dialog.getByLabel('Cerca per codice o nome').fill('310');
  await dialog.getByRole('button', { name: /^310 Black/ }).click();
  await expect(page.getByText('DMC 310').first()).toBeVisible();

  await drag(page, [0.3, 0.5], [0.7, 0.5]);
  const count = page.getByTestId('stitch-count').first();
  await expect(count).toHaveText(/^([5-9]|1[0-9])$/);
  const drawn = (await count.textContent())!;

  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(count).toHaveText('0');
  await page.getByRole('button', { name: 'Ripeti' }).click();
  await expect(count).toHaveText(drawn);

  await expect(page.getByText('Salvato', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('stitch-count').first()).toHaveText(drawn);
});

test('changes view mode and resizes the canvas', async ({ page }) => {
  await newBlank(page, 'Vista');
  await page.getByLabel('Vista', { exact: true }).selectOption('symbols');
  await page.getByRole('button', { name: 'Altre azioni' }).click();
  await page.getByRole('menuitem', { name: 'Dimensioni della tela' }).click();
  const dialog = page.getByRole('dialog', { name: 'Dimensioni della tela' });
  await dialog.getByRole('spinbutton', { name: 'Larghezza in punti' }).fill('30');
  await dialog.getByRole('button', { name: 'Ridimensiona' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Salvato', { exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('link', { name: 'Progetti' }).click();
  await expect(page.getByText('30 × 20 punti')).toBeVisible();
});
