import { matchDistance, type Lab } from '../color/index.ts';
import type { CatalogThread } from './catalog.ts';

/**
 * Upper bound of the CIEDE2000 lightness weighting S_L for L in [0, 100].
 * ΔE00² = l² + c² + h² + R_T·c·h with |R_T| ≤ 2, hence ΔE00 ≥ |l| = |ΔL| / S_L ≥ |ΔL| / SL_MAX.
 */
const SL_MAX = 1.7471;

export interface Match {
  index: number;
  deltaE: number;
}

/**
 * Exact nearest-thread search by `matchDistance` (CIEDE2000 tuned for dark colours) plus an
 * optional non-negative per-thread penalty. The query is the first argument of the distance.
 * Candidates are sorted by lightness and scanned outwards from the query, stopping as soon as the
 * lightness bound above proves no remaining thread can beat the current k-th best.
 */
export class ThreadMatcher {
  readonly threads: readonly CatalogThread[];
  private readonly order: Int32Array;
  private readonly sortedL: Float64Array;
  /** L, a, b of each thread in catalogue order. */
  private readonly labs: Float64Array;
  private readonly penalty: Float64Array;

  constructor(threads: readonly CatalogThread[], penalty?: (t: CatalogThread) => number) {
    if (threads.length === 0) throw new Error('ThreadMatcher needs at least one thread');
    this.threads = threads;
    this.order = Int32Array.from(threads.keys()).sort(
      (a, b) => threads[a].lab[0] - threads[b].lab[0],
    );
    this.sortedL = Float64Array.from(this.order, (i) => threads[i].lab[0]);
    this.labs = Float64Array.from(threads.flatMap((t) => t.lab));
    this.penalty = Float64Array.from(threads, (t) => {
      const p = penalty ? penalty(t) : 0;
      if (!(p >= 0)) throw new Error('Penalties must be non-negative');
      return p;
    });
  }

  nearest(lab: Lab): Match {
    return this.nearestK(lab, 1)[0];
  }

  /** The k best matches, best first (ties broken by catalogue order). */
  nearestK(lab: Lab, k: number): Match[] {
    const n = this.order.length;
    k = Math.max(1, Math.min(k, n));
    const best: Match[] = [];
    const [L, a, b] = lab;
    const labs = this.labs;
    let hi = lowerBound(this.sortedL, L);
    let lo = hi - 1;
    while (lo >= 0 || hi < n) {
      const dLo = lo >= 0 ? L - this.sortedL[lo] : Infinity;
      const dHi = hi < n ? this.sortedL[hi] - L : Infinity;
      const takeLo = dLo <= dHi;
      const dL = takeLo ? dLo : dHi;
      if (best.length === k && dL / SL_MAX >= best[k - 1].deltaE) break;
      const index = this.order[takeLo ? lo-- : hi++];
      const j = index * 3;
      const deltaE =
        matchDistance(L, a, b, labs[j], labs[j + 1], labs[j + 2]) + this.penalty[index];
      insertSorted(best, { index, deltaE }, k);
    }
    return best;
  }
}

function lowerBound(arr: Float64Array, value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function insertSorted(best: Match[], m: Match, k: number): void {
  let p = best.length;
  while (
    p > 0 &&
    (best[p - 1].deltaE > m.deltaE ||
      (best[p - 1].deltaE === m.deltaE && best[p - 1].index > m.index))
  )
    p--;
  if (p >= k) return;
  best.splice(p, 0, m);
  if (best.length > k) best.pop();
}
