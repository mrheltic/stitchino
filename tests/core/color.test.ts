import { describe, expect, it } from 'vitest';
import {
  deltaE2000,
  hexToRgb,
  labToRgb,
  oklabToRgb,
  rgbToHex,
  rgbToLab,
  rgbToOklab,
  type Lab,
} from '../../src/core/color/index.ts';

// Sharma, Wu & Dalal (2005), Table 1: L1 a1 b1 L2 a2 b2 ΔE00
const SHARMA: readonly (readonly number[])[] = [
  [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
  [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
  [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
  [50, -1.3802, -84.2814, 50, 0, -82.7485, 1.0],
  [50, -1.1848, -84.8006, 50, 0, -82.7485, 1.0],
  [50, -0.9009, -85.5211, 50, 0, -82.7485, 1.0],
  [50, 0, 0, 50, -1, 2, 2.3669],
  [50, -1, 2, 50, 0, 0, 2.3669],
  [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
  [50, 2.49, -0.001, 50, -2.49, 0.001, 7.1792],
  [50, 2.49, -0.001, 50, -2.49, 0.0011, 7.2195],
  [50, 2.49, -0.001, 50, -2.49, 0.0012, 7.2195],
  [50, -0.001, 2.49, 50, 0.0009, -2.49, 4.8045],
  [50, -0.001, 2.49, 50, 0.001, -2.49, 4.8045],
  [50, -0.001, 2.49, 50, 0.0011, -2.49, 4.7461],
  [50, 2.5, 0, 50, 0, -2.5, 4.3065],
  [50, 2.5, 0, 73, 25, -18, 27.1492],
  [50, 2.5, 0, 61, -5, 29, 22.8977],
  [50, 2.5, 0, 56, -27, -3, 31.903],
  [50, 2.5, 0, 58, 24, 15, 19.4535],
  [50, 2.5, 0, 50, 3.1736, 0.5854, 1.0],
  [50, 2.5, 0, 50, 3.2972, 0, 1.0],
  [50, 2.5, 0, 50, 1.8634, 0.5757, 1.0],
  [50, 2.5, 0, 50, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

describe('deltaE2000', () => {
  it.each(SHARMA.map((row, i) => [i + 1, row] as const))('Sharma pair %i', (_i, row) => {
    const lab1: Lab = [row[0], row[1], row[2]];
    const lab2: Lab = [row[3], row[4], row[5]];
    expect(deltaE2000(lab1, lab2)).toBeCloseTo(row[6], 4);
    expect(deltaE2000(lab2, lab1)).toBeCloseTo(row[6], 4);
  });

  it('is zero for identical colours', () => {
    expect(deltaE2000([42, 10, -20], [42, 10, -20])).toBe(0);
  });
});

describe('colour space conversions', () => {
  it('maps sRGB white and black to the expected Lab values', () => {
    const white = rgbToLab([255, 255, 255]);
    expect(white[0]).toBeCloseTo(100, 2);
    expect(white[1]).toBeCloseTo(0, 2);
    expect(white[2]).toBeCloseTo(0, 2);
    expect(rgbToLab([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('matches a reference Lab value for pure red', () => {
    const [L, a, b] = rgbToLab([255, 0, 0]);
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });

  it('round-trips sRGB through Lab and OKLab', () => {
    for (let r = 0; r < 256; r += 17) {
      for (let g = 0; g < 256; g += 51) {
        for (let b = 0; b < 256; b += 85) {
          expect(labToRgb(rgbToLab([r, g, b]))).toEqual([r, g, b]);
          expect(oklabToRgb(rgbToOklab([r, g, b]))).toEqual([r, g, b]);
        }
      }
    }
  });

  it('parses and formats hex colours', () => {
    expect(hexToRgb('#B44A5A')).toEqual([180, 74, 90]);
    expect(rgbToHex([180, 74, 90])).toBe('#b44a5a');
    expect(() => hexToRgb('zz')).toThrow();
  });
});
