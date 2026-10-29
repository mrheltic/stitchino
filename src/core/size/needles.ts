import type { Fabric } from '../model/pattern.ts';
import { stitchesPerInch } from './fabric.ts';

export interface StitchingAdvice {
  /** Strands for cross stitches. */
  strands: number;
  /** Strands for backstitch. */
  backStrands: number;
  /** Tapestry needle sizes, most common first. */
  needles: number[];
}

/** Usual recommendations; stitchers often adjust them to taste. */
export function stitchingAdvice(fabric: Pick<Fabric, 'count' | 'over'>): StitchingAdvice {
  const spi = stitchesPerInch(fabric);
  const strands = spi <= 11 ? 3 : spi <= 18 ? 2 : 1;
  // Needle size follows the fabric weave (hole size), not the stitch size.
  const c = fabric.count;
  const needles =
    c <= 11 ? [22, 24] : c <= 16 ? [24, 26] : c <= 22 ? [26, 28] : c <= 28 ? [26, 28] : [28];
  return { strands, backStrands: 1, needles };
}
