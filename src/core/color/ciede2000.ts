import type { Lab } from './lab.ts';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const POW25_7 = 6103515625; // 25^7

/**
 * CIEDE2000 colour difference, following Sharma, Wu & Dalal (2005),
 * "The CIEDE2000 Color-Difference Formula: Implementation Notes...".
 */
export function deltaE2000(lab1: Lab, lab2: Lab, kL = 1, kC = 1, kH = 1): number {
  return deltaE2000Raw(lab1[0], lab1[1], lab1[2], lab2[0], lab2[1], lab2[2], kL, kC, kH);
}

/** Scalar version for hot loops. */
export function deltaE2000Raw(
  L1: number,
  a1: number,
  b1: number,
  L2: number,
  a2: number,
  b2: number,
  kL = 1,
  kC = 1,
  kH = 1,
): number {
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar3 = Cbar * Cbar * Cbar;
  const Cbar7 = Cbar3 * Cbar3 * Cbar;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const chromaProduct = C1p * C2p;
  let dhp = 0;
  if (chromaProduct !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(chromaProduct) * Math.sin(dhp * (DEG / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (chromaProduct !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp /= 2;
    else if (hbarp < 360) hbarp = (hbarp + 360) / 2;
    else hbarp = (hbarp - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * DEG) +
    0.24 * Math.cos(2 * hbarp * DEG) +
    0.32 * Math.cos((3 * hbarp + 6) * DEG) -
    0.2 * Math.cos((4 * hbarp - 63) * DEG);
  const hx = (hbarp - 275) / 25;
  const dTheta = 30 * Math.exp(-hx * hx);
  const Cbarp3 = Cbarp * Cbarp * Cbarp;
  const Cbarp7 = Cbarp3 * Cbarp3 * Cbarp;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const Lm50sq = (Lbarp - 50) * (Lbarp - 50);
  const SL = 1 + (0.015 * Lm50sq) / Math.sqrt(20 + Lm50sq);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * DEG) * RC;

  const l = dLp / (kL * SL);
  const c = dCp / (kC * SC);
  const h = dHp / (kH * SH);
  return Math.sqrt(l * l + c * c + h * h + RT * c * h);
}

function hueAngle(b: number, ap: number): number {
  if (b === 0 && ap === 0) return 0;
  const h = Math.atan2(b, ap) * RAD;
  return h >= 0 ? h : h + 360;
}
