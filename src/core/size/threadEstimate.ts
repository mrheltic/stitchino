import type { Fabric, Pattern, StitchCounts } from '../model/pattern.ts';
import { cellSizeMm } from './fabric.ts';

export interface EstimateOptions {
  /** Extra length factor for fabric thickness and slack. */
  k: number;
  /** Fraction added for mistakes and leftovers. */
  waste: number;
  /** Tail left at the start and end of each needle length, per strand (mm). */
  tailMm: number;
  /** Length of one needle length of thread (mm). */
  needleLengthMm: number;
  /** Single-strand thread used by a French knot (mm). */
  knotMm: number;
  /** Skein length (m) and number of strands it splits into. */
  skeinM: number;
  skeinStrands: number;
}

export const DEFAULT_ESTIMATE: EstimateOptions = {
  k: 1.3,
  waste: 0.1,
  tailMm: 30,
  needleLengthMm: 450,
  knotMm: 25,
  skeinM: 8,
  skeinStrands: 6,
};

/** Single-strand thread for one full cross: two diagonals in front, two vertical returns behind. */
export function fullStitchLengthMm(
  fabric: Pick<Fabric, 'count' | 'over'>,
  k = DEFAULT_ESTIMATE.k,
): number {
  return k * cellSizeMm(fabric) * (2 * Math.SQRT2 + 2);
}

export interface ColorEstimate {
  /** Single-strand length in metres, all strands included. */
  lengthM: number;
  skeins: number;
}

/**
 * Thread needed for one colour. Back-stitch counts the front segment plus twice its length behind;
 * every needle length costs two tails.
 */
export function estimateColor(
  counts: StitchCounts,
  strands: number,
  backStrands: number,
  fabric: Pick<Fabric, 'count' | 'over'>,
  opts: EstimateOptions = DEFAULT_ESTIMATE,
): ColorEstimate {
  const s = cellSizeMm(fabric);
  const full = fullStitchLengthMm(fabric, opts.k);
  const crossMm =
    counts.full * full +
    counts.half * full * 0.5 +
    counts.quarter * full * 0.25 +
    counts.threeQuarter * full * 0.75 +
    counts.knots * opts.knotMm;
  const backMm = counts.backstitchCells * s * 3 * opts.k;
  const usable = opts.needleLengthMm - 2 * opts.tailMm;
  const perStrand = (mm: number) => (mm > 0 ? mm + Math.ceil(mm / usable) * 2 * opts.tailMm : 0);
  const totalMm =
    (perStrand(crossMm) * strands + perStrand(backMm) * backStrands) * (1 + opts.waste);
  const skeinMm = opts.skeinM * 1000 * opts.skeinStrands;
  return {
    lengthM: totalMm / 1000,
    skeins: totalMm > 0 ? Math.max(1, Math.ceil(totalMm / skeinMm)) : 0,
  };
}

/** Full stitches one skein covers, for display ("≈ 1,700 stitches per skein"). */
export function stitchesPerSkein(
  fabric: Pick<Fabric, 'count' | 'over'>,
  strands: number,
  opts: EstimateOptions = DEFAULT_ESTIMATE,
): number {
  const perStitch = fullStitchLengthMm(fabric, opts.k);
  const usable = opts.needleLengthMm - 2 * opts.tailMm;
  const perNeedle = Math.floor(usable / perStitch);
  const skeinMm = opts.skeinM * 1000 * opts.skeinStrands;
  const needleLengths = skeinMm / (opts.needleLengthMm * strands) / (1 + opts.waste);
  return Math.floor(needleLengths * perNeedle);
}

export function estimatePattern(
  pattern: Pattern,
  counts: Map<number, StitchCounts>,
  fabric: Pick<Fabric, 'count' | 'over'> = pattern.fabric,
  opts: EstimateOptions = DEFAULT_ESTIMATE,
): Map<number, ColorEstimate> {
  const out = new Map<number, ColorEstimate>();
  for (const p of pattern.palette) {
    const c = counts.get(p.id);
    if (c) out.set(p.id, estimateColor(c, p.strands, p.backStrands, fabric, opts));
  }
  return out;
}
