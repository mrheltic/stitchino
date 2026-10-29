import type { Fabric, FabricKind } from '../model/pattern.ts';

export const MM_PER_INCH = 25.4;

export interface FabricPreset {
  kind: FabricKind;
  counts: number[];
  defaultOver: 1 | 2;
}

export const FABRIC_PRESETS: readonly FabricPreset[] = [
  { kind: 'aida', counts: [11, 14, 16, 18, 20, 22], defaultOver: 1 },
  { kind: 'evenweave', counts: [25, 28, 32, 36], defaultOver: 2 },
  { kind: 'linen', counts: [28, 32, 36, 40], defaultOver: 2 },
];

export const FABRIC_COLORS = [
  { id: 'white', hex: '#ffffff' },
  { id: 'antiqueWhite', hex: '#f7f0e1' },
  { id: 'cream', hex: '#efe3c8' },
  { id: 'natural', hex: '#d8c7a5' },
  { id: 'lightBlue', hex: '#cddff0' },
  { id: 'pink', hex: '#f2d4d7' },
  { id: 'grey', hex: '#9a9a98' },
  { id: 'navy', hex: '#1f2a44' },
  { id: 'black', hex: '#1b1b1b' },
] as const;

/** Stitches per inch: e.g. Aida 14 → 14, evenweave 28 over 2 → 14. */
export function stitchesPerInch(fabric: Pick<Fabric, 'count' | 'over'>): number {
  return fabric.count / fabric.over;
}

export function cellSizeMm(fabric: Pick<Fabric, 'count' | 'over'>): number {
  return MM_PER_INCH / stitchesPerInch(fabric);
}

export interface SizeMm {
  widthMm: number;
  heightMm: number;
}

export function finishedSize(
  stitchesWide: number,
  stitchesHigh: number,
  fabric: Pick<Fabric, 'count' | 'over'>,
): SizeMm {
  const s = cellSizeMm(fabric);
  return { widthMm: stitchesWide * s, heightMm: stitchesHigh * s };
}

/** Stitches that fit a physical size on the given fabric (rounded down, at least 1). */
export function stitchesForSize(mm: number, fabric: Pick<Fabric, 'count' | 'over'>): number {
  return Math.max(1, Math.floor(mm / cellSizeMm(fabric) + 1e-9));
}

export const DEFAULT_MARGIN_MM = 75;

/** Fabric to cut: the design plus a margin on every side for hooping and framing. */
export function fabricToBuy(size: SizeMm, marginMm = DEFAULT_MARGIN_MM): SizeMm {
  return { widthMm: size.widthMm + 2 * marginMm, heightMm: size.heightMm + 2 * marginMm };
}

export function mmToCm(mm: number): number {
  return mm / 10;
}

export function mmToInches(mm: number): number {
  return mm / MM_PER_INCH;
}
