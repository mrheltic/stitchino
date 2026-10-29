import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { createPattern, type Pattern } from '../../src/core/model/pattern.ts';
import { SYMBOLS } from '../../src/core/model/symbols.ts';
import {
  analyzeDocument,
  assembleChart,
  pageTextFromPdfJs,
  parseKeyLine,
  placePages,
  type PageText,
} from '../../src/core/pdf/import/analyze.ts';
import { chartPdf, type ChartPdfOptions } from '../../src/core/pdf/export/chartPdf.ts';
import { buildImportedPattern } from '../../src/core/pdf/import/build.ts';
import { chartLabels } from '../../src/ui/export/labels.ts';

const fonts = {
  symbols: new Uint8Array(readFileSync('public/fonts/pc-symbols.ttf')),
  text: new Uint8Array(readFileSync('public/fonts/AtkinsonHyperlegible-Regular.ttf')),
  bold: new Uint8Array(readFileSync('public/fonts/AtkinsonHyperlegible-Bold.ttf')),
};
const t = (key: string) => key;

/** 130 × 95 stitches, five colours (one a blend) in bands and blobs, some fabric left empty. */
function sample(): Pattern {
  const w = 130;
  const h = 95;
  const p = createPattern(w, h, { meta: { title: 'Import', source: 'blank' } });
  const threads: [string, string?][] = [['310'], ['321'], ['3865'], ['798', '799'], ['702']];
  p.palette = threads.map(([a, b], i) => ({
    id: i + 1,
    threads: [{ brand: 'DMC', code: a }, ...(b ? [{ brand: 'DMC' as const, code: b }] : [])],
    symbol: SYMBOLS[i],
    strands: 2,
    backStrands: 1,
  }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (Math.floor(x / 7) * 3 + Math.floor(y / 5) * 5 + ((x * y) % 3)) % 6;
      p.cells[y * w + x] = v; // 0 leaves the fabric empty
    }
  return p;
}

async function pagesOf(bytes: Uint8Array): Promise<PageText[]> {
  const doc = await getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
  }).promise;
  const out: PageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const [, , w, h] = page.view;
    out.push(pageTextFromPdfJs((await page.getTextContent()).items, w, h));
  }
  return out;
}

function options(o: Partial<ChartPdfOptions>): ChartPdfOptions {
  return {
    paper: 'a4',
    style: 'color',
    columns: 60,
    overlap: 2,
    cover: true,
    pageMap: true,
    patternKeeper: false,
    labels: chartLabels(t, 'it'),
    fonts,
    ...o,
  };
}

async function roundTrip(o: Partial<ChartPdfOptions>) {
  const p = sample();
  const analysis = analyzeDocument(await pagesOf(await chartPdf(p, options(o))));
  const chart = assembleChart(analysis.pages, placePages(analysis.pages));
  return { p, analysis, chart };
}

function expectSameChart(
  p: Pattern,
  chart: ReturnType<typeof assembleChart>,
  key: Map<string, { threads: { code: string }[] }>,
) {
  expect([chart.width, chart.height]).toEqual([p.width, p.height]);
  expect(chart.conflicts).toBe(0);
  const symbolOf = new Map(p.palette.map((e) => [e.id, e.symbol]));
  let wrong = 0;
  for (let i = 0; i < p.cells.length; i++)
    if ((symbolOf.get(p.cells[i]) ?? '') !== chart.cells[i]) wrong++;
  expect(wrong).toBe(0);
  for (const e of p.palette)
    expect(key.get(e.symbol)?.threads.map((x) => x.code)).toEqual(e.threads.map((x) => x.code));
}

