import { DIRS, GridGraph } from './maxflow.ts';
import type { RasterImage } from './raster.ts';

/**
 * Finds the subject of a picture and returns the background mask (1 = background) at the
 * picture's size. GrabCut (Rother, Kolmogorov, Blake, 2004): the edges of the picture are taken as
 * background, colour models of subject and background are refined in turns, and a minimum graph
 * cut puts the boundary where colours change. No learned model: it works best when the subject is
 * framed with some background around it.
 */
export function findSubject(img: RasterImage, maxSide = 300): Uint8Array {
  const small = shrink(img, maxSide);
  const { w, h, rgb, opaque } = small;
  const n = w * h;
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const fixed = new Uint8Array(n);
  const fg = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < band || y < band || x >= w - band || y >= h - band || !opaque[i]) fixed[i] = 1;
      else fg[i] = 1;
    }
  }

  // Smoothness: neighbours of similar colour want the same label.
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (const k of [0, 2, 4, 6]) {
      const j = neighbour(i, k, w, h);
      if (j < 0) continue;
      sum += diff2(rgb, i, j);
      count++;
    }
  }
  const beta = 1 / (2 * Math.max(sum / Math.max(1, count), 1e-6));
  const GAMMA = 50;
  const weights = new Float64Array(n * 8);
  for (let i = 0; i < n; i++) {
    for (const k of [0, 2, 4, 6]) {
      const j = neighbour(i, k, w, h);
      if (j < 0) continue;
      weights[i * 8 + k] = (k >= 4 ? Math.SQRT1_2 : 1) * GAMMA * Math.exp(-beta * diff2(rgb, i, j));
    }
  }
  const HARD = 9 * GAMMA;

  for (let iter = 0; iter < 4; iter++) {
    const fgModel = Gmm.fit(rgb, fg, 1);
    const bgModel = Gmm.fit(rgb, fg, 0);
    if (!fgModel || !bgModel) break;
    const graph = new GridGraph(w, h);
    for (let i = 0; i < n; i++) {
      if (fixed[i]) graph.setTerminals(i, 0, HARD);
      else graph.setTerminals(i, bgModel.cost(rgb, i), fgModel.cost(rgb, i));
      for (const k of [0, 2, 4, 6]) if (weights[i * 8 + k]) graph.setEdge(i, k, weights[i * 8 + k]);
    }
    graph.maxflow();
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const v = fixed[i] ? 0 : graph.isForeground(i) ? 1 : 0;
      if (v !== fg[i]) changed++;
      fg[i] = v;
    }
    if (changed === 0) break;
  }

  tidy(fg, w, h);
  return grow(fg, w, h, img.width, img.height);
}

function neighbour(i: number, k: number, w: number, h: number): number {
  const x = (i % w) + DIRS[k][0];
  const y = Math.floor(i / w) + DIRS[k][1];
  return x >= 0 && y >= 0 && x < w && y < h ? y * w + x : -1;
}

function diff2(rgb: Float64Array, i: number, j: number): number {
  const r = rgb[i * 3] - rgb[j * 3];
  const g = rgb[i * 3 + 1] - rgb[j * 3 + 1];
  const b = rgb[i * 3 + 2] - rgb[j * 3 + 2];
  return r * r + g * g + b * b;
}

/** Box-averaged copy no larger than `maxSide`, colours 0..1. */
function shrink(img: RasterImage, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const rgb = new Float64Array(w * h * 3);
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let c = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = (sy * img.width + sx) * 4;
          r += img.data[p];
          g += img.data[p + 1];
          b += img.data[p + 2];
          a += img.data[p + 3];
          c++;
        }
      }
      const i = y * w + x;
      rgb[i * 3] = r / c / 255;
      rgb[i * 3 + 1] = g / c / 255;
      rgb[i * 3 + 2] = b / c / 255;
      opaque[i] = a / c >= 128 ? 1 : 0;
    }
  }
  return { w, h, rgb, opaque };
}

