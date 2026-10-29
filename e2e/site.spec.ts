import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'en'));
});

test('the English landing page opens the photo wizard', async ({ page }) => {
  await page.goto('./photo-to-cross-stitch-pattern/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Turn a photo into a cross-stitch pattern, free',
  );
  await page.locator('.hero').getByRole('link', { name: 'Open Stitchino' }).click();
  await expect(page.getByRole('heading', { name: 'New pattern from a photo' })).toBeVisible();
});

test('a free pattern opens in the wizard with its picture and settings', async ({ page }) => {
  await page.goto('./patterns/');
  await page.getByRole('link', { name: /Lighthouse at sunset/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lighthouse at sunset');
  await expect(page.getByRole('link', { name: 'For Pattern Keeper' })).toHaveAttribute(
    'href',
    /lighthouse-at-sunset-pattern-keeper\.pdf$/,
  );
  await page.getByRole('link', { name: 'Change the size or colours in Stitchino' }).click();
  await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
  await page.getByRole('button', { name: /Size and fabric/ }).click();
  await expect(page.getByRole('spinbutton', { name: /^Width/ })).toHaveValue('100');
});

test('the wizard can start from an example picture', async ({ page }) => {
  await page.goto('./#/new');
  await page.getByRole('button', { name: 'Try an example' }).click();
  await expect(page.getByRole('img', { name: 'Photo to crop' })).toBeVisible();
});

test('the static pages still load once the offline app is installed', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto('./patterns/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Free cross stitch patterns');
});

test('the Italian pages lead to the English ones', async ({ page }) => {
  await page.goto('./it/schemi/faro-al-tramonto/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Faro al tramonto');
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/patterns\/lighthouse-at-sunset\/$/);
});