describe('reading charts from PDF', () => {
  it('reads back a full PDF with cover, overlap and blends', async () => {
    const { p, analysis, chart } = await roundTrip({});
    expect(analysis.pages).toHaveLength(6);
    expect(analysis.pages.every((x) => x.offset.x !== null && x.offset.y !== null)).toBe(true);
    expect(analysis.unmatched).toEqual([]);
    expectSameChart(p, chart, analysis.key);
  });

  it('reads back the Pattern Keeper preset', async () => {
    const { p, analysis, chart } = await roundTrip({ patternKeeper: true });
    expect(analysis.brand).toBe('DMC');
    expectSameChart(p, chart, analysis.key);
  });

  it('works with small squares and black-and-white pages', async () => {
    const { p, analysis, chart } = await roundTrip({ columns: 80, style: 'bw', overlap: 0 });
    expectSameChart(p, chart, analysis.key);
  });
});

describe('key lines', () => {
  it('takes the first thread and blends, not equivalents or counts', () => {
    expect(parseKeyLine('DMC 310 Black ≈ Anchor 403 2 1134', 'DMC')).toEqual([
      { brand: 'DMC', code: '310' },
    ]);
    expect(parseKeyLine('310 + 321 Black/Red 2', 'DMC').map((x) => x.code)).toEqual(['310', '321']);
    expect(parseKeyLine('Anchor 403 Black', 'DMC')).toEqual([{ brand: 'Anchor', code: '403' }]);
    expect(parseKeyLine('White 2 strands', 'DMC')).toEqual([{ brand: 'DMC', code: 'Blanc' }]);
    expect(parseKeyLine('Backstitch outline', 'DMC')).toEqual([]);
  });
});

describe('other numbering conventions', () => {
  /** A page of 30 × 20 single glyphs, with numbers centred on every tenth cell (1-based). */
  function page(first: number): PageText {
    const items: PageText['items'] = [];
    const cell = 10;
    for (let r = 0; r < 20; r++)
      for (let c = 0; c < 30; c++)
        items.push({
          str: (r + c) % 3 ? '●' : '▲',
          x: 50 + c * cell + 1,
          y: 100 + r * cell + 7,
          w: 8,
          h: 8,
          font: 'sym',
        });
    for (let c = 10; c <= 30; c += 10)
      items.push({
        str: String(first + c),
        x: 50 + (c - 1) * cell + 2,
        y: 95,
        w: 6,
        h: 6,
        font: 'txt',
      });
    for (let r = 10; r <= 20; r += 10)
      items.push({ str: String(r), x: 38, y: 100 + (r - 1) * cell + 7, w: 6, h: 6, font: 'txt' });
    // A key line on the same page, away from the chart.
    items.push({ str: '▲', x: 50, y: 400, w: 8, h: 8, font: 'sym' });
    items.push({ str: 'DMC 310', x: 64, y: 400, w: 30, h: 7, font: 'txt' });
    return { width: 600, height: 800, items };
  }

  it('places pages numbered by cell and reads a key next to the chart', () => {
    const analysis = analyzeDocument([page(0), page(30)]);
    expect(analysis.pages.map((p) => p.offset)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
    const chart = assembleChart(analysis.pages, placePages(analysis.pages));
    expect([chart.width, chart.height]).toEqual([60, 20]);
    expect(analysis.key.get('▲')?.threads).toEqual([{ brand: 'DMC', code: '310' }]);
    expect(analysis.unmatched).toEqual(['●']);
  });
});

describe('building the imported pattern', () => {
  it('maps symbols to threads, most used first, with stand-ins for unknown ones', () => {
    const chart = { width: 3, height: 2, cells: ['●', '●', 'Q', '', '●', 'Q'], conflicts: 0 };
    const p = buildImportedPattern(chart, new Map([['●', [{ brand: 'DMC', code: '310' }]]]), {
      title: 'Comprato',
      fabricCount: 16,
    });
    expect(p.meta.source).toBe('pdf-import');
    expect(p.fabric).toMatchObject({ kind: 'aida', count: 16 });
    expect(p.palette[0]).toMatchObject({ id: 1, symbol: '●', threads: [{ code: '310' }] });
    expect(p.palette[1].symbol).not.toBe('');
    expect([...p.cells]).toEqual([1, 1, 2, 0, 1, 2]);
  });
});
