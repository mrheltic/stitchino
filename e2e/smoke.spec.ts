import { expect, test } from '@playwright/test';

test('home page loads in Italian and switches to English', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Trasforma una foto in uno schema a punto croce',
  );
  await page.getByRole('link', { name: 'Impostazioni' }).click();
  await page.getByText('English', { exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});

test('dark theme follows the setting', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByText(/^(Scuro|Dark)$/).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('symbol font is served', async ({ request }) => {
  const res = await request.get('./fonts/pc-symbols.ttf');
  expect(res.ok()).toBe(true);
  expect((await res.body()).length).toBeGreaterThan(10_000);
});
