import { describe, expect, it } from 'vitest';
import {
  ARM,
  HALF_SLASH,
  SYMBOLS,
  assignSymbols,
  countStitches,
  createPattern,
  isValidPartialMask,
  partialKind,
  totalStitches,
} from '../../src/core/model/index.ts';

describe('pattern model', () => {
  it('validates sizes', () => {
    expect(() => createPattern(0, 10)).toThrow();
    expect(() => createPattern(10.5, 10)).toThrow();
    expect(() => createPattern(2000, 10)).toThrow();
    expect(createPattern(3, 2).cells).toHaveLength(6);
  });

  it('classifies partial stitch masks', () => {
    expect(partialKind(ARM.TL)).toBe('quarter');
    expect(partialKind(HALF_SLASH)).toBe('half');
    expect(partialKind(ARM.TL | ARM.TR | ARM.BL)).toBe('threeQuarter');
    expect(() => partialKind(15)).toThrow();
    expect(isValidPartialMask(15)).toBe(false);
    expect(isValidPartialMask(ARM.TR | ARM.BL)).toBe(true);
    expect(isValidPartialMask(ARM.TL | ARM.TR)).toBe(false);
  });

  it('counts stitches per colour', () => {
    const p = createPattern(4, 4);
    p.palette = [
      { id: 1, threads: [{ brand: 'DMC', code: '310' }], symbol: '', strands: 2, backStrands: 1 },
      { id: 2, threads: [{ brand: 'DMC', code: '321' }], symbol: '', strands: 2, backStrands: 1 },
    ];
    p.cells.set([1, 1, 2, 0]);
    p.partials.set(5, [
      { mask: HALF_SLASH, id: 2 },
      { mask: ARM.TL, id: 1 },
    ]);
    p.backstitches.push({ x1: 0, y1: 0, x2: 4, y2: 0, id: 1 });
    p.knots.push({ x: 1, y: 1, id: 2 });
    const c = countStitches(p);
    expect(c.get(1)).toMatchObject({ full: 2, quarter: 1, backstitchCells: 2 });
    expect(c.get(2)).toMatchObject({ full: 1, half: 1, knots: 1 });
    expect(totalStitches(p)).toBe(4);
  });

  it('assigns unique symbols in order, keeping valid existing ones', () => {
    const entries = [
      { symbol: '' },
      { symbol: SYMBOLS[0] },
      { symbol: 'not-a-symbol' },
      { symbol: SYMBOLS[0] },
    ];
    assignSymbols(entries);
    const symbols = entries.map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(4);
    expect(symbols[1]).toBe(SYMBOLS[0]);
    expect(symbols[0]).toBe(SYMBOLS[1]);
    expect(symbols.every((s) => SYMBOLS.includes(s))).toBe(true);
  });

  it('has a symbol set without duplicates', () => {
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(100);
    expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length);
  });
});
