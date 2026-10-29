import type { PaletteEntry } from '../model/pattern.ts';
import { assignSymbols } from '../model/symbols.ts';
import { ThreadMatcher, getThread, threadsOf, type CatalogThread } from '../threads/index.ts';
import type { Brand } from '../threads/types.ts';
import { NO_ADJUSTMENTS, applyAdjustments, type Adjustments } from './adjust.ts';
import { removeConfetti, type CleanupLevel } from './cleanup.ts';
import { assignCells, type DitherMethod } from './dither.ts';
import { computeMetrics, type PatternMetrics } from './metrics.ts';
import { binCells, selectPalette, type Bins } from './palette.ts';
import type { RasterImage } from './raster.ts';
import { resampleToGrid, type CellGrid } from './resample.ts';

export interface InventoryConstraint {
  keys: readonly string[];
  /** 'only' restricts the palette to these threads, 'prefer' favours them. */
  mode: 'only' | 'prefer';
}

export interface ConvertParams {
  width: number;
  height: number;
  brand: Brand;
  maxColors: number;
  /** Thread keys ("DMC:310") forced into the palette. */
  include: readonly string[];
  /** Thread keys never used. */
  exclude: readonly string[];
  inventory?: InventoryConstraint;
  dither: DitherMethod;
  /** 0..1 */
  ditherStrength: number;
  cleanup: CleanupLevel;
  protectDetails: boolean;
  /** Colours with fewer full stitches are merged into the nearest remaining colour. */
  minStitches: number;
  strands: number;
  backStrands: number;
  adjustments: Adjustments;
}

export const DEFAULT_CONVERT_PARAMS: Omit<ConvertParams, 'width' | 'height'> = {
  brand: 'DMC',
  maxColors: 30,
  include: [],
  exclude: [],
  dither: 'none',
  ditherStrength: 0.7,
  cleanup: 1,
  protectDetails: true,
  minStitches: 4,
  strands: 2,
  backStrands: 1,
  adjustments: NO_ADJUSTMENTS,
};

/** ΔE added to threads the stitcher does not own when the inventory is "preferred". */
export const PREFER_OWNED_PENALTY = 4;

export interface ConvertOutput {
  width: number;
  height: number;
  /** Palette ids per cell, 0 = no stitch. */
  cells: Uint16Array;
  palette: PaletteEntry[];
  metrics: PatternMetrics;
  suggestedColors: number;
}

export class NoCandidateThreadsError extends Error {
  constructor() {
    super('No threads available for the conversion');
    this.name = 'NoCandidateThreadsError';
  }
}

export function candidateThreads(
  params: Pick<ConvertParams, 'brand' | 'exclude' | 'inventory'>,
): CatalogThread[] {
  const exclude = new Set(params.exclude);
  let list = threadsOf(params.brand).filter((t) => !exclude.has(t.key));
  if (params.inventory?.mode === 'only') {
    const owned = new Set(params.inventory.keys);
    list = [...owned]
      .map((k) => getThread(k))
      .filter((t): t is CatalogThread => !!t && !exclude.has(t.key));
  }
  return list;
}

/**
 * Converts one source image with changing parameters, caching the expensive steps that do not
 * depend on the palette (adjustments, resampling, binning).
 */
export class ConvertSession {
  private readonly source: RasterImage;
  private mask: Uint8Array | undefined;
  private adjusted?: { key: string; img: RasterImage };
  private gridCache?: { key: string; grid: CellGrid; bins: Bins };

  constructor(source: RasterImage, mask?: Uint8Array) {
    this.source = source;
    this.mask = mask;
  }

  get width(): number {
    return this.source.width;
  }

  get height(): number {
    return this.source.height;
  }

  setMask(mask: Uint8Array | undefined): void {
    if (mask && mask.length !== this.source.width * this.source.height)
      throw new Error('Mask size mismatch');
    this.mask = mask;
    this.gridCache = undefined;
  }

  /** The image after adjustments, for previews. */
  adjustedImage(adjustments: Adjustments): RasterImage {
    const key = JSON.stringify(adjustments);
    if (this.adjusted?.key !== key)
      this.adjusted = { key, img: applyAdjustments(this.source, adjustments) };
    return this.adjusted.img;
  }

