import { describe, expect, it } from 'vitest';
import { CellsCommand, EditorDocument, ListCommand, readCell } from '../../src/core/model/document.ts';
import {
  cleanupCommand,
  clearCommand,
  cornerAt,
  cropCommand,
  ellipseCells,
  extractClip,
  flipClip,
  floodRegion,
  isolatedCount,
  lineCells,
  mergeColorsCommand,
  paint,
  pasteCommand,
  rectCells,
  replaceColorCommand,
  resizeCommand,
  rotateClip,
  threeQuarterFor,
  withStitch,
  withoutStitch,
} from '../../src/core/model/ops.ts';
import { ARM, FULL_MASK, HALF_SLASH, createPattern, type Pattern } from '../../src/core/model/pattern.ts';

function sample(w = 6, h = 4): Pattern {
  const p = createPattern(w, h);
  p.palette = [
    { id: 1, threads: [{ brand: 'DMC', code: '310' }], symbol: '●', strands: 2, backStrands: 1 },
    { id: 2, threads: [{ brand: 'DMC', code: '321' }], symbol: '■', strands: 2, backStrands: 1 },
    { id: 3, threads: [{ brand: 'DMC', code: '796' }], symbol: '▲', strands: 2, backStrands: 1 },
  ];
  return p;
}

describe('cell states', () => {
  it('combines partial stitches and collapses a full cross', () => {
    let st = withStitch({ full: 0 }, HALF_SLASH, 1);
    expect(st).toEqual({ full: 0, partials: [{ mask: HALF_SLASH, id: 1 }] });
    st = withStitch(st, ARM.TL, 2);
    expect(st.partials).toEqual([
      { mask: ARM.TL, id: 2 },
      { mask: HALF_SLASH, id: 1 },
    ]);
    st = withStitch(st, ARM.TL | ARM.BR, 1);
    expect(st).toEqual({ full: 1 });
  });

  it('splits a full stitch when a quarter of another colour goes on top', () => {
    const st = withStitch({ full: 1 }, ARM.TR, 2);
    expect(st.partials).toEqual([
      { mask: ARM.TR, id: 2 },
      { mask: FULL_MASK & ~ARM.TR, id: 1 },
    ]);
    expect(withoutStitch(st, ARM.TR)).toEqual({ full: 0, partials: [{ mask: FULL_MASK & ~ARM.TR, id: 1 }] });
  });

  it('turns an overlapped half into the remaining arm', () => {
    const st = withStitch({ full: 0, partials: [{ mask: HALF_SLASH, id: 1 }] }, ARM.TR, 2);
    expect(st.partials).toEqual([
      { mask: ARM.TR, id: 2 },
      { mask: ARM.BL, id: 1 },
    ]);
  });

  it('picks corners and three-quarter masks', () => {
    expect(cornerAt(0.2, 0.8)).toBe(ARM.BL);
    expect(threeQuarterFor(ARM.TL)).toBe(ARM.TL | ARM.TR | ARM.BL);
  });
});

describe('editor document', () => {
  it('undoes and redoes a transaction as one step', () => {
    const doc = new EditorDocument(sample());
    const seen: unknown[] = [];
    doc.subscribe((info) => seen.push(info.cells));
    doc.begin();
    for (const pt of lineCells(0, 0, 3, 0)) {
      const cmd = new CellsCommand(doc.pattern.width);
      paint(doc.pattern, cmd, [pt], FULL_MASK, 1);
      doc.execute(cmd);
    }
    doc.commit();
    expect([...doc.pattern.cells.slice(0, 5)]).toEqual([1, 1, 1, 1, 0]);
    doc.undo();
    expect([...doc.pattern.cells.slice(0, 5)]).toEqual([0, 0, 0, 0, 0]);
    expect(doc.canRedo).toBe(true);
    doc.redo();
    expect(doc.pattern.cells[3]).toBe(1);
    // 4 strokes, the commit (undo becomes available), undo and redo.
    expect(seen.length).toBe(7);
  });

  it('paints with symmetry, mirroring partial masks', () => {
    const p = sample();
    const cmd = new CellsCommand(p.width);
    paint(p, cmd, [[0, 0]], ARM.TL, 2, 'horizontal');
    const doc = new EditorDocument(p);
    doc.execute(cmd);
    expect(readCell(p, 0).partials).toEqual([{ mask: ARM.TL, id: 2 }]);
    expect(readCell(p, 5).partials).toEqual([{ mask: ARM.TR, id: 2 }]);
  });

  it('restores backstitch by value after a resize and undo', () => {
    const doc = new EditorDocument(sample());
    doc.execute(new ListCommand('backstitches', [{ x1: 0, y1: 0, x2: 2, y2: 2, id: 1 }], []));
    doc.execute(resizeCommand(doc.pattern, 8, 6, 0.5, 0.5));
    expect(doc.pattern.width).toBe(8);
    expect(doc.pattern.backstitches[0]).toMatchObject({ x1: 2, y1: 2 });
    doc.undo();
    expect(doc.pattern.width).toBe(6);
    doc.undo();
    expect(doc.pattern.backstitches).toHaveLength(0);
  });
});

