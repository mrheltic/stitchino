import type { ThreadRef } from '../threads/types.ts';

export type FabricKind = 'aida' | 'evenweave' | 'linen';

export interface Fabric {
  kind: FabricKind;
  /** Threads (holes) per inch of the fabric. */
  count: number;
  /** Fabric threads each stitch covers: 1 for Aida, usually 2 for evenweave and linen. */
  over: 1 | 2;
  /** Fabric colour as #rrggbb. */
  color: string;
}

export interface PaletteEntry {
  /** Stable id stored in cells (1..65535); 0 means "no stitch". */
  id: number;
  /** One thread, or two for a blend in the same needle. */
  threads: ThreadRef[];
  symbol: string;
  /** Strands used for cross stitches. */
  strands: number;
  /** Strands used for backstitch with this colour. */
  backStrands: number;
}

/**
 * Arms of a cross stitch, from the cell centre to each corner. A full cross is all four arms;
 * half stitches are two opposite arms, quarters one arm, three-quarters three arms.
 */
export const ARM = { TL: 1, TR: 2, BL: 4, BR: 8 } as const;
export const FULL_MASK = 15;
export const HALF_SLASH = ARM.TR | ARM.BL; // "/"
export const HALF_BACKSLASH = ARM.TL | ARM.BR; // "\"
export type ArmMask = number;

export type PartialKind = 'quarter' | 'half' | 'threeQuarter';

export function partialKind(mask: ArmMask): PartialKind {
  switch (mask) {
    case ARM.TL:
    case ARM.TR:
    case ARM.BL:
    case ARM.BR:
      return 'quarter';
    case HALF_SLASH:
    case HALF_BACKSLASH:
      return 'half';
    case FULL_MASK & ~ARM.TL:
    case FULL_MASK & ~ARM.TR:
    case FULL_MASK & ~ARM.BL:
    case FULL_MASK & ~ARM.BR:
      return 'threeQuarter';
    default:
      throw new Error(`Not a partial stitch mask: ${mask}`);
  }
}

export function isValidPartialMask(mask: number): boolean {
  return [1, 2, 4, 8, 6, 9, 7, 11, 13, 14].includes(mask);
}

export interface PartialStitch {
  mask: ArmMask;
  id: number;
}

/** A straight backstitch segment between two points of the half-cell grid (0..2*width, 0..2*height). */
export interface Backstitch {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  id: number;
}

/** A French knot on the half-cell grid. */
export interface Knot {
  x: number;
  y: number;
  id: number;
}

export type PatternSource = 'photo' | 'blank' | 'file' | 'pdf-import';

export interface PatternMeta {
  title: string;
  author?: string;
  copyright?: string;
  notes?: string;
  source: PatternSource;
}

export interface Pattern {
  width: number;
  height: number;
  /** Full stitches, row-major: palette id or 0. A cell with partial stitches has 0 here. */
  cells: Uint16Array;
  /** Partial stitches by cell index; masks within a cell never overlap. */
  partials: Map<number, PartialStitch[]>;
  backstitches: Backstitch[];
  knots: Knot[];
  palette: PaletteEntry[];
  fabric: Fabric;
  meta: PatternMeta;
}

export const MAX_SIDE = 1500;

export const DEFAULT_FABRIC: Fabric = { kind: 'aida', count: 14, over: 1, color: '#ffffff' };

export function createPattern(width: number, height: number, init: Partial<Pattern> = {}): Pattern {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Invalid pattern size ${width}×${height}`);
  }
  if (width > MAX_SIDE || height > MAX_SIDE)
    throw new Error(`Pattern larger than ${MAX_SIDE} stitches`);
  return {
    width,
    height,
    cells: init.cells ?? new Uint16Array(width * height),
    partials: init.partials ?? new Map(),
    backstitches: init.backstitches ?? [],
    knots: init.knots ?? [],
    palette: init.palette ?? [],
    fabric: init.fabric ?? { ...DEFAULT_FABRIC },
    meta: init.meta ?? { title: '', source: 'blank' },
  };
}

export function nextPaletteId(pattern: Pattern): number {
  let max = 0;
  for (const p of pattern.palette) if (p.id > max) max = p.id;
  if (max >= 0xffff) throw new Error('Palette is full');
  return max + 1;
}

export function paletteById(pattern: Pattern): Map<number, PaletteEntry> {
  return new Map(pattern.palette.map((p) => [p.id, p]));
}

/** Stitch counts per palette id. */
export interface StitchCounts {
  full: number;
  half: number;
  quarter: number;
  threeQuarter: number;
  backstitchCells: number;
  knots: number;
}

export function emptyCounts(): StitchCounts {
  return { full: 0, half: 0, quarter: 0, threeQuarter: 0, backstitchCells: 0, knots: 0 };
}

export function countStitches(pattern: Pattern): Map<number, StitchCounts> {
  const out = new Map<number, StitchCounts>();
  const get = (id: number) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = emptyCounts()));
    return c;
  };
  for (const p of pattern.palette) get(p.id);
  const { cells } = pattern;
  for (let i = 0; i < cells.length; i++) if (cells[i]) get(cells[i]).full++;
  for (const list of pattern.partials.values()) {
    for (const s of list) get(s.id)[partialKind(s.mask)]++;
  }
  for (const b of pattern.backstitches) {
    get(b.id).backstitchCells += Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 2;
  }
  for (const k of pattern.knots) get(k.id).knots++;
  return out;
}

/** Number of stitched positions (full, plus any cell with partial stitches). */
export function totalStitches(pattern: Pattern): number {
  let n = 0;
  for (const v of pattern.cells) if (v) n++;
  return n + pattern.partials.size;
}
