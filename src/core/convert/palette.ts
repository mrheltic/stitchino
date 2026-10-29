import { matchDistance, matchDistanceSymmetric } from '../color/index.ts';
import { ThreadMatcher, type CatalogThread } from '../threads/index.ts';
import type { CellGrid } from './resample.ts';

/**
 * Cells grouped by colour quantised to 5 bits per channel. Everything downstream works on bins:
 * a 200×200 photo has 40,000 cells but usually only a few thousand distinct bins.
 */
export interface Bins {
  n: number;
  count: Int32Array;
  /** Mean CIELAB of the cells in each bin, 3 per bin. */
  lab: Float64Array;
  /** Bin of each cell, -1 for empty cells. */
  cellBin: Int32Array;
  /** Non-empty cells. */
  total: number;
}

export function binCells(grid: CellGrid): Bins {
  const cells = grid.width * grid.height;
  const keyToBin = new Int32Array(32768).fill(-1);
  const cellBin = new Int32Array(cells).fill(-1);
  const counts: number[] = [];
  const sums: number[] = [];
  let total = 0;
  for (let i = 0; i < cells; i++) {
    if (grid.empty[i]) continue;
    const key =
      ((grid.srgb[i * 3] >> 3) << 10) |
      ((grid.srgb[i * 3 + 1] >> 3) << 5) |
      (grid.srgb[i * 3 + 2] >> 3);
    let bin = keyToBin[key];
    if (bin < 0) {
      bin = keyToBin[key] = counts.length;
      counts.push(0);
      sums.push(0, 0, 0);
    }
    counts[bin]++;
    sums[bin * 3] += grid.lab[i * 3];
    sums[bin * 3 + 1] += grid.lab[i * 3 + 1];
    sums[bin * 3 + 2] += grid.lab[i * 3 + 2];
    cellBin[i] = bin;
    total++;
  }
  const n = counts.length;
  const lab = new Float64Array(n * 3);
  for (let b = 0; b < n; b++) {
    lab[b * 3] = sums[b * 3] / counts[b];
    lab[b * 3 + 1] = sums[b * 3 + 1] / counts[b];
    lab[b * 3 + 2] = sums[b * 3 + 2] / counts[b];
  }
  return { n, count: Int32Array.from(counts), lab, cellBin, total };
}

export interface PaletteOptions {
  maxColors: number;
  /** Threads that must be in the palette; they count towards maxColors. */
  include?: readonly CatalogThread[];
  /** Non-negative ΔE penalty for a candidate, e.g. for threads the stitcher does not own. */
  penalty?: (t: CatalogThread) => number;
}

export interface PaletteResult {
  /** Chosen threads, most used first. */
  threads: CatalogThread[];
  /** Number of colours after which more colours barely improve the match. */
  suggestedColors: number;
}

/** Size exponent of the merge cost: below 1 (Ward) small but distinct areas survive longer. */
const SIZE_EXPONENT = 0.6;
/**
 * The suggested colour count is the number of clusters left when merging first has to join two
 * clearly different colours (ΔE ≥ DISTINCT_DELTA_E) that each cover at least DISTINCT_SHARE of
 * the stitches.
 */
const DISTINCT_DELTA_E = 8;
const DISTINCT_SHARE = 0.0015;
const MAX_SUGGESTION = 60;
const REFINE_ITERATIONS = 4;
const REP_CANDIDATES = 8;

interface Cluster {
  n: number;
  L: number;
  a: number;
  b: number;
  bins: number[];
  /** Index into candidates of a forced thread, or -1. */
  locked: number;
  alive: boolean;
}

/**
 * Chooses up to maxColors threads among `candidates` for the binned image:
 * 1. every bin joins its nearest candidate thread (CIEDE2000), giving initial clusters;
 * 2. clusters merge agglomeratively, cheapest first, until maxColors remain;
 * 3. each cluster takes the thread with the least total ΔE over its cells (a medoid), and
 *    assignment + medoid steps repeat until stable.
 */
