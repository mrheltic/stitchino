import { describe, expect, it } from 'vitest';
import { paintStroke, sanitizeStrokes } from '../../src/core/convert/mask.ts';
import { DIRS, GridGraph } from '../../src/core/convert/maxflow.ts';
import { rasterFrom } from '../../src/core/convert/raster.ts';
import { findSubject } from '../../src/core/convert/subject.ts';

/** Small deterministic random numbers. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

describe('grid min cut', () => {
  it('finds the cheapest labelling (checked against every labelling)', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 25; trial++) {
      const w = 3;
      const h = 3;
      const n = w * h;
      const g = new GridGraph(w, h);
      const toBg = Array.from({ length: n }, () => Math.round(rand() * 10));
      const toFg = Array.from({ length: n }, () => Math.round(rand() * 10));
      const edges: [number, number, number][] = [];
      for (let i = 0; i < n; i++) {
        g.setTerminals(i, toBg[i], toFg[i]);
        for (const k of [0, 2, 4, 6]) {
          const x = (i % w) + DIRS[k][0];
          const y = Math.floor(i / w) + DIRS[k][1];
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const c = Math.round(rand() * 6);
          g.setEdge(i, k, c);
          edges.push([i, y * w + x, c]);
        }
      }
      const energy = (fg: (i: number) => boolean) => {
        let e = 0;
        for (let i = 0; i < n; i++) e += fg(i) ? toFg[i] : toBg[i];
        for (const [a, b, c] of edges) if (fg(a) !== fg(b)) e += c;
        return e;
      };
      let best = Infinity;
      for (let m = 0; m < 1 << n; m++)
        best = Math.min(
          best,
          energy((i) => ((m >> i) & 1) === 1),
        );
      expect(g.maxflow()).toBeCloseTo(best, 9);
      expect(energy((i) => g.isForeground(i))).toBeCloseTo(best, 9);
    }
  });
});

describe('subject finding', () => {
  it('separates a subject from a plain background', () => {
    const img = rasterFrom(120, 90, (x, y) =>
      (x - 60) ** 2 + (y - 45) ** 2 < 25 ** 2 ? [200, 40, 50] : [235, 238, 240],
    );
    const mask = findSubject(img);
    expect(mask[45 * 120 + 60]).toBe(0);
    expect(mask[0]).toBe(1);
    expect(mask[45 * 120 + 5]).toBe(1);
    expect(mask[45 * 120 + 110]).toBe(1);
  });

  it('keeps white parts inside a subject on a white background', () => {
    // A white plate with a dark rim, on white: the inside is as white as the background.
    const img = rasterFrom(120, 90, (x, y) => {
      const d = Math.hypot(x - 60, y - 45);
      return d < 28 && d > 23 ? [40, 40, 50] : [250, 250, 250];
    });
    const mask = findSubject(img);
    expect(mask[45 * 120 + 60]).toBe(0);
    expect(mask[45 * 120 + 85]).toBe(0);
    expect(mask[10 * 120 + 10]).toBe(1);
  });

  it('treats transparent pixels as background', () => {
    const img = rasterFrom(80, 60, (x) => (x < 40 ? [10, 120, 30, 0] : [10, 120, 30, 255]));
    const mask = findSubject(img);
    expect(mask[30 * 80 + 10]).toBe(1);
  });
});

describe('background brush', () => {
  it('paints and restores along a stroke', () => {
    const w = 50;
    const h = 40;
    const mask = new Uint8Array(w * h);
    paintStroke(mask, w, h, {
      mode: 'remove',
      size: 0.06,
      points: [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
    });
    expect(mask[20 * w + 25]).toBe(1);
    expect(mask[2 * w + 25]).toBe(0);
    paintStroke(mask, w, h, { mode: 'keep', size: 0.06, points: [[0.5, 0.5]] });
    expect(mask[20 * w + 25]).toBe(0);
    expect(mask[20 * w + 12]).toBe(1);
  });

  it('drops malformed strokes from saved settings', () => {
    expect(
      sanitizeStrokes([
        {
          mode: 'keep',
          size: 0.05,
          points: [
            [0.1, 2],
            [0.5, 'x'],
          ],
        },
        { mode: 'paint', size: 0.05, points: [[0.1, 0.1]] },
        'nope',
      ]),
    ).toEqual([{ mode: 'keep', size: 0.05, points: [[0.1, 1]] }]);
  });
});
