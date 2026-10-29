import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export const scene = fileURLToPath(new URL('./fixtures/scene.png', import.meta.url));

/** Creates a project from the test photo, `width` stitches wide, and waits for the editor. */
export async function fromPhoto(page: Page, title: string, width = 40) {
  await page.goto('./#/new');
  await page.getByTestId('photo-input').setInputFiles(scene);
  await page.getByRole('button', { name: /Dimensioni e tessuto/ }).click();
  await page.getByRole('spinbutton', { name: 'Larghezza' }).fill(String(width));
  await page.getByRole('button', { name: /Crea lo schema/ }).click();
  await page.getByLabel('Nome del progetto').fill(title);
  const create = page.getByRole('button', { name: 'Crea il progetto' });
  await expect(create).toBeEnabled({ timeout: 20_000 });
  await create.click();
  await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
}
