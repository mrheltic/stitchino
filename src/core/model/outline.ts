import { relativeLuminance } from '../color/srgb.ts';
import { equivalentThread, getThread } from '../threads/catalog.ts';
import type { ThreadRef } from '../threads/types.ts';
import { CompositeCommand, ListCommand, PaletteCommand, type Command } from './document.ts';
import { nextPaletteId, type Backstitch, type PaletteEntry, type Pattern } from './pattern.ts';
import { assignSymbols } from './symbols.ts';

/** What to outline: the whole design (stitches next to bare fabric) or one colour. */
export type OutlineTarget = 'design' | number;

/** The usual outline thread: a very dark grey, softer than black. */
const OUTLINE_THREAD: ThreadRef = { brand: 'DMC', code: '3799' };

/**
 * Backstitch runs along the edge of a region, merged into straight lines, on the half-cell grid.
 * Around the design the edge separates stitched cells from bare fabric (and from the border);
 * around a colour it separates that colour from everything else.
 */
export function outlineRuns(
  pattern: Pattern,
  target: OutlineTarget,
): [number, number, number, number][] {
  const { width: w, height: h, cells, partials } = pattern;
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = y * w + x;
    return target === 'design' ? cells[i] !== 0 || partials.has(i) : cells[i] === target;
  };
  const runs: [number, number, number, number][] = [];
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && inside(x, y - 1) !== inside(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) {
        runs.push([2 * start, 2 * y, 2 * x, 2 * y]);
        start = -1;
      }
    }
  }
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && inside(x - 1, y) !== inside(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) {
        runs.push([2 * x, 2 * start, 2 * x, 2 * y]);
        start = -1;
      }
    }
  }
  return runs;
}

/**
 * The palette entry to outline with: the darkest thread already in the pattern when it is dark
 * enough, otherwise a new very dark grey (in the pattern's brand).
 */
export function outlineEntry(pattern: Pattern): { entry: PaletteEntry; added: boolean } {
  const brand = pattern.palette[0]?.threads[0]?.brand ?? 'DMC';
  const ref = equivalentThread(OUTLINE_THREAD, brand)?.thread ?? OUTLINE_THREAD;
  let darkest: PaletteEntry | undefined;
  let lowest = Infinity;
  for (const e of pattern.palette) {
    if (e.threads.length > 1) continue;
    const t = getThread(e.threads[0]);
    if (!t) continue;
    if (t.brand === ref.brand && t.code === ref.code) return { entry: e, added: false };
    const l = relativeLuminance(t.rgb);
    if (l < lowest) {
      lowest = l;
      darkest = e;
    }
  }
  if (darkest && lowest < 0.03) return { entry: darkest, added: false };
  const entry: PaletteEntry = {
    id: nextPaletteId(pattern),
    threads: [{ brand: ref.brand, code: ref.code }],
    symbol: '',
    strands: 2,
    backStrands: 1,
  };
  const all = [...pattern.palette.map((e) => ({ ...e })), entry];
  assignSymbols(all);
  return { entry: all[all.length - 1], added: true };
}

/** The pattern with an outline added (a new pattern; the input is left as it was). */
export function withOutline(pattern: Pattern, target: OutlineTarget): Pattern {
  const { entry, added } = outlineEntry(pattern);
  const lines: Backstitch[] = outlineRuns(pattern, target).map(([x1, y1, x2, y2]) => ({
    x1,
    y1,
    x2,
    y2,
    id: entry.id,
  }));
  if (!lines.length) return pattern;
  return {
    ...pattern,
    palette: added ? [...pattern.palette, entry] : pattern.palette,
    backstitches: [...pattern.backstitches, ...lines],
  };
}

/** The same, as one undoable editor step. Null when there's nothing to outline. */
export function outlineCommand(pattern: Pattern, target: OutlineTarget): Command | null {
  const runs = outlineRuns(pattern, target);
  if (!runs.length) return null;
  const { entry, added } = outlineEntry(pattern);
  const lines = runs.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2, id: entry.id }));
  const parts: Command[] = [];
  if (added) parts.push(new PaletteCommand(pattern.palette, [...pattern.palette, entry]));
  parts.push(new ListCommand<Backstitch>('backstitches', lines, []));
  return new CompositeCommand(parts);
}
