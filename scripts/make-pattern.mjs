// Makes a free pattern for the library with the real app: the project file and the stitched
// preview land in site/patterns/<slug>/. Needs a build first (npm run build).
//
//   node scripts/make-pattern.mjs <picture> <slug> [--width 120] [--colors 24] [--background]
//
// --background leaves the background unstitched (the subject is found automatically).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const [picture, slug] = args.filter(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(width|colors)$/),
);
if (!picture || !slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error(
    'Usage: node scripts/make-pattern.mjs <picture> <slug> [--width N] [--colors N] [--background]',
  );
  process.exit(1);
}
const width = option('width');
const colors = option('colors');
const out = resolve('site/patterns', slug);
const port = 4317;
const base = `http://localhost:${port}/`;

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  stdio: 'ignore',
});
const stop = () => server.kill();
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      // not up yet
    }
    if (i > 100) throw new Error('vite preview did not start (did you run npm run build?)');
    await new Promise((r) => setTimeout(r, 200));
  }

  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.setItem('puntocroce.lang', 'en');
    localStorage.setItem('puntocroce.tour', JSON.stringify({ state: { status: 'done' } }));
  });
  const page = await context.newPage();
  await page.goto(`${base}#/new`);
  await page.getByTestId('photo-input').setInputFiles(resolve(picture));
  await page.getByRole('button', { name: 'Create the project' }).waitFor();

  if (width) {
    await page.getByRole('button', { name: /^4 Size and fabric/ }).click();
    await page.getByRole('spinbutton', { name: /^Width/ }).fill(width);
  }
  if (colors) {
    await page.getByRole('button', { name: /^5 Colours/ }).click();
    const thumb = page.getByRole('slider', { name: 'Maximum number of colours' });
    const now = Number(await thumb.getAttribute('aria-valuenow'));
    const steps = Number(colors) - now;
    await thumb.focus();
    for (let i = 0; i < Math.abs(steps); i++)
      await page.keyboard.press(steps > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  if (args.includes('--background')) {
    await page.getByRole('button', { name: /^3 Adjustments/ }).click();
    await page.getByRole('checkbox', { name: 'Leave the background unstitched' }).check();
    await page.getByText('Looking for the subject…').waitFor({ state: 'hidden', timeout: 60_000 });
  }

  await page.getByRole('button', { name: /^6 Create the pattern/ }).click();
  await page.getByLabel('Project name').fill(slug);
  const create = page.getByRole('button', { name: 'Create the project' });
  await create.waitFor();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].some(
        (b) => b.textContent?.includes('Create the project') && !b.disabled,
      ),
    null,
    { timeout: 120_000 },
  );
  await create.click();
  await page.getByRole('button', { name: 'Export', exact: true }).waitFor({ timeout: 60_000 });

  mkdirSync(out, { recursive: true });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Project file', { exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Download/ }).click();
  copyFileSync(await (await pending).path(), resolve(out, 'pattern.stitchino'));
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Real size' }).click();
  await page.getByText('From afar', { exact: true }).click();
  await page.waitForTimeout(3500);
  const jpeg = await page.getByRole('img', { name: 'From afar', exact: true }).evaluate((c) => {
    const w = Math.min(1000, c.width);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = Math.round((c.height * w) / c.width);
    small.getContext('2d').drawImage(c, 0, 0, small.width, small.height);
    return small.toDataURL('image/jpeg', 0.84);
  });
  writeFileSync(resolve(out, 'preview.jpg'), Buffer.from(jpeg.split(',')[1], 'base64'));
  await browser.close();
  console.log(`Done: site/patterns/${slug}/ (now add it to FREE_PATTERNS in site/patterns.ts)`);
} finally {
  stop();
}
