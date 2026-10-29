import { SRGB8_TO_LINEAR, linearRgbToLab } from '../color/index.ts';
import { ThreadMatcher, type CatalogThread } from '../threads/index.ts';
import type { Bins } from './palette.ts';
import type { CellGrid } from './resample.ts';

export type DitherMethod = 'none' | 'floyd-steinberg' | 'atkinson' | 'ordered';

/**
 * Assigns every cell to a palette index (-1 for empty cells). Without dithering each colour bin
 * maps to its nearest thread; error diffusion works on exact cell colours in linear light.
 */
export function assignCells(
  grid: CellGrid,
  bins: Bins,
  palette: readonly CatalogThread[],
  method: DitherMethod,
  strength: number,
): Int16Array {
  const n = grid.width * grid.height;
  const out = new Int16Array(n).fill(-1);
  if (palette.length === 0) return out;
  const matcher = new ThreadMatcher(palette);
  if (method === 'none' || strength <= 0) {
    const binTo = new Int16Array(bins.n);
    for (let b = 0; b < bins.n; b++) {
      binTo[b] = matcher.nearest([bins.lab[b * 3], bins.lab[b * 3 + 1], bins.lab[b * 3 + 2]]).index;
    }
    for (let i = 0; i < n; i++) if (bins.cellBin[i] >= 0) out[i] = binTo[bins.cellBin[i]];
    return out;
  }
  if (method === 'ordered') return orderedDither(grid, matcher, strength, out);
  return diffuse(grid, palette, matcher, method, strength, out);
}

const FLOYD: readonly [number, number, number][] = [
  [1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [0, 1, 5 / 16],
  [1, 1, 1 / 16],
];
// Atkinson spreads only 6/8 of the error: flatter areas stay cleaner.
const ATKINSON: readonly [number, number, number][] = [
  [1, 0, 1 / 8],
  [2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [0, 1, 1 / 8],
  [1, 1, 1 / 8],
  [0, 2, 1 / 8],
];

function diffuse(
  grid: CellGrid,
  palette: readonly CatalogThread[],
  matcher: ThreadMatcher,
  method: 'floyd-steinberg' | 'atkinson',
  strength: number,
  out: Int16Array,
): Int16Array {
  const { width: w, height: h } = grid;
  const kernel = method === 'atkinson' ? ATKINSON : FLOYD;
  const err = new Float32Array(w * h * 3);
  const lin = palette.map((t) => t.rgb.map((v) => SRGB8_TO_LINEAR[v]));
  for (let y = 0; y < h; y++) {
    const ltr = y % 2 === 0;
    for (let k = 0; k < w; k++) {
      const x = ltr ? k : w - 1 - k;
      const i = y * w + x;
      if (grid.empty[i]) continue;
      const r = clamp01(grid.linear[i * 3] + err[i * 3]);
      const g = clamp01(grid.linear[i * 3 + 1] + err[i * 3 + 1]);
      const b = clamp01(grid.linear[i * 3 + 2] + err[i * 3 + 2]);
      const idx = matcher.nearest(linearRgbToLab(r, g, b)).index;
      out[i] = idx;
      const er = (r - lin[idx][0]) * strength;
      const eg = (g - lin[idx][1]) * strength;
      const eb = (b - lin[idx][2]) * strength;
      for (const [dx, dy, wgt] of kernel) {
        const xx = ltr ? x + dx : x - dx;
        const yy = y + dy;
        if (xx < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (grid.empty[j]) continue;
        err[j * 3] += er * wgt;
        err[j * 3 + 1] += eg * wgt;
        err[j * 3 + 2] += eb * wgt;
      }
    }
  }
  return out;
}

const BAYER8 = (() => {
  const m = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ];
  return m.map((row) => row.map((v) => (v + 0.5) / 64 - 0.5));
})();

/** Ordered dithering on lightness: a regular pattern instead of scattered noise. */
function orderedDither(
  grid: CellGrid,
  matcher: ThreadMatcher,
  strength: number,
  out: Int16Array,
): Int16Array {
  const { width: w, height: h } = grid;
  const spread = 16 * strength;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (grid.empty[i]) continue;
      const L = grid.lab[i * 3] + BAYER8[y & 7][x & 7] * spread;
      out[i] = matcher.nearest([L, grid.lab[i * 3 + 1], grid.lab[i * 3 + 2]]).index;
    }
  }
  return out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
