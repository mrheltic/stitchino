import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ESTIMATE,
  emptyCountsFor,
  estimateColor,
  fabricToBuy,
  finishedSize,
  stitchesForSize,
  stitchesPerInch,
  stitchesPerSkein,
  stitchingAdvice,
  suggestFrame,
  suggestHoop,
} from './sizeHelpers.ts';

const aida14 = { count: 14, over: 1 } as const;

describe('finished size', () => {
  it('converts stitches to millimetres', () => {
    expect(finishedSize(140, 70, aida14).widthMm).toBeCloseTo(254, 6);
    expect(finishedSize(140, 70, aida14).heightMm).toBeCloseTo(127, 6);
    expect(stitchesPerInch({ count: 28, over: 2 })).toBe(14);
    expect(finishedSize(100, 100, { count: 28, over: 2 }).widthMm).toBeCloseTo(181.43, 2);
  });

  it('converts a physical size back to stitches', () => {
    expect(stitchesForSize(254, aida14)).toBe(140);
    expect(stitchesForSize(1, aida14)).toBe(1);
  });

  it('adds margins for the fabric to buy', () => {
    expect(fabricToBuy({ widthMm: 254, heightMm: 127 })).toEqual({ widthMm: 404, heightMm: 277 });
  });
});

describe('frames and hoops', () => {
  it('picks the smallest frame with enough margin, turned to match the design', () => {
    expect(suggestFrame({ widthMm: 254, heightMm: 200 })).toMatchObject({
      widthCm: 30,
      heightCm: 24,
    });
    expect(suggestFrame({ widthMm: 120, heightMm: 170 })).toMatchObject({
      widthCm: 18,
      heightCm: 24,
    });
    expect(suggestFrame({ widthMm: 2000, heightMm: 2000 })).toBeUndefined();
  });

  it('picks a hoop that holds the whole design', () => {
    expect(suggestHoop({ widthMm: 100, heightMm: 100 })).toBe(18);
    expect(suggestHoop({ widthMm: 400, heightMm: 300 })).toBeUndefined();
  });
});

describe('stitching advice', () => {
  it('suggests strands from stitch size and needles from the weave', () => {
    expect(stitchingAdvice({ count: 11, over: 1 }).strands).toBe(3);
    expect(stitchingAdvice(aida14)).toMatchObject({ strands: 2, needles: [24, 26] });
    expect(stitchingAdvice({ count: 22, over: 1 }).strands).toBe(1);
    expect(stitchingAdvice({ count: 28, over: 2 })).toMatchObject({
      strands: 2,
      needles: [26, 28],
    });
  });
});

describe('thread estimate', () => {
  it('gives about 1,650 full stitches per skein on Aida 14 with 2 strands', () => {
    const n = stitchesPerSkein(aida14, 2);
    expect(n).toBeGreaterThan(1500);
    expect(n).toBeLessThan(1900);
    expect(stitchesPerSkein({ count: 11, over: 1 }, 3)).toBeLessThan(n);
    expect(stitchesPerSkein({ count: 18, over: 1 }, 2)).toBeGreaterThan(n);
  });

  it('rounds skeins up and is consistent with stitches per skein', () => {
    const perSkein = stitchesPerSkein(aida14, 2);
    const at = (full: number) => estimateColor({ ...emptyCountsFor(), full }, 2, 1, aida14).skeins;
    expect(at(0)).toBe(0);
    expect(at(10)).toBe(1);
    expect(at(Math.floor(perSkein * 0.95))).toBe(1);
    expect(at(Math.ceil(perSkein * 1.1))).toBe(2);
  });

  it('counts backstitch and knots', () => {
    const e = estimateColor({ ...emptyCountsFor(), backstitchCells: 100, knots: 10 }, 2, 1, aida14);
    expect(e.lengthM).toBeGreaterThan(0.5);
    expect(e.skeins).toBe(1);
    expect(DEFAULT_ESTIMATE.skeinM).toBe(8);
  });
});
