import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rgbToHex } from '../src/core/color/srgb.ts';
import { decodeProject } from '../src/core/io/projectFile.ts';
import { countStitches, type Pattern } from '../src/core/model/pattern.ts';
import { chartPdf, type Paper } from '../src/core/pdf/export/chartPdf.ts';
import { finishedSize, mmToCm, mmToInches } from '../src/core/size/fabric.ts';
import { getThread } from '../src/core/threads/catalog.ts';
import { standaloneT } from '../src/i18n/standalone.ts';
import { chartLabels } from '../src/ui/export/labels.ts';
import {
  landingPage,
  patternPage,
  patternPath,
  patternsIndex,
  sitemap,
  type Page,
  type PatternInfo,
} from './pages.ts';
import { FREE_PATTERNS, type FreePattern } from './patterns.ts';
import { LANGS, PATHS, type Lang } from './text.ts';

export interface SiteFile {
  /** Path in the build output, relative to the app. */
  fileName: string;
  source: string | Uint8Array;
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Everything the static pages need: landing pages, the free pattern library (pages, PDFs,
 * pictures) and the sitemap. Runs in Node at build time, from the repository root.
 */
export async function buildSite(
  root: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<SiteFile[]> {
  const read = (p: string) => new Uint8Array(readFileSync(join(root, p)));
  const fonts = {
    symbols: read('public/fonts/pc-symbols.ttf'),
    text: read('public/fonts/AtkinsonHyperlegible-Regular.ttf'),
    bold: read('public/fonts/AtkinsonHyperlegible-Bold.ttf'),
  };
  const labels = {
    en: chartLabels(await standaloneT('en'), 'en'),
    it: chartLabels(await standaloneT('it'), 'it'),
  };
  const files: SiteFile[] = [
    { fileName: 'site/site.css', source: readFileSync(join(root, 'site/site.css'), 'utf8') },
    { fileName: 'site/hero.jpg', source: read('docs/images/hero.jpg') },
  ];

  const infos: PatternInfo[] = [];
  const newestFirst = [...FREE_PATTERNS].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of newestFirst) {
    const dir = `site/patterns/${entry.slug}`;
    const out = `patterns/${entry.slug}/`;
    const bundle = decodeProject(read(`${dir}/pattern.stitchino`));
    // The app downloads the stitched preview as PNG; a JPEG is lighter and also goes on the cover.
    const previewName = existsSync(join(root, dir, 'preview.jpg')) ? 'preview.jpg' : 'preview.png';
    const preview = read(`${dir}/${previewName}`);
    const jpeg = previewName.endsWith('.jpg');
    const pdf = (lang: Lang, paper: Paper, patternKeeper = false) => {
      const pattern: Pattern = {
        ...bundle.pattern,
        meta: { ...bundle.pattern.meta, title: entry.title[lang] },
      };
      return chartPdf(pattern, {
        paper,
        style: 'color',
        columns: 60,
        overlap: patternKeeper ? 0 : 2,
        cover: !patternKeeper,
        pageMap: !patternKeeper,
        patternKeeper,
        labels: labels[lang],
        fonts,
        coverImage: patternKeeper || !jpeg ? undefined : preview,
      });
    };
    const info = describe(entry, bundle.pattern, bundle.source?.settings, previewName);
    const sourceExt = bundle.source && IMAGE_EXT[bundle.source.mime];
    if (bundle.source && sourceExt) {
      info.files.source = `source.${sourceExt}`;
      files.push({ fileName: out + info.files.source, source: bundle.source.bytes });
    }
    files.push(
      { fileName: out + info.files.preview, source: preview },
      { fileName: out + info.files.a4, source: await pdf('en', 'a4') },
      { fileName: out + info.files.letter, source: await pdf('en', 'letter') },
      { fileName: out + info.files.patternKeeper, source: await pdf('en', 'a4', true) },
      { fileName: out + info.files.a4It, source: await pdf('it', 'a4') },
    );
    infos.push(info);
  }

  const pages: Page[] = LANGS.flatMap((lang) => [
    landingPage(lang),
    patternsIndex(lang, infos),
    ...infos.map((info) => patternPage(lang, info)),
  ]);
  for (const page of pages) files.push({ fileName: `${page.path}index.html`, source: page.html });
  files.push({ fileName: 'sitemap.xml', source: sitemap(['', ...pages.map((p) => p.path)], date) });
  return files;
}

function describe(
  entry: FreePattern,
  pattern: Pattern,
  settings: unknown,
  preview: string,
): PatternInfo {
  const counts = countStitches(pattern);
  const threads = pattern.palette
    .map((p) => {
      const c = counts.get(p.id);
      const found = p.threads.map((ref) => getThread(ref));
      return {
        label: p.threads.map((ref) => `${ref.brand} ${ref.code}`).join(' + '),
        name: found.map((th) => th?.name ?? '').join(' + '),
        hex: found[0] ? rgbToHex(found[0].rgb) : '#cccccc',
        stitches: c ? c.full + c.half + c.quarter + c.threeQuarter : 0,
      };
    })
    .filter((th) => th.stitches > 0)
    .sort((a, b) => b.stitches - a.stitches);
  const brands = pattern.palette.flatMap((p) => p.threads.map((t) => t.brand));
  const brand = brands.filter((b) => b === 'Anchor').length > brands.length / 2 ? 'Anchor' : 'DMC';
  const size = finishedSize(pattern.width, pattern.height, { count: 14, over: 1 });
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const positive = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : d;
  return {
    entry,
    width: pattern.width,
    height: pattern.height,
    brand,
    stitches: threads.reduce((sum, th) => sum + th.stitches, 0),
    finishedCm: [round1(mmToCm(size.widthMm)), round1(mmToCm(size.heightMm))],
    finishedIn: [round1(mmToInches(size.widthMm)), round1(mmToInches(size.heightMm))],
    threads,
    files: {
      preview,
      a4: `${entry.slug}-cross-stitch-pattern-a4.pdf`,
      letter: `${entry.slug}-cross-stitch-pattern-letter.pdf`,
      patternKeeper: `${entry.slug}-pattern-keeper.pdf`,
      a4It: `${entry.slugIt}-schema-punto-croce-a4.pdf`,
    },
    settings: {
      width: positive(s.width, pattern.width),
      colors: positive(s.maxColors, pattern.palette.length),
    },
  };
}

/** Folders of every static page, for links from the app and for tests. */
export function sitePaths(): string[] {
  return LANGS.flatMap((lang) => [
    PATHS.landing[lang],
    PATHS.patterns[lang],
    ...FREE_PATTERNS.map((e) => patternPath(lang, e)),
  ]);
}
