// Draws the Pinterest pins of the free patterns (1000 × 1500, English and Italian) into
// site/pins/, with a CSV for Pinterest's bulk upload. Needs a build first (npm run build); the
// pins go online with the next deploy, which the CSV's image links point to.
//
//   node scripts/pins.mjs [--start YYYY-MM-DD]
//
// The CSV schedules one pattern a day from --start (default: tomorrow), the English pin in the
// morning and the Italian one in the evening (UTC). Pinterest accepts dates up to two weeks ahead.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE = 'https://mrheltic.github.io/stitchino/';
const BOARD = { en: 'Free cross stitch patterns', it: 'Schemi punto croce gratis' };
const TEXT = {
  en: {
    kicker: 'Free cross stitch pattern',
    original: 'Original',
    size: (w, h) => `${w} × ${h} stitches`,
    colours: (n, brand) => `${n} ${brand} colours`,
    pdf: 'PDF + Pattern Keeper',
    title: (t) => `${t} · free cross stitch pattern (PDF)`,
    description: (p) =>
      `${p.description.en} Free PDF pattern: ${p.width} × ${p.height} stitches, ${p.colours} ${p.brand} colours, about ${p.finishedCm[0]} × ${p.finishedCm[1]} cm on 14-count Aida, with a version for Pattern Keeper. Made with Stitchino, the free app that turns your photos into cross-stitch patterns.`,
    keywords:
      'cross stitch, free cross stitch pattern, cross stitch pdf, embroidery, pattern keeper',
  },
  it: {
    kicker: 'Schema punto croce gratis',
    original: 'Originale',
    size: (w, h) => `${w} × ${h} punti`,
    colours: (n, brand) => `${n} colori ${brand}`,
    pdf: 'PDF + Pattern Keeper',
    title: (t) => `${t} · schema punto croce gratis (PDF)`,
    description: (p) =>
      `${p.description.it} Schema gratuito in PDF: ${p.width} × ${p.height} punti, ${p.colours} colori ${p.brand}, circa ${String(p.finishedCm[0]).replace('.', ',')} × ${String(p.finishedCm[1]).replace('.', ',')} cm su Aida 14, con la versione per Pattern Keeper. Fatto con Stitchino, l'app gratuita che trasforma le tue foto in schemi a punto croce.`,
    keywords:
      'punto croce, schema punto croce gratis, schemi punto croce pdf, ricamo, pattern keeper',
  },
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fileUrl = (p) => pathToFileURL(resolve(p)).href;

function page(p, lang) {
  const t = TEXT[lang];
  const dir = `dist/patterns/${p.slug}`;
  const source = p.files.source
    ? `<figure class="orig"><img src="${fileUrl(`${dir}/${p.files.source}`)}"><figcaption>${t.original}</figcaption></figure>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: AH; src: url('${fileUrl('public/fonts/AtkinsonHyperlegible-Regular.ttf')}'); }
@font-face { font-family: AH; font-weight: 700; src: url('${fileUrl('public/fonts/AtkinsonHyperlegible-Bold.ttf')}'); }
* { box-sizing: border-box; }
html, body { margin: 0; }
.pin { width: 1000px; height: 1500px; display: flex; flex-direction: column; padding: 64px 64px 52px;
  background: #faf7f2; color: #2b2420; font-family: AH, sans-serif; }
.kicker { margin: 0; color: #9e2f45; font-weight: 700; font-size: 30px; letter-spacing: 0.08em; text-transform: uppercase; }
h1 { margin: 14px 0 6px; font-size: 76px; line-height: 1.05; letter-spacing: -0.01em; }
.by { margin: 0; color: #6b625b; font-size: 32px; }
.art { position: relative; flex: 1 1 0; min-height: 0; margin: 40px 0 34px; display: flex; align-items: center; justify-content: center; }
.stitched { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 22px; background: #fff;
  box-shadow: 0 2px 6px rgb(60 30 40 / .12), 0 18px 48px rgb(60 30 40 / .18); }
.orig { position: absolute; left: -10px; bottom: -14px; margin: 0; padding: 10px 10px 6px; background: #fff;
  border-radius: 16px; box-shadow: 0 6px 22px rgb(60 30 40 / .22); text-align: center; }
.orig img { display: block; max-width: 230px; max-height: 190px; border-radius: 10px; }
.orig figcaption { margin-top: 6px; font-size: 22px; color: #6b625b; }
.facts { display: flex; flex-wrap: wrap; gap: 14px; margin: 0; padding: 0; list-style: none; }
.facts li { padding: 12px 22px; border-radius: 999px; background: #fff; border: 2px solid #e4dbcf; font-size: 28px; font-weight: 700; }
footer { display: flex; align-items: center; gap: 16px; margin-top: 34px; font-size: 30px; }
footer img { width: 58px; height: 58px; }
footer b { font-size: 36px; }
footer span { margin-left: auto; color: #6b625b; }
</style></head><body><div class="pin">
<p class="kicker">${t.kicker}</p>
<h1>${esc(p.title[lang])}</h1>
<p class="by">${esc(p.byline[lang])}</p>
<div class="art"><img class="stitched" src="${fileUrl(`${dir}/${p.files.preview}`)}">${source}</div>
<ul class="facts"><li>${t.size(p.width, p.height)}</li><li>${t.colours(p.colours, p.brand)}</li><li>${t.pdf}</li></ul>
<footer><img src="${fileUrl('public/favicon.svg')}"><b>Stitchino</b><span>mrheltic.github.io/stitchino</span></footer>
</div></body></html>`;
}

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;

const startArg = process.argv.indexOf('--start');
const start =
  startArg > 0 ? new Date(`${process.argv[startArg + 1]}T00:00:00Z`) : new Date(Date.now() + 864e5);
const patterns = JSON.parse(readFileSync('dist/patterns/index.json', 'utf8'));
mkdirSync('site/pins', { recursive: true });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const tab = await browser.newPage({ viewport: { width: 1000, height: 1500 } });
const rows = [
  [
    'Title',
    'Media URL',
    'Pinterest board',
    'Thumbnail',
    'Description',
    'Link',
    'Publish date',
    'Keywords',
  ],
];
const tmp = join(tmpdir(), `stitchino-pin-${process.pid}.html`);
for (const [day, p] of patterns.entries()) {
  for (const lang of ['en', 'it']) {
    writeFileSync(tmp, page(p, lang));
    await tab.goto(pathToFileURL(tmp).href);
    await tab.evaluate(() => document.fonts.ready);
    const name = `${p.slug}-${lang}.jpg`;
    await tab.locator('.pin').screenshot({ path: `site/pins/${name}`, type: 'jpeg', quality: 86 });
    const when = new Date(start.getTime() + day * 864e5 + (lang === 'en' ? 9 : 18) * 36e5);
    rows.push([
      TEXT[lang].title(p.title[lang]),
      `${SITE}pins/${name}`,
      BOARD[lang],
      '',
      TEXT[lang].description(p),
      `${SITE}${p.pages[lang]}`,
      when.toISOString().slice(0, 19),
      TEXT[lang].keywords,
    ]);
  }
}
await browser.close();
writeFileSync(
  'site/pins/pinterest.csv',
  rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n',
);
console.log(`${rows.length - 1} pins in site/pins/, CSV in site/pins/pinterest.csv`);
