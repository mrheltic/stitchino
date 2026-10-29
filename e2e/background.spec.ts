import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'en'));
});

test('finds the subject, takes brush corrections and adds an outline', async ({ page }) => {
  await page.goto('./#/new');
  await page.getByRole('button', { name: 'Try an example' }).click();
  await page.getByRole('button', { name: /Adjustments/ }).click();
  await page.getByRole('checkbox', { name: 'Leave the background unstitched' }).check();
  await expect(
    page.getByRole('checkbox', { name: 'Find the subject automatically' }),
  ).toBeChecked();
  await expect(page.getByText('Looking for the subject…')).toBeHidden({ timeout: 30_000 });

  // A brush stroke over the photo, then undone.
  await page.getByText('Remove', { exact: true }).click();
  const photo = page.getByRole('img', { name: 'Photo', exact: true });
  const box = (await photo.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const undo = page.getByRole('button', { name: 'Undo the last change' });
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(undo).toBeDisabled();

  await page.getByRole('checkbox', { name: 'Outline the subject in backstitch' }).check();
  await page.getByRole('button', { name: /Create the pattern/ }).click();
  const create = page.getByRole('button', { name: 'Create the project' });
  await expect(create).toBeEnabled({ timeout: 60_000 });
  await create.click();

  // The editor can add another outline, as one undoable step.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Outline' }).click();
  await page.getByRole('button', { name: 'Add the outline' }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
});
