import { createPattern, type PaletteEntry, type Pattern } from '../../model/pattern.ts';
import { SYMBOLS, assignSymbols } from '../../model/symbols.ts';
import type { ThreadRef } from '../../threads/types.ts';
import type { AssembledChart } from './analyze.ts';

/** Stand-ins for symbols the key doesn't explain, distinct enough to tell apart until fixed. */
export const PLACEHOLDER_THREADS: readonly ThreadRef[] = [
  '762',
  '415',
  '318',
  '414',
  '317',
  '413',
  '3799',
  '310',
  '3072',
  '647',
  '646',
  '645',
].map((code) => ({ brand: 'DMC', code }));

/** Stitch count per chart symbol, most used first. */
export function symbolCounts(chart: AssembledChart): [string, number][] {
  const counts = new Map<string, number>();
  for (const ch of chart.cells) if (ch) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/**
 * A pattern of full stitches from an assembled chart and the thread of each symbol. Symbols
 * missing from `threads` get placeholder threads. The original symbol is kept where the app's
 * symbol font has it.
 */
export function buildImportedPattern(
  chart: AssembledChart,
  threads: ReadonlyMap<string, ThreadRef[]>,
  meta: { title: string; fabricCount?: number },
): Pattern {
  const counts = symbolCounts(chart);
  let placeholder = 0;
  const entries: PaletteEntry[] = counts.map(([ch], i) => ({
    id: i + 1,
    threads: threads.get(ch)?.map((t) => ({ ...t })) ?? [
      { ...PLACEHOLDER_THREADS[placeholder++ % PLACEHOLDER_THREADS.length] },
    ],
    symbol: SYMBOLS.includes(ch) ? ch : '',
    strands: 2,
    backStrands: 1,
  }));
  assignSymbols(entries);
  const idOf = new Map(counts.map(([ch], i) => [ch, i + 1]));
  const count = meta.fabricCount ?? 14;
  const p = createPattern(chart.width, chart.height, {
    palette: entries,
    fabric: {
      kind: count > 22 ? 'evenweave' : 'aida',
      count,
      over: count > 22 ? 2 : 1,
      color: '#ffffff',
    },
    meta: { title: meta.title, source: 'pdf-import' },
  });
  chart.cells.forEach((ch, i) => {
    if (ch) p.cells[i] = idOf.get(ch) ?? 0;
  });
  return p;
}
