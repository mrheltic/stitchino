import { expect, test } from '@playwright/test';

test('the guided tour makes a first pattern and walks through the editor', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'en'));
  await page.goto('./#/guide');
  await page.getByRole('button', { name: 'Take the guided tour' }).click();
  const card = page.getByRole('dialog');
  await expect(card).toContainText('Welcome to Stitchino');
  await card.getByRole('button', { name: 'Start' }).click();
  await expect(card).toContainText("Here's your pattern");
  for (const title of ['Framing', 'Adjustments', 'Size and fabric', 'Colours', 'Pick a version']) {
    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card).toContainText(title);
  }
  await card.getByRole('button', { name: 'Next' }).click();
  await expect(card).toContainText('Use the highlighted button');
  const create = page.getByRole('button', { name: 'Create the project' });
  await expect(create).toBeEnabled({ timeout: 60_000 });
  await create.click();

  await expect(card).toContainText('Your threads');
  for (const title of ['Tools', 'Export', 'Stitching mode', "You're ready"]) {
    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card).toContainText(title);
  }
  await card.getByRole('button', { name: 'Finish' }).click();
  await expect(card).toBeHidden();
});