describe('shapes and regions', () => {
  it('draws lines, rectangles and ellipses', () => {
    expect(lineCells(0, 0, 3, 1)).toHaveLength(4);
    expect(rectCells(0, 0, 2, 2, false)).toHaveLength(8);
    expect(rectCells(0, 0, 2, 2, true)).toHaveLength(9);
    const e = ellipseCells(0, 0, 6, 4, true);
    expect(e.length).toBeGreaterThan(20);
    expect(e.length).toBeLessThan(35);
  });

  it('flood fills a same-colour region without crossing partial stitches', () => {
    const p = sample(4, 1);
    p.cells.set([1, 1, 0, 1]);
    expect(floodRegion(p, 0, 0)).toHaveLength(2);
    p.partials.set(1, [{ mask: ARM.TL, id: 2 }]);
    p.cells[1] = 0;
    expect(floodRegion(p, 0, 0)).toHaveLength(1);
  });
});

describe('palette operations', () => {
  it('replaces and merges colours everywhere', () => {
    const p = sample();
    p.cells.set([1, 2, 2, 3]);
    p.partials.set(4, [{ mask: HALF_SLASH, id: 2 }]);
    p.knots.push({ x: 1, y: 1, id: 2 });
    const doc = new EditorDocument(p);
    doc.execute(replaceColorCommand(p, 2, 3));
    expect([...p.cells.slice(0, 4)]).toEqual([1, 3, 3, 3]);
    expect(p.partials.get(4)).toEqual([{ mask: HALF_SLASH, id: 3 }]);
    expect(p.knots[0].id).toBe(3);
    doc.execute(mergeColorsCommand(p, 3, 1));
    expect(p.palette.map((e) => e.id)).toEqual([1, 2]);
    expect([...p.cells.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    doc.undo();
    doc.undo();
    expect([...p.cells.slice(0, 4)]).toEqual([1, 2, 2, 3]);
    expect(p.palette).toHaveLength(3);
  });
});

describe('canvas and clips', () => {
  it('crops and resizes around an anchor', () => {
    const p = sample(4, 4);
    p.cells[5] = 2; // (1, 1)
    const doc = new EditorDocument(p);
    doc.execute(cropCommand(p, 1, 1, 3, 3));
    expect(p.width).toBe(2);
    expect(p.cells[0]).toBe(2);
    doc.execute(resizeCommand(p, 4, 4, 1, 1));
    expect(p.cells[2 * 4 + 2]).toBe(2);
  });

  it('copies, flips, rotates and pastes a selection', () => {
    const p = sample(4, 4);
    p.cells.set([1, 2], 0); // row 0: 1 2 . .
    p.partials.set(4, [{ mask: ARM.TL, id: 3 }]); // (0, 1)
    const clip = extractClip(p, 0, 0, 2, 2);
    expect(clip.cells.size).toBe(3);
    const flipped = flipClip(clip, true);
    expect(flipped.cells.get(0)).toEqual({ full: 2 });
    expect(flipped.cells.get(3)?.partials).toEqual([{ mask: ARM.TR, id: 3 }]);
    const rotated = rotateClip(clip);
    expect(rotated.cells.get(1)).toEqual({ full: 1, partials: undefined });
    const doc = new EditorDocument(p);
    doc.execute(pasteCommand(p, clip, 2, 2));
    expect(p.cells[2 * 4 + 2]).toBe(1);
    expect(p.partials.get(3 * 4 + 2)).toEqual([{ mask: ARM.TL, id: 3 }]);
    doc.execute(clearCommand(p, 0, 0, 4, 4));
    expect(p.cells.every((c) => c === 0)).toBe(true);
    expect(p.partials.size).toBe(0);
  });
});

describe('confetti cleanup', () => {
  it('removes isolated stitches as one undoable step', () => {
    const p = sample(5, 5);
    p.cells.fill(2);
    p.cells[12] = 3;
    expect(isolatedCount(p)).toBe(1);
    const doc = new EditorDocument(p);
    doc.execute(cleanupCommand(p, 1, false));
    expect(isolatedCount(p)).toBe(0);
    doc.undo();
    expect(p.cells[12]).toBe(3);
  });
});
