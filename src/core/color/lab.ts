import { SRGB8_TO_LINEAR, linearToSrgb8, type Rgb } from './srgb.ts';

/** CIE L*a*b* relative to the D65 white point, matching sRGB. */
export type Lab = readonly [L: number, a: number, b: number];

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

function f(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

export function linearRgbToLab(r: number, g: number, b: number): Lab {
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / YN;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function rgbToLab([r, g, b]: Rgb): Lab {
  return linearRgbToLab(SRGB8_TO_LINEAR[r], SRGB8_TO_LINEAR[g], SRGB8_TO_LINEAR[b]);
}

export function labToLinearRgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const x = fInv(fy + a / 500) * XN;
  const y = fInv(fy) * YN;
  const z = fInv(fy - b / 200) * ZN;
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

export function labToRgb(lab: Lab): Rgb {
  const [r, g, b] = labToLinearRgb(lab);
  return [linearToSrgb8(r), linearToSrgb8(g), linearToSrgb8(b)];
}
