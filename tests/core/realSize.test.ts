import { describe, expect, it } from 'vitest';
import { createPattern } from '../../src/core/model/pattern.ts';
import { realSizeLayout } from '../../src/render/realSizePdf.ts';

describe('real-size print layout', () => {
  it('fits a small design on one portrait page', () => {
    const p = createPattern(70, 93);
    const l = realSizeLayout(p, { fabric: p.fabric }, 'a4');
    expect(l).toMatchObject({ cols: 1, rows: 1, landscape: false });
  });

  it('splits a large design and picks the orientation with fewer pages', () => {
    // 300 × 120 on Aida 14: portrait needs 3 × 1 sheets, landscape 2 × 2.
    const wide = createPattern(300, 120);
    expect(realSizeLayout(wide, { fabric: wide.fabric }, 'a4')).toMatchObject({
      landscape: false,
      cols: 3,
      rows: 1,
    });
    // 260 × 80: landscape 2 × 1 beats portrait 3 × 1.
    const long = createPattern(260, 80);
    const l = realSizeLayout(long, { fabric: long.fabric }, 'a4');
    expect(l).toMatchObject({ landscape: true, cols: 2, rows: 1 });
    expect(l.cellsX * l.cols).toBeGreaterThanOrEqual(260);
  });

  it('needs more pages on coarser fabric', () => {
    const p = createPattern(200, 200);
    const aida11 = realSizeLayout(
      p,
      { fabric: { kind: 'aida', count: 11, over: 1, color: '#fff' } },
      'a4',
    );
    const aida14 = realSizeLayout(
      p,
      { fabric: { kind: 'aida', count: 14, over: 1, color: '#fff' } },
      'a4',
    );
    expect(aida11.cols * aida11.rows).toBe(6);
    expect(aida14.cols * aida14.rows).toBe(4);
  });
});