/**
 * Drops specks of subject (under 0.5% of the picture) and fills every hole the subject encloses:
 * inside its outline a white area looks just like a white background, but it belongs to the
 * subject. Real gaps (between an arm and the body) can be cleared with the brush.
 */
function tidy(fg: Uint8Array, w: number, h: number): void {
  const limit = Math.max(4, Math.round(w * h * 0.005));
  for (const value of [1, 0]) {
    const seen = new Uint8Array(w * h);
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || fg[start] !== value) continue;
      const region: number[] = [start];
      seen[start] = 1;
      let touchesEdge = false;
      for (let r = 0; r < region.length; r++) {
        const i = region[r];
        const x = i % w;
        const y = (i - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
        for (const k of [0, 1, 2, 3]) {
          const j = neighbour(i, k, w, h);
          if (j >= 0 && !seen[j] && fg[j] === value) {
            seen[j] = 1;
            region.push(j);
          }
        }
      }
      const flip = value === 1 ? region.length < limit : !touchesEdge;
      if (flip) for (const i of region) fg[i] = 1 - value;
    }
  }
}

/** Scales the subject map back up with bilinear filtering: smooth edges, not blocks. */
function grow(fg: Uint8Array, w: number, h: number, W: number, H: number): Uint8Array {
  const mask = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    const fy = Math.min(h - 1, Math.max(0, ((Y + 0.5) * h) / H - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let X = 0; X < W; X++) {
      const fx = Math.min(w - 1, Math.max(0, ((X + 0.5) * w) / W - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const v =
        (fg[y0 * w + x0] * (1 - tx) + fg[y0 * w + x1] * tx) * (1 - ty) +
        (fg[y1 * w + x0] * (1 - tx) + fg[y1 * w + x1] * tx) * ty;
      mask[Y * W + X] = v >= 0.5 ? 0 : 1;
    }
  }
  return mask;
}

const K = 5;

/** Gaussian mixture of colours (full covariance), the colour model of one side. */
class Gmm {
  private readonly weight: Float64Array;
  private readonly mean: Float64Array;
  private readonly inv: Float64Array;
  private readonly norm: Float64Array;

  private constructor(
    weight: Float64Array,
    mean: Float64Array,
    inv: Float64Array,
    norm: Float64Array,
  ) {
    this.weight = weight;
    this.mean = mean;
    this.inv = inv;
    this.norm = norm;
  }

  /** Fits the pixels whose label equals `side`, splitting them into colour clusters first. */
  static fit(rgb: Float64Array, labels: Uint8Array, side: number): Gmm | null {
    const idx: number[] = [];
    for (let i = 0; i < labels.length; i++) if (labels[i] === side) idx.push(i);
    if (idx.length < K) return null;
    // k-means with deterministic starting points spread along brightness.
    const order = [...idx].sort(
      (a, b) =>
        rgb[a * 3] +
        rgb[a * 3 + 1] +
        rgb[a * 3 + 2] -
        (rgb[b * 3] + rgb[b * 3 + 1] + rgb[b * 3 + 2]),
    );
    const centers = new Float64Array(K * 3);
    for (let k = 0; k < K; k++) {
      const p = order[Math.floor(((k + 0.5) * order.length) / K)];
      centers.set([rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2]], k * 3);
    }
    const assign = new Int32Array(idx.length);
    for (let round = 0; round < 6; round++) {
      const sums = new Float64Array(K * 4);
      for (let t = 0; t < idx.length; t++) {
        const p = idx[t];
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < K; k++) {
          const dr = rgb[p * 3] - centers[k * 3];
          const dg = rgb[p * 3 + 1] - centers[k * 3 + 1];
          const db = rgb[p * 3 + 2] - centers[k * 3 + 2];
          const d = dr * dr + dg * dg + db * db;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        assign[t] = best;
        sums[best * 4] += rgb[p * 3];
        sums[best * 4 + 1] += rgb[p * 3 + 1];
        sums[best * 4 + 2] += rgb[p * 3 + 2];
        sums[best * 4 + 3]++;
      }
      for (let k = 0; k < K; k++) {
        const c = sums[k * 4 + 3];
        if (c) centers.set([sums[k * 4] / c, sums[k * 4 + 1] / c, sums[k * 4 + 2] / c], k * 3);
      }
    }

    const weight = new Float64Array(K);
    const mean = new Float64Array(K * 3);
    const inv = new Float64Array(K * 9);
    const norm = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      let c = 0;
      const m = [0, 0, 0];
      for (let t = 0; t < idx.length; t++) {
        if (assign[t] !== k) continue;
        const p = idx[t];
        m[0] += rgb[p * 3];
        m[1] += rgb[p * 3 + 1];
        m[2] += rgb[p * 3 + 2];
        c++;
      }
      if (!c) continue;
      m[0] /= c;
      m[1] /= c;
      m[2] /= c;
      const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (let t = 0; t < idx.length; t++) {
        if (assign[t] !== k) continue;
        const p = idx[t];
        const d = [rgb[p * 3] - m[0], rgb[p * 3 + 1] - m[1], rgb[p * 3 + 2] - m[2]];
        for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) cov[r * 3 + s] += d[r] * d[s];
      }
      for (let r = 0; r < 9; r++) cov[r] /= c;
      // A little extra variance keeps flat areas (a white background) from becoming singular.
      cov[0] += 1e-4;
      cov[4] += 1e-4;
      cov[8] += 1e-4;
      const det =
        cov[0] * (cov[4] * cov[8] - cov[5] * cov[7]) -
        cov[1] * (cov[3] * cov[8] - cov[5] * cov[6]) +
        cov[2] * (cov[3] * cov[7] - cov[4] * cov[6]);
      inv.set(
        [
          (cov[4] * cov[8] - cov[5] * cov[7]) / det,
          (cov[2] * cov[7] - cov[1] * cov[8]) / det,
          (cov[1] * cov[5] - cov[2] * cov[4]) / det,
          (cov[5] * cov[6] - cov[3] * cov[8]) / det,
          (cov[0] * cov[8] - cov[2] * cov[6]) / det,
          (cov[2] * cov[3] - cov[0] * cov[5]) / det,
          (cov[3] * cov[7] - cov[4] * cov[6]) / det,
          (cov[1] * cov[6] - cov[0] * cov[7]) / det,
          (cov[0] * cov[4] - cov[1] * cov[3]) / det,
        ],
        k * 9,
      );
      weight[k] = c / idx.length;
      mean.set(m, k * 3);
      norm[k] = weight[k] / Math.sqrt(Math.pow(2 * Math.PI, 3) * det);
    }
    return new Gmm(weight, mean, inv, norm);
  }

  /** −log of the colour's likelihood, capped so one odd pixel can't dominate the cut. */
  cost(rgb: Float64Array, i: number): number {
    let p = 0;
    for (let k = 0; k < K; k++) {
      if (!this.weight[k]) continue;
      const d0 = rgb[i * 3] - this.mean[k * 3];
      const d1 = rgb[i * 3 + 1] - this.mean[k * 3 + 1];
      const d2 = rgb[i * 3 + 2] - this.mean[k * 3 + 2];
      const v = this.inv.subarray(k * 9, k * 9 + 9);
      const q =
        d0 * (v[0] * d0 + v[1] * d1 + v[2] * d2) +
        d1 * (v[3] * d0 + v[4] * d1 + v[5] * d2) +
        d2 * (v[6] * d0 + v[7] * d1 + v[8] * d2);
      p += this.norm[k] * Math.exp(-0.5 * q);
    }
    return Math.min(40, -Math.log(p + 1e-12));
  }
}
