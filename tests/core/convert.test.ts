import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONVERT_PARAMS,
  NoCandidateThreadsError,
  ConvertSession,
  computeMetrics,
  convertImage,
  rasterFrom,
  removeConfetti,
  resampleToGrid,
  type ConvertParams,
} from '../../src/core/convert/index.ts';
import { requireThread } from '../../src/core/threads/index.ts';

const rgb = (key: string) => [...requireThread(key).rgb];
const params = (p: Partial<ConvertParams> = {}): ConvertParams => ({
  ...DEFAULT_CONVERT_PARAMS,
  width: 20,
  height: 20,
  ...p,
});

/** 40×40 image with four flat quadrants in exact DMC colours. */
const QUADRANTS = ['DMC:310', 'DMC:321', 'DMC:796', 'DMC:3865'];
const quadrants = rasterFrom(40, 40, (x, y) => rgb(QUADRANTS[(y < 20 ? 0 : 2) + (x < 20 ? 0 : 1)]));
const keysOf = (palette: { threads: { brand: string; code: string }[] }[]) =>
  palette.map((p) => `${p.threads[0].brand}:${p.threads[0].code}`);

describe('resampling', () => {
  it('averages in linear light', () => {
    const checker = rasterFrom(2, 2, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    const grid = resampleToGrid(checker, 1, 1);
    expect(grid.linear[0]).toBeCloseTo(0.5, 5);
    expect(grid.srgb[0]).toBe(188);
  });

  it('marks transparent and masked cells as empty', () => {
    const img = rasterFrom(4, 2, (x) => (x < 2 ? [10, 20, 30, 0] : [10, 20, 30, 255]));
    expect([...resampleToGrid(img, 2, 1).empty]).toEqual([1, 0]);
    const mask = new Uint8Array(8);
    mask.set([0, 0, 1, 1, 0, 0, 1, 1]);
    expect([...resampleToGrid(img, 2, 1, mask).empty]).toEqual([1, 1]);
  });
});

describe('conversion', () => {
  it('recovers exact thread colours and suggests their number', () => {
    const out = convertImage(quadrants, params());
    expect(new Set(keysOf(out.palette))).toEqual(new Set(QUADRANTS));
    expect(out.suggestedColors).toBe(4);
    expect(out.metrics.colors).toBe(4);
    expect(out.metrics.stitches).toBe(400);
    const id = (key: string) => out.palette[keysOf(out.palette).indexOf(key)].id;
    expect(out.cells[0]).toBe(id('DMC:310'));
    expect(out.cells[19]).toBe(id('DMC:321'));
    expect(out.cells[399]).toBe(id('DMC:3865'));
  });

  it('respects the colour limit', () => {
    const out = convertImage(quadrants, params({ maxColors: 2 }));
    expect(out.palette).toHaveLength(2);
    expect(new Set(out.cells)).toEqual(new Set(out.palette.map((p) => p.id)));
  });

  it('gives unique symbols, most used colour first', () => {
    const out = convertImage(quadrants, params());
    expect(new Set(out.palette.map((p) => p.symbol)).size).toBe(4);
    expect(out.palette.map((p) => p.id)).toEqual([1, 2, 3, 4]);
  });

  it('honours forced, excluded and owned threads', () => {
    const forced = convertImage(quadrants, params({ include: ['DMC:Blanc'] }));
    expect(keysOf(forced.palette)).toContain('DMC:Blanc');

    const excluded = convertImage(quadrants, params({ exclude: ['DMC:321'] }));
    expect(keysOf(excluded.palette)).not.toContain('DMC:321');
    expect(excluded.palette).toHaveLength(4);

    const owned = convertImage(
      quadrants,
      params({ inventory: { keys: ['DMC:310', 'DMC:Blanc', 'DMC:666'], mode: 'only' } }),
    );
    expect(
      keysOf(owned.palette).every((k) => ['DMC:310', 'DMC:Blanc', 'DMC:666'].includes(k)),
    ).toBe(true);

    expect(() =>
      convertImage(quadrants, params({ inventory: { keys: [], mode: 'only' } })),
    ).toThrow(NoCandidateThreadsError);
  });

  it('can mix brands only through forced threads', () => {
    const out = convertImage(quadrants, params({ brand: 'Anchor', include: ['DMC:310'] }));
    const brands = new Set(out.palette.map((p) => p.threads[0].brand));
    expect(brands).toEqual(new Set(['Anchor', 'DMC']));
  });

  it('removes a stray stitch but protects a strong detail', () => {
    const stray = rasterFrom(20, 20, (x, y) =>
      x === 10 && y === 10 ? rgb('DMC:3705') : rgb('DMC:321'),
    );
    const cleaned = convertImage(
      stray,
      params({ cleanup: 1, protectDetails: false, minStitches: 0 }),
    );
    expect(cleaned.palette).toHaveLength(1);
    const detail = rasterFrom(20, 20, (x, y) =>
      x === 10 && y === 10 ? rgb('DMC:3865') : rgb('DMC:310'),
    );
    const kept = convertImage(detail, params({ cleanup: 1, protectDetails: true, minStitches: 0 }));
    expect(kept.palette).toHaveLength(2);
  });

  it('merges colours with too few stitches', () => {
    const img = rasterFrom(20, 20, (x, y) => (x < 2 && y < 1 ? rgb('DMC:796') : rgb('DMC:321')));
    const out = convertImage(img, params({ cleanup: 0, minStitches: 5 }));
    expect(out.palette).toHaveLength(1);
  });

  it('leaves masked background unstitched', () => {
    const mask = new Uint8Array(40 * 40);
    for (let i = 0; i < 40 * 20; i++) mask[i] = 1;
    const out = new ConvertSession(quadrants, mask).run(params());
    expect(out.metrics.stitches).toBe(200);
    expect(out.cells[0]).toBe(0);
  });

  it('dithers a gradient deterministically', () => {
    const ramp = rasterFrom(64, 8, (x) => [x * 4, x * 4, x * 4]);
    const p = params({
      width: 64,
      height: 8,
      maxColors: 3,
      dither: 'floyd-steinberg',
      ditherStrength: 1,
      cleanup: 0,
      minStitches: 0,
    });
    const a = convertImage(ramp, p);
    const b = convertImage(ramp, p);
    expect([...a.cells]).toEqual([...b.cells]);
    expect(a.palette.length).toBeLessThanOrEqual(3);
    // Dithering mixes neighbouring colours: rows are not just three solid bands.
    const plain = convertImage(ramp, { ...p, dither: 'none' });
    expect(a.metrics.changesPer100).toBeGreaterThan(plain.metrics.changesPer100);
  });

  it('reuses cached grids across parameter changes', () => {
    const session = new ConvertSession(quadrants);
    const [few, many] = session.variants(params(), [2, 10]);
    expect(few.palette).toHaveLength(2);
    expect(many.palette).toHaveLength(4);
  });
});

describe('cleanup and metrics', () => {
  it('fills pinholes and removes background specks', () => {
    // 5×5: colour 0 everywhere, one hole (-1) at the centre, one speck of 1 in an empty corner area.
    const assign = new Int16Array(25).fill(0);
    assign[12] = -1;
    const lab = Float64Array.from([50, 0, 0, 80, 0, 0]);
    expect(removeConfetti(assign, 5, 5, lab, 1, false)).toBe(1);
    expect(assign[12]).toBe(0);
    const speck = new Int16Array(25).fill(-1);
    speck[12] = 1;
    removeConfetti(speck, 5, 5, lab, 1, true);
    expect(speck[12]).toBe(-1);
  });

  it('counts confetti and colour changes', () => {
    const cells = Uint16Array.from([1, 1, 0, 2, 1, 1, 0, 0, 1, 1, 0, 0]);
    const m = computeMetrics(cells, 4, 3);
    expect(m.stitches).toBe(7);
    expect(m.colors).toBe(2);
    expect(m.confetti).toBe(1);
  });
});