export function selectPalette(
  bins: Bins,
  candidates: readonly CatalogThread[],
  opts: PaletteOptions,
): PaletteResult {
  const include = opts.include ?? [];
  const maxColors = Math.max(1, Math.round(opts.maxColors), include.length);
  if (bins.n === 0) return { threads: [...include], suggestedColors: Math.max(1, include.length) };

  const pool = uniqueThreads([...candidates, ...include]);
  const indexOf = new Map(pool.map((t, i) => [t.key, i]));
  const penalty = new Float64Array(pool.length);
  if (opts.penalty) pool.forEach((t, i) => (penalty[i] = Math.max(0, opts.penalty!(t))));
  const lockedIdx = new Set(include.map((t) => indexOf.get(t.key)!));
  const matcher = new ThreadMatcher(pool, (t) => penalty[indexOf.get(t.key)!]);

  // 1. Initial clusters, one per thread that is nearest to at least one bin.
  const byThread = new Map<number, Cluster>();
  const clusterFor = (ti: number) => {
    let c = byThread.get(ti);
    if (!c) {
      c = { n: 0, L: 0, a: 0, b: 0, bins: [], locked: lockedIdx.has(ti) ? ti : -1, alive: true };
      byThread.set(ti, c);
    }
    return c;
  };
  for (const ti of lockedIdx) clusterFor(ti);
  for (let bin = 0; bin < bins.n; bin++) {
    const ti = matcher.nearest(binLab(bins, bin)).index;
    addBin(clusterFor(ti), bins, bin);
  }
  for (const c of byThread.values()) finishMean(c, bins);
  const clusters = [...byThread.values()];

  // 2. Agglomerate down to 2 clusters, remembering the state at maxColors.
  const { snapshot, firstDistinct } = agglomerate(clusters, maxColors, bins.total);
  const suggestedColors = Math.min(MAX_SUGGESTION, Math.max(firstDistinct, include.length, 1));

  // 3. Medoids and refinement.
  let groups = snapshot.map((c) => ({ bins: c.bins, locked: c.locked }));
  let chosen: number[] = [];
  for (let iter = 0; iter < REFINE_ITERATIONS; iter++) {
    const next = chooseRepresentatives(groups, bins, pool, matcher, penalty);
    const same = next.length === chosen.length && next.every((t, i) => t === chosen[i]);
    chosen = next;
    if (same) break;
    groups = reassign(chosen, lockedIdx, bins, pool);
  }

  // Order by use, keeping forced threads even when unused.
  const usage = new Map<number, number>(chosen.map((t) => [t, 0]));
  const finalMatcher = new ThreadMatcher(chosen.map((t) => pool[t]));
  for (let bin = 0; bin < bins.n; bin++) {
    const t = chosen[finalMatcher.nearest(binLab(bins, bin)).index];
    usage.set(t, usage.get(t)! + bins.count[bin]);
  }
  const threads = chosen
    .filter((t) => usage.get(t)! > 0 || lockedIdx.has(t))
    .sort((x, y) => usage.get(y)! - usage.get(x)! || x - y)
    .map((t) => pool[t]);
  return { threads, suggestedColors };
}

function uniqueThreads(list: readonly CatalogThread[]): CatalogThread[] {
  const seen = new Set<string>();
  return list.filter((t) => !seen.has(t.key) && (seen.add(t.key), true));
}

function binLab(bins: Bins, bin: number): [number, number, number] {
  return [bins.lab[bin * 3], bins.lab[bin * 3 + 1], bins.lab[bin * 3 + 2]];
}

function addBin(c: Cluster, bins: Bins, bin: number): void {
  const k = bins.count[bin];
  c.n += k;
  c.L += bins.lab[bin * 3] * k;
  c.a += bins.lab[bin * 3 + 1] * k;
  c.b += bins.lab[bin * 3 + 2] * k;
  c.bins.push(bin);
}

function finishMean(c: Cluster, _bins: Bins): void {
  if (c.n > 0) {
    c.L /= c.n;
    c.a /= c.n;
    c.b /= c.n;
  }
}

function mergeCost(x: Cluster, y: Cluster): number {
  if ((x.locked >= 0 && y.locked >= 0) || x.n === 0 || y.n === 0) return Infinity;
  const de = matchDistanceSymmetric(x.L, x.a, x.b, y.L, y.a, y.b);
  return Math.pow((x.n * y.n) / (x.n + y.n), SIZE_EXPONENT) * de * de;
}