  private gridFor(params: ConvertParams): { grid: CellGrid; bins: Bins } {
    const key = `${JSON.stringify(params.adjustments)}|${params.width}x${params.height}`;
    if (this.gridCache?.key !== key) {
      const grid = resampleToGrid(
        this.adjustedImage(params.adjustments),
        params.width,
        params.height,
        this.mask,
      );
      this.gridCache = { key, grid, bins: binCells(grid) };
    }
    return this.gridCache;
  }

  run(params: ConvertParams): ConvertOutput {
    const { grid, bins } = this.gridFor(params);
    return convertGrid(grid, bins, params);
  }

  /** Same conversion with several colour limits, e.g. to compare 15, 25 and 35 colours. */
  variants(params: ConvertParams, maxColors: readonly number[]): ConvertOutput[] {
    return maxColors.map((k) => this.run({ ...params, maxColors: k }));
  }
}

export function convertImage(
  img: RasterImage,
  params: ConvertParams,
  mask?: Uint8Array,
): ConvertOutput {
  return new ConvertSession(img, mask).run(params);
}

function convertGrid(grid: CellGrid, bins: Bins, params: ConvertParams): ConvertOutput {
  const { width, height } = grid;
  const candidates = candidateThreads(params);
  if (candidates.length === 0) throw new NoCandidateThreadsError();
  const include = params.include.map((k) => getThread(k)).filter((t): t is CatalogThread => !!t);
  const owned = params.inventory?.mode === 'prefer' ? new Set(params.inventory.keys) : null;
  const { threads, suggestedColors } = selectPalette(bins, candidates, {
    maxColors: params.maxColors,
    include,
    penalty: owned ? (t) => (owned.has(t.key) ? 0 : PREFER_OWNED_PENALTY) : undefined,
  });

  let palette = threads;
  const assign = assignCells(grid, bins, palette, params.dither, params.ditherStrength);
  removeConfetti(assign, width, height, labsOf(palette), params.cleanup, params.protectDetails);

  // Merge colours used for only a handful of stitches into their neighbours in colour space.
  const forced = new Set(include.map((t) => t.key));
  const counts = countAssign(assign, palette.length);
  const keep = palette.map(
    (t, i) => forced.has(t.key) || counts[i] >= params.minStitches || counts[i] === 0,
  );
  if (!keep.some((k, i) => k && counts[i] > 0)) keep[counts.indexOf(Math.max(...counts))] = true;
  if (keep.some((k) => !k)) {
    const kept = palette.map((_, i) => i).filter((i) => keep[i]);
    const matcher = new ThreadMatcher(kept.map((i) => palette[i]));
    for (let c = 0; c < assign.length; c++) {
      const a = assign[c];
      if (a >= 0 && !keep[a]) {
        assign[c] =
          kept[matcher.nearest([grid.lab[c * 3], grid.lab[c * 3 + 1], grid.lab[c * 3 + 2]]).index];
      }
    }
    removeConfetti(assign, width, height, labsOf(palette), params.cleanup, params.protectDetails);
  }

  // Final palette: used colours (and forced ones), most stitches first.
  const finalCounts = countAssign(assign, palette.length);
  const order = palette
    .map((_, i) => i)
    .filter((i) => finalCounts[i] > 0 || forced.has(palette[i].key))
    .sort((a, b) => finalCounts[b] - finalCounts[a] || a - b);
  const idOf = new Int32Array(palette.length).fill(0);
  order.forEach((oldIndex, k) => (idOf[oldIndex] = k + 1));
  const entries: PaletteEntry[] = order.map((oldIndex, k) => ({
    id: k + 1,
    threads: [{ brand: palette[oldIndex].brand, code: palette[oldIndex].code }],
    symbol: '',
    strands: params.strands,
    backStrands: params.backStrands,
  }));
  assignSymbols(entries);
  palette = order.map((i) => palette[i]);

  const cells = new Uint16Array(width * height);
  for (let i = 0; i < cells.length; i++) if (assign[i] >= 0) cells[i] = idOf[assign[i]];
  return {
    width,
    height,
    cells,
    palette: entries,
    metrics: computeMetrics(cells, width, height),
    suggestedColors,
  };
}

function labsOf(threads: readonly CatalogThread[]): Float64Array {
  return Float64Array.from(threads.flatMap((t) => t.lab));
}

function countAssign(assign: Int16Array, n: number): number[] {
  const counts = new Array<number>(n).fill(0);
  for (const a of assign) if (a >= 0) counts[a]++;
  return counts;
}
