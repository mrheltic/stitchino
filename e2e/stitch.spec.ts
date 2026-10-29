import { expect, test, type Page } from '@playwright/test';
import { fromPhoto } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('puntocroce.lang', 'it'));
});

/** Drags (mouse) or swipes (touch) across the canvas, between fractions of its size. */
async function stroke(page: Page, from: [number, number], to: [number, number], touch: boolean) {
  const canvas = page.getByRole('img', { name: /^Schema da ricamare/ });
  const box = (await canvas.boundingBox())!;
  const at = ([fx, fy]: [number, number]) => [box.x + box.width * fx, box.y + box.height * fy];
  const [x0, y0] = at(from);
  const [x1, y1] = at(to);
  if (touch) {
    // Real touch input through the Chrome DevTools protocol (Playwright only has taps).
    const cdp = await page.context().newCDPSession(page);
    const touchAt = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    await touchAt('touchStart', x0, y0);
    for (let k = 1; k <= 10; k++)
      await touchAt('touchMove', x0 + ((x1 - x0) * k) / 10, y0 + ((y1 - y0) * k) / 10);
    await touchAt('touchEnd', x1, y1);
    await cdp.detach();
    return;
  }
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 10 });
  await page.mouse.up();
}

test('marks stitches, undoes, and keeps progress after a reload', async ({ page, isMobile }) => {
  await fromPhoto(page, 'Da ricamare');
  await page.getByRole('link', { name: 'Ricama' }).click();
  const percent = page.getByTestId('stitch-percent');
  await expect(percent).toHaveText('0%');

  await stroke(page, [0.1, 0.5], [0.9, 0.5], isMobile);
  await expect(percent).not.toHaveText('0%');
  const marked = (await percent.textContent())!;

  await page.getByRole('button', { name: 'Annulla', exact: true }).click();
  await expect(percent).toHaveText('0%');
  await page.getByRole('button', { name: 'Ripeti' }).click();
  await expect(percent).toHaveText(marked);

  await page.getByRole('button', { name: /Prossimo punto/ }).click();
  await page.waitForTimeout(800); // autosave runs shortly after the last mark
  await page.reload();
  await expect(page.getByTestId('stitch-percent')).toHaveText(marked);

  await page.getByRole('link', { name: 'Progetti' }).first().click();
  await expect(page.getByText(`Ricamato al ${marked}`)).toBeVisible();
});
