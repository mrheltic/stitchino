import { deltaE2000, hexToRgb, rgbToLab } from '../color/index.ts';
import { entryRgb } from '../model/entryColor.ts';
import type { PaletteEntry } from '../model/pattern.ts';

/**
 * The highlighter colour that stands out most from the pattern's threads: the candidate whose
 * closest thread is farthest away (CIEDE2000), weighting each thread by its stitch count so a
 * stray stitch of a similar colour doesn't rule a candidate out.
 */
export function pickDoneColor(
  candidates: readonly string[],
  palette: readonly PaletteEntry[],
  stitches: (id: number) => number = () => 1,
): string {
  const threads = palette
    .map((e) => ({ lab: rgbToLab(entryRgb(e)), weight: stitches(e.id) }))
    .filter((x) => x.weight > 0);
  if (!threads.length) return candidates[0];
  const total = threads.reduce((s, x) => s + x.weight, 0);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const lab = rgbToLab(hexToRgb(c));
    // Threads with at least 2% of the stitches count fully; rarer ones barely.
    let closest = Infinity;
    for (const t of threads) {
      const d = deltaE2000(lab, t.lab);
      const share = t.weight / total;
      const effective = share >= 0.02 ? d : d + 40 * (1 - share / 0.02);
      if (effective < closest) closest = effective;
    }
    if (closest > bestScore) {
      bestScore = closest;
      best = c;
    }
  }
  return best;
}
