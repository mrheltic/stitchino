import { SRGB8_TO_LINEAR, linearRgbToLab, linearToSrgb8 } from '../color/index.ts';
import type { RasterImage } from './raster.ts';

/** Colour of every cell of the stitch grid, averaged in linear light. */
export interface CellGrid {
  width: number;
  height: number;
  /** Linear RGB, 3 per cell (meaningless for empty cells). */
  linear: Float32Array;
  /** CIELAB, 3 per cell. */
  lab: Float32Array;
  /** 8-bit sRGB, 3 per cell. */
  srgb: Uint8Array;
  /** 1 = no stitch (transparent or masked background). */
  empty: Uint8Array;
}

/**
 * Area-averages the image onto a width×height grid. Pixels are weighted by alpha and by
 * (1 - mask); a cell is empty when less than `minCoverage` of its area is opaque and unmasked.
 */
export function resampleToGrid(
  img: RasterImage,
  width: number,
  height: number,
  mask?: Uint8Array,
  minCoverage = 0.5,
): CellGrid {
  const { width: sw, height: sh, data } = img;
  // Premultiplied linear RGB + weight per source pixel.
  const src = new Float32Array(sw * sh * 4);
  for (let i = 0, p = 0; i < sw * sh; i++, p += 4) {
    const a = (data[p + 3] / 255) * (mask && mask[i] ? 0 : 1);
    src[p] = SRGB8_TO_LINEAR[data[p]] * a;
    src[p + 1] = SRGB8_TO_LINEAR[data[p + 1]] * a;
    src[p + 2] = SRGB8_TO_LINEAR[data[p + 2]] * a;
    src[p + 3] = a;
  }
  const horiz = boxResample(src, sw, sh, width, true);
  const both = boxResample(horiz, width, sh, height, false);

  const n = width * height;
  const grid: CellGrid = {
    width,
    height,
    linear: new Float32Array(n * 3),
    lab: new Float32Array(n * 3),
    srgb: new Uint8Array(n * 3),
    empty: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const a = both[i * 4 + 3];
    if (a < minCoverage || a <= 0) {
      grid.empty[i] = 1;
      continue;
    }
    const r = both[i * 4] / a;
    const g = both[i * 4 + 1] / a;
    const b = both[i * 4 + 2] / a;
    setCell(grid, i, r, g, b);
  }
  return grid;
}

export function setCell(grid: CellGrid, i: number, r: number, g: number, b: number): void {
  grid.linear[i * 3] = r;
  grid.linear[i * 3 + 1] = g;
  grid.linear[i * 3 + 2] = b;
  const lab = linearRgbToLab(r, g, b);
  grid.lab[i * 3] = lab[0];
  grid.lab[i * 3 + 1] = lab[1];
  grid.lab[i * 3 + 2] = lab[2];
  grid.srgb[i * 3] = linearToSrgb8(r);
  grid.srgb[i * 3 + 1] = linearToSrgb8(g);
  grid.srgb[i * 3 + 2] = linearToSrgb8(b);
}

/**
 * Exact box filter along one axis: each output sample averages the input interval it covers,
 * with fractional weights for partially covered pixels. 4 channels per sample.
 */
function boxResample(
  src: Float32Array,
  w: number,
  h: number,
  outLen: number,
  horizontal: boolean,
): Float32Array {
  const inLen = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const outW = horizontal ? outLen : w;
  const out = new Float32Array((horizontal ? outLen * h : w * outLen) * 4);
  const scale = inLen / outLen;
  for (let o = 0; o < outLen; o++) {
    const start = o * scale;
    const end = start + scale;
    const i0 = Math.floor(start);
    const i1 = Math.min(inLen - 1, Math.ceil(end) - 1);
    for (let line = 0; line < lines; line++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let i = i0; i <= i1; i++) {
        const weight = Math.min(end, i + 1) - Math.max(start, i);
        if (weight <= 0) continue;
        const p = (horizontal ? line * w + i : i * w + line) * 4;
        r += src[p] * weight;
        g += src[p + 1] * weight;
        b += src[p + 2] * weight;
        a += src[p + 3] * weight;
      }
      const q = (horizontal ? line * outW + o : o * outW + line) * 4;
      out[q] = r / scale;
      out[q + 1] = g / scale;
      out[q + 2] = b / scale;
      out[q + 3] = a / scale;
    }
  }
  return out;
}
