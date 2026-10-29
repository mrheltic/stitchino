import { deltaE2000Raw } from './ciede2000.ts';

/** Lightness below which chroma and hue differences count progressively less. */
const DARK_L = 35;
/** kC = kH at L* = 0. */
const DARK_K_MAX = 2.5;

function darkK(L: number): number {
  return L >= DARK_L ? 1 : 1 + ((DARK_L - Math.max(0, L)) / DARK_L) * (DARK_K_MAX - 1);
}

/**
 * Colour distance used to match image colours to threads: CIEDE2000 where, for dark targets,
 * chroma and hue differences are down-weighted (kC = kH grow from 1 at L* 35 to 2.5 at L* 0).
 * Near-black areas are seen mostly by their lightness; plain CIEDE2000 would happily turn a
 * barely bluish shadow into a vivid navy thread. Lightness weighting (kL) is unchanged, so
 * ΔE ≥ |ΔL| / S_L still holds for search pruning. The first colour is the target.
 */
export function matchDistance(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  const k = darkK(L1);
  return deltaE2000Raw(L1, a1, b1, L2, a2, b2, 1, k, k);
}

/** Symmetric variant (weights from the mean lightness), for comparing two image colours. */
export function matchDistanceSymmetric(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
): number {
  const k = darkK((L1 + L2) / 2);
  return deltaE2000Raw(L1, a1, b1, L2, a2, b2, 1, k, k);
}
