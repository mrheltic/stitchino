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

test('the last stitch opens the finish screen, then home asks for a backup', async ({
  page,
  isMobile,
}) => {
  await fromPhoto(page, 'Da finire');
  await page.getByRole('link', { name: 'Ricama' }).click();
  // On a phone the "works offline" notice of the first visit sits over the tools.
  const notice = page.getByRole('status').filter({ hasText: 'funziona anche offline' });
  if (isMobile) {
    await expect(notice).toBeVisible();
    await notice.getByRole('button').click();
  }
  await page.getByRole('button', { name: 'Segna un rettangolo' }).click();
  await stroke(page, [0.01, 0.01], [0.99, 0.99], isMobile);
  await expect(page.getByTestId('stitch-percent')).toHaveText('100%');

  const finish = page.getByRole('dialog', { name: 'Ricamo completato!' });
  await expect(finish.getByText("«Da finire» è finito, fino all'ultimo punto.")).toBeVisible();
  await expect(finish.getByTestId('finish-picture')).toBeVisible();
  await expect(finish.getByRole('link', { name: 'Offrimi un caffè' })).toBeVisible();
  const picture = page.waitForEvent('download');
  await finish.getByRole('button', { name: "Scarica l'immagine" }).click();
  expect((await picture).suggestedFilename()).toBe('Da-finire-stitchino.png');

  await finish.getByRole('link', { name: 'Torna ai progetti' }).click();
  await expect(page.getByText('Ricamato al 100%')).toBeVisible();
  const reminder = page.getByRole('region', { name: 'Copia di sicurezza' });
  await expect(reminder.getByText(/Hai segnato .+ punti e non hai ancora una copia/)).toBeVisible();
  const backup = page.waitForEvent('download');
  await reminder.getByRole('button', { name: 'Scarica la copia' }).click();
  expect((await backup).suggestedFilename()).toMatch(/\.stitchino-backup$/);
  await expect(page.getByText(/^Copia scaricata\./)).toBeVisible();
  await page.reload();
  await expect(page.getByText('Ricamato al 100%')).toBeVisible();
  await expect(reminder).toBeHidden();
});