function agglomerate(
  clusters: Cluster[],
  keepAt: number,
  total: number,
): { snapshot: Cluster[]; firstDistinct: number } {
  const m = clusters.length;
  const nnIdx = new Int32Array(m).fill(-1);
  const nnCost = new Float64Array(m).fill(Infinity);
  const updateNN = (i: number) => {
    nnIdx[i] = -1;
    nnCost[i] = Infinity;
    for (let j = 0; j < m; j++) {
      if (j === i || !clusters[j].alive) continue;
      const c = mergeCost(clusters[i], clusters[j]);
      if (c < nnCost[i]) {
        nnCost[i] = c;
        nnIdx[i] = j;
      }
    }
  };
  for (let i = 0; i < m; i++) updateNN(i);

  let alive = m;
  let firstDistinct = 0;
  const copy = () => clusters.filter((c) => c.alive).map((c) => ({ ...c, bins: [...c.bins] }));
  let snapshot = alive <= keepAt ? copy() : [];

  while (alive > 2) {
    let i = -1;
    for (let k = 0; k < m; k++) if (clusters[k].alive && (i < 0 || nnCost[k] < nnCost[i])) i = k;
    if (i < 0 || !Number.isFinite(nnCost[i])) break;
    let j = nnIdx[i];
    // Keep the forced thread's cluster, otherwise the larger one.
    if (clusters[j].locked >= 0 || (clusters[i].locked < 0 && clusters[j].n > clusters[i].n))
      [i, j] = [j, i];
    const x = clusters[i];
    const y = clusters[j];
    if (!firstDistinct) {
      const de = matchDistanceSymmetric(x.L, x.a, x.b, y.L, y.a, y.b);
      if (de >= DISTINCT_DELTA_E && Math.min(x.n, y.n) >= DISTINCT_SHARE * total)
        firstDistinct = alive;
    }
    const n = x.n + y.n;
    x.L = (x.L * x.n + y.L * y.n) / n;
    x.a = (x.a * x.n + y.a * y.n) / n;
    x.b = (x.b * x.n + y.b * y.n) / n;
    x.n = n;
    for (const b of y.bins) x.bins.push(b);
    y.alive = false;
    y.bins = [];
    alive--;
    if (alive === keepAt) snapshot = copy();

    for (let k = 0; k < m; k++) {
      if (!clusters[k].alive) continue;
      if (k === i || nnIdx[k] === i || nnIdx[k] === j) updateNN(k);
      else {
        const c = mergeCost(clusters[k], x);
        if (c < nnCost[k]) {
          nnCost[k] = c;
          nnIdx[k] = i;
        }
      }
    }
  }
  if (snapshot.length === 0) snapshot = copy();
  // Never forced to merge distinct colours: the colours left at the end are all distinct.
  if (!firstDistinct)
    firstDistinct = clusters.filter((c) => c.alive && c.n >= DISTINCT_SHARE * total).length;
  return { snapshot, firstDistinct };
}

/** For each group, the thread minimising total ΔE (+ penalty) over its cells; duplicates merge. */
function chooseRepresentatives(
  groups: { bins: number[]; locked: number }[],
  bins: Bins,
  pool: readonly CatalogThread[],
  matcher: ThreadMatcher,
  penalty: Float64Array,
): number[] {
  const chosen: number[] = [];
  for (const g of groups) {
    if (g.locked >= 0) {
      chosen.push(g.locked);
      continue;
    }
    if (g.bins.length === 0) continue;
    let n = 0;
    let L = 0;
    let a = 0;
    let b = 0;
    for (const bin of g.bins) {
      const k = bins.count[bin];
      n += k;
      L += bins.lab[bin * 3] * k;
      a += bins.lab[bin * 3 + 1] * k;
      b += bins.lab[bin * 3 + 2] * k;
    }
    const candidates = matcher
      .nearestK([L / n, a / n, b / n], REP_CANDIDATES)
      .map((mt) => mt.index);
    let bestT = candidates[0];
    let bestE = Infinity;
    for (const t of candidates) {
      const [tl, ta, tb] = pool[t].lab;
      let e = n * penalty[t];
      for (const bin of g.bins) {
        e +=
          bins.count[bin] *
          matchDistance(
            bins.lab[bin * 3],
            bins.lab[bin * 3 + 1],
            bins.lab[bin * 3 + 2],
            tl,
            ta,
            tb,
          );
        if (e >= bestE) break;
      }
      if (e < bestE) {
        bestE = e;
        bestT = t;
      }
    }
    chosen.push(bestT);
  }
  return [...new Set(chosen)].sort((x, y) => x - y);
}

function reassign(
  chosen: number[],
  locked: Set<number>,
  bins: Bins,
  pool: readonly CatalogThread[],
): { bins: number[]; locked: number }[] {
  const groups = chosen.map((t) => ({ bins: [] as number[], locked: locked.has(t) ? t : -1 }));
  const m = new ThreadMatcher(chosen.map((t) => pool[t]));
  for (let bin = 0; bin < bins.n; bin++) groups[m.nearest(binLab(bins, bin)).index].bins.push(bin);
  return groups;
}
