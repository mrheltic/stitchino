import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { ARM, HALF_SLASH, createPattern, type Pattern } from '../../src/core/model/pattern.ts';
import { SYMBOLS } from '../../src/core/model/symbols.ts';
import { chartGrid, chartPdf, type ChartPdfOptions } from '../../src/core/pdf/export/chartPdf.ts';
import { chartLabels } from '../../src/ui/export/labels.ts';

const fonts = {
  symbols: new Uint8Array(readFileSync('public/fonts/pc-symbols.ttf')),
  text: new Uint8Array(readFileSync('public/fonts/AtkinsonHyperlegible-Regular.ttf')),
  bold: new Uint8Array(readFileSync('public/fonts/AtkinsonHyperlegible-Bold.ttf')),
};
const t = (key: string, o?: Record<string, unknown>) => (o ? `${key} ${JSON.stringify(o)}` : key);

function sample(w = 70, h = 50): Pattern {
  const p = createPattern(w, h, { meta: { title: 'Prova PDF', source: 'blank' } });
  p.palette = [
    {
      id: 1,
      threads: [{ brand: 'DMC', code: '310' }],
      symbol: SYMBOLS[0],
      strands: 2,
      backStrands: 1,
    },
    {
      id: 2,
      threads: [{ brand: 'DMC', code: '321' }],
      symbol: SYMBOLS[1],
      strands: 2,
      backStrands: 1,
    },
    {
      id: 3,
      threads: [{ brand: 'Anchor', code: '403' }],
      symbol: SYMBOLS[2],
      strands: 2,
      backStrands: 1,
    },
  ];
  for (let i = 0; i < p.cells.length; i++) p.cells[i] = i % 7 < 3 ? 1 : i % 7 < 5 ? 2 : 0;
  p.cells[0] = 3;
  p.partials.set(5, [
    { mask: HALF_SLASH, id: 2 },
    { mask: ARM.TL, id: 1 },
  ]);
  p.cells[5] = 0;
  p.backstitches.push({ x1: 0, y1: 0, x2: 20, y2: 20, id: 1 });
  p.knots.push({ x: 4, y: 4, id: 2 });
  return p;
}

function options(o: Partial<ChartPdfOptions> = {}): ChartPdfOptions {
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

async function load(bytes: Uint8Array) {
  return getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    isEvalSupported: false,
  }).promise;
}

async function pageText(doc: Awaited<ReturnType<typeof load>>, n: number): Promise<string[]> {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  return content.items.map((i) => ('str' in i ? i.str : '')).filter(Boolean);
}

describe('chart grid', () => {
  it('uses page sizes in multiples of 10 stitches', () => {
    const g = chartGrid(createPattern(150, 200), 'a4', 60);
    expect(g.cellsX % 10).toBe(0);
    expect(g.cellsY % 10).toBe(0);
    expect(g.cellsX).toBe(60);
    expect(g.cols).toBe(3);
    expect(g.cell).toBeLessThanOrEqual(4.5);
    expect(chartGrid(createPattern(25, 25), 'a4', 60).cellsX).toBe(30);
  });
});

describe('chart PDF', () => {
  it('has cover, key, page map and chart pages on A4', async () => {
    const p = sample();
    const bytes = await chartPdf(p, options());
    const doc = await load(bytes);
    const g = chartGrid(p, 'a4', 60);
    expect(doc.numPages).toBe(3 + g.cols * g.rows);
    const page = await doc.getPage(1);
    const [, , w, h] = page.view;
    expect(w).toBeCloseTo(595.28, 1);
    expect(h).toBeCloseTo(841.89, 1);
    expect((await pageText(doc, 1)).join(' ')).toContain('Prova PDF');
  });

  it('writes chart symbols as text with their Unicode mapping', async () => {
    const p = sample();
    const doc = await load(await chartPdf(p, options({ cover: false, pageMap: false })));
    const chart = (await pageText(doc, 2)).join('');
    for (const s of [SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]]) expect(chart).toContain(s);
    const key = (await pageText(doc, 1)).join(' ');
    expect(key).toContain('DMC 310');
    expect(key).toContain('Anchor 403');
  });

  it('embeds every font it uses', async () => {
    const doc = await load(await chartPdf(sample(), options({ cover: false, pageMap: false })));
    const page = await doc.getPage(2);
    const ops = await page.getOperatorList();
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const fontIds = new Set<string>();
    ops.fnArray.forEach((fn, i) => {
      if (fn === OPS.setFont) fontIds.add(ops.argsArray[i][0] as string);
    });
    expect(fontIds.size).toBeGreaterThanOrEqual(2);
    for (const id of fontIds)
      expect((page.commonObjs.get(id) as { missingFile: boolean }).missingFile).toBe(false);
  });

  it('makes a Pattern Keeper file: English key, no cover, no page map, full stitches only', async () => {
    const p = sample(130, 50);
    const doc = await load(await chartPdf(p, options({ patternKeeper: true, columns: 80 })));
    const g = chartGrid(p, 'a4', 60);
    expect(doc.numPages).toBe(1 + g.cols * g.rows);
    const key = (await pageText(doc, 1)).join(' ');
    for (const h of ['Key', 'Symbol', 'Number', 'Name', 'Strands', 'Stitches'])
      expect(key).toContain(h);
    expect(key).toContain('310');
    expect(key).not.toContain('DMC 310');
    const chart = (await pageText(doc, 2)).join('');
    expect([...chart].filter((s) => s === SYMBOLS[0]).length).toBeGreaterThan(100);
  });
});
