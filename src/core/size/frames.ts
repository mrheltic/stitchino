import type { SizeMm } from './fabric.ts';

/** Common ready-made frame sizes in centimetres (portrait orientation). */
export const FRAME_SIZES_CM: readonly [number, number][] = [
  [10, 15],
  [13, 18],
  [15, 20],
  [18, 24],
  [20, 25],
  [20, 30],
  [24, 30],
  [30, 40],
  [40, 50],
  [50, 70],
  [60, 80],
  [70, 100],
];

export const HOOP_DIAMETERS_CM: readonly number[] = [10, 13, 15, 18, 20, 23, 25, 30];

export interface FrameSuggestion {
  widthCm: number;
  heightCm: number;
  /** Space left around the design on each side, in mm. */
  marginMm: number;
}

/**
 * Smallest standard frame that holds the design with at least `minMarginMm` of fabric showing on
 * every side; the frame is turned to landscape for landscape designs.
 */
export function suggestFrame(design: SizeMm, minMarginMm = 20): FrameSuggestion | undefined {
  const landscape = design.widthMm > design.heightMm;
  for (const [a, b] of FRAME_SIZES_CM) {
    const [wCm, hCm] = landscape ? [b, a] : [a, b];
    const marginMm = Math.min(wCm * 10 - design.widthMm, hCm * 10 - design.heightMm) / 2;
    if (marginMm >= minMarginMm) return { widthCm: wCm, heightCm: hCm, marginMm };
  }
  return undefined;
}

/** Smallest hoop whose inner circle holds the whole design with a little room; undefined if none. */
export function suggestHoop(design: SizeMm, roomMm = 15): number | undefined {
  const needed = Math.hypot(design.widthMm, design.heightMm) + 2 * roomMm;
  return HOOP_DIAMETERS_CM.find((d) => d * 10 >= needed);
}
