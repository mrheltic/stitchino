import { describe, expect, it } from 'vitest';
import { EditorDocument } from '../../src/core/model/document.ts';
import { outlineCommand, outlineRuns, withOutline } from '../../src/core/model/outline.ts';
import { createPattern } from '../../src/core/model/pattern.ts';

function sample() {
  // 4 × 3 chart: a white 2 × 1 block (id 1) next to a red cell (id 2), the rest bare.
  const p = createPattern(4, 3, {
    palette: [
      { id: 1, threads: [{ brand: 'DMC', code: 'B5200' }], symbol: '', strands: 2, backStrands: 1 },
      { id: 2, threads: [{ brand: 'DMC', code: '321' }], symbol: '', strands: 2, backStrands: 1 },
    ],
  });
  p.cells[1 * 4 + 1] = 1;
  p.cells[1 * 4 + 2] = 1;
  p.cells[1 * 4 + 3] = 2;
  return p;
}

describe('automatic outline', () => {
  it('draws straight runs around the design', () => {
    const runs = outlineRuns(sample(), 'design');
    // Top and bottom of the three stitched cells, then their left and right ends.
    expect(runs).toContainEqual([2, 2, 8, 2]);
    expect(runs).toContainEqual([2, 4, 8, 4]);
    expect(runs).toContainEqual([2, 2, 2, 4]);
    expect(runs).toContainEqual([8, 2, 8, 4]);
    expect(runs).toHaveLength(4);
  });

  it('can outline one colour, including where it meets another', () => {
    expect(outlineRuns(sample(), 1)).toContainEqual([6, 2, 6, 4]);
  });

  it('adds a dark grey thread when the pattern has no dark one, as one undo step', () => {
    const p = sample();
    const out = withOutline(p, 'design');
    const dark = out.palette.find((e) => e.threads[0].code === '3799');
    expect(dark?.symbol).toBeTruthy();
    expect(out.backstitches.every((b) => b.id === dark!.id)).toBe(true);
    expect(p.backstitches).toHaveLength(0);

    const doc = new EditorDocument(sample());
    doc.execute(outlineCommand(doc.pattern, 'design')!);
    expect(doc.pattern.backstitches).toHaveLength(4);
    doc.undo();
    expect(doc.pattern.backstitches).toHaveLength(0);
    expect(doc.pattern.palette).toHaveLength(2);
  });
});
