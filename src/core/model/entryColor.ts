import type { Rgb } from '../color/srgb.ts';
import { getThread } from '../threads/catalog.ts';
import type { PaletteEntry } from './pattern.ts';

/** Display colour of a palette entry: the thread colour, or the average of a blend. */
export function entryRgb(entry: PaletteEntry): Rgb {
  const rgbs = entry.threads.map((t) => getThread(t)?.rgb ?? ([128, 128, 128] as Rgb));
  const n = rgbs.length;
  return [0, 1, 2].map((c) => Math.round(rgbs.reduce((s, v) => s + v[c], 0) / n)) as unknown as Rgb;
}
