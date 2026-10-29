import { describe, expect, it } from 'vitest';
import { itemKey } from '../../src/core/model/document.ts';
import { ARM, HALF_SLASH, createPattern, type Pattern } from '../../src/core/model/pattern.ts';
import { pickDoneColor } from '../../src/core/progress/doneColor.ts';
import { progressExtras, restoreProgress } from '../../src/core/progress/serialize.ts';
import {
  ProgressTracker,
  bitAt,
  emptyProgress,
  localDay,
  pace,
} from '../../src/core/progress/tracker.ts';
import { DONE_COLORS } from '../../src/ui/stitch/store.ts';

function sample(): Pattern {
  const p = createPattern(4, 3);
  p.palette = [1, 2].map((id) => ({
    id,
    threads: [{ brand: 'DMC' as const, code: id === 1 ? '310' : '321' }],
    symbol: '',
    strands: 2,
    backStrands: 1,
  }));
  // Row 0: 1 1 2 2; row 1: 1 . 2 .; row 2: partials in cell 9 (half of 1 + quarter of 2).
  p.cells.set([1, 1, 2, 2, 1, 0, 2, 0, 0, 0, 0, 0]);
  p.partials.set(9, [
    { mask: HALF_SLASH, id: 1 },
    { mask: ARM.TL, id: 2 },
  ]);
  p.backstitches = [{ x1: 0, y1: 0, x2: 4, y2: 0, id: 1 }];
  p.knots = [{ x: 3, y: 3, id: 2 }];
  return p;
}

const fixedDay = () => '2026-10-29';

describe('progress tracker', () => {
  it('counts totals per colour, full and partial stitches', () => {
    const t = new ProgressTracker(sample(), emptyProgress(sample()), fixedDay);
    expect(t.total).toEqual({ total: 8, done: 0 });
    expect(t.tallies.get(1)).toEqual({ total: 4, done: 0 });
    expect(t.tallies.get(2)).toEqual({ total: 4, done: 0 });
    expect(t.backTotal.total).toBe(1);
    expect(t.knotTotal.total).toBe(1);
  });

  it('marks only the active colour, undoes and redoes a whole stroke', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.begin();
    for (const i of [0, 1, 2, 3, 9]) t.markCell(i, true, 1);
    t.commit();
    expect(t.tallies.get(1)!.done).toBe(3); // cells 0, 1 and the half stitch in cell 9
    expect(t.tallies.get(2)!.done).toBe(0);
    expect(bitAt(t.data.bits, 2)).toBe(false);
    expect(t.data.partials.get(9)).toBe(HALF_SLASH);
    expect(t.cellDone(9, 1)).toBe(true);
    expect(t.cellDone(9)).toBe(false);
    expect(t.data.daily['2026-10-29']).toBe(3);

    t.undo();
    expect(t.total.done).toBe(0);
    expect(t.data.partials.has(9)).toBe(false);
    expect(t.data.daily['2026-10-29']).toBe(0);
    t.redo();
    expect(t.total.done).toBe(3);
  });

  it('rolls back a stroke cut short by a pinch', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.begin();
    t.markCell(0, true);
    t.markCell(1, true);
    t.rollback();
    expect(t.total.done).toBe(0);
    expect(t.canUndo).toBe(false);
  });

  it('marks backstitch, knots and parking marks', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.markLine(itemKey(p.backstitches[0]), 'back', true);
    t.markLine(itemKey(p.knots[0]), 'knot', true);
    t.togglePark(3, 1, 2);
    expect(t.backTotal.done).toBe(1);
    expect(t.knotTotal.done).toBe(1);
    expect(t.data.parked).toEqual([{ x: 3, y: 1, id: 2 }]);
    t.undo();
    expect(t.data.parked).toEqual([]);
    t.togglePark(3, 1, 2);
    t.togglePark(3, 1, 2);
    expect(t.data.parked).toEqual([]);
  });

  it('finds the next stitch still to do, wrapping around', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.markCells([0, 1, 4], true);
    expect(t.findNext(-1)).toBe(2);
    expect(t.findNext(-1, 1)).toBe(9);
    expect(t.findNext(9, 2)).toBe(2);
    t.markCells([2, 3, 6, 9], true);
    expect(t.findNext(0)).toBe(-1);
  });
});

describe('stored progress', () => {
  it('survives a round trip and drops marks that no longer match the pattern', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.markCells([0, 2, 9], true);
    t.markLine(itemKey(p.backstitches[0]), 'back', true);
    t.data.view = { cx: 2, cy: 1, scale: 30 };
    const stored = { bits: t.data.bits, daily: t.data.daily, extras: progressExtras(t.data) };

    const back = restoreProgress(p, structuredClone(stored));
    expect(back.reset).toBe(false);
    expect(new ProgressTracker(p, back.data).total.done).toBe(4);
    expect(back.data.view).toEqual({ cx: 2, cy: 1, scale: 30 });

    // The pattern was edited: cell 2 erased, backstitch moved.
    const edited = sample();
    edited.cells[2] = 0;
    edited.backstitches[0].x2 = 2;
    const after = restoreProgress(edited, structuredClone(stored));
    expect(bitAt(after.data.bits, 2)).toBe(false);
    expect(after.data.backstitches.size).toBe(0);

    // Resized: positions don't line up any more.
    expect(restoreProgress(createPattern(5, 3), structuredClone(stored)).reset).toBe(true);
  });
});

describe('pace', () => {
  it('spreads the stitching days over the window to date the finish', () => {
    const today = new Date(2026, 9, 29);
    const daily: Record<string, number> = {};
    for (const k of [0, 2, 4, 6]) daily[localDay(new Date(2026, 9, 29 - k))] = 140;
    const r = pace(daily, 1000, today, 28);
    expect(r.perDay).toBe(140);
    expect(r.activeDays).toBe(4);
    // 560 stitches over the 7 days since the first session = 80 a day → 13 days.
    expect(localDay(r.finish!)).toBe(localDay(new Date(2026, 9, 29 + 13)));
    expect(pace({}, 1000, today).finish).toBeUndefined();
    // Two evenings are not enough for a date.
    expect(pace({ [localDay(today)]: 300, '2026-10-27': 200 }, 1000, today).finish).toBeUndefined();
  });
});

describe('clearing all marks', () => {
  it('is one undo step', () => {
    const p = sample();
    const t = new ProgressTracker(p, emptyProgress(p), fixedDay);
    t.markCells([0, 2, 9], true);
    t.markLine(itemKey(p.knots[0]), 'knot', true);
    t.togglePark(1, 1, 1);
    t.clearAll();
    expect(t.total.done).toBe(0);
    expect(t.knotTotal.done).toBe(0);
    expect(t.data.parked).toEqual([]);
    t.undo();
    expect(t.total.done).toBe(4); // cells 0 and 2, both stitches of cell 9
    expect(t.knotTotal.done).toBe(1);
    expect(t.data.parked).toHaveLength(1);
  });
});

describe('done colour', () => {
  it('avoids the colours the pattern is made of', () => {
    const greens = createPattern(1, 1);
    greens.palette = ['700', '701', '702', '703'].map((code, k) => ({
      id: k + 1,
      threads: [{ brand: 'DMC' as const, code }],
      symbol: '',
      strands: 2,
      backStrands: 1,
    }));
    expect(pickDoneColor(DONE_COLORS, greens.palette)).not.toBe('#16a34a');
    expect(pickDoneColor(DONE_COLORS, [])).toBe(DONE_COLORS[0]);
  });
});
