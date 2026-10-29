import { itemKey } from '../model/document.ts';
import { lineCells } from '../model/ops.ts';
import type { Pattern } from '../model/pattern.ts';

/** A thread parked on the fabric, waiting to be used again further on. */
export interface ParkMark {
  x: number;
  y: number;
  id: number;
}

/** Where the view was: centre in cells and zoom. */
export interface ViewMark {
  cx: number;
  cy: number;
  scale: number;
}

/** What has been stitched. Positions refer to the pattern's current size. */
export interface ProgressData {
  width: number;
  height: number;
  /** Full stitches done, one bit per cell. */
  bits: Uint8Array;
  /** Partial stitches done: cell index → arms of the done stitches (stitch masks never overlap). */
  partials: Map<number, number>;
  /** Backstitch segments and knots done, by item key. */
  backstitches: Set<string>;
  knots: Set<string>;
  parked: ParkMark[];
  /** Stitches marked per local day (YYYY-MM-DD); unmarking subtracts. */
  daily: Record<string, number>;
  view?: ViewMark;
}

export function emptyProgress(p: Pattern): ProgressData {
  return {
    width: p.width,
    height: p.height,
    bits: new Uint8Array(Math.ceil((p.width * p.height) / 8)),
    partials: new Map(),
    backstitches: new Set(),
    knots: new Set(),
    parked: [],
    daily: {},
  };
}

export function bitAt(bits: Uint8Array, i: number): boolean {
  return ((bits[i >> 3] >> (i & 7)) & 1) === 1;
}

function setBit(bits: Uint8Array, i: number, on: boolean): void {
  if (on) bits[i >> 3] |= 1 << (i & 7);
  else bits[i >> 3] &= ~(1 << (i & 7));
}

export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export interface Tally {
  total: number;
  done: number;
}

/** State of one cell: whether its full stitch is done and which partial arms are done. */
interface CellMark {
  full: boolean;
  arms: number;
}

/** One undoable step: states before and after, by cell index or item key. */
interface Step {
  before: Map<number, CellMark>;
  after: Map<number, CellMark>;
  back: Map<string, [boolean, boolean]>;
  knots: Map<string, [boolean, boolean]>;
  parked?: [ParkMark[], ParkMark[]];
}

export interface ProgressChange {
  /** Cells whose marks changed, for redrawing. */
  cells: number[];
  lines: boolean;
}

type Listener = (change: ProgressChange) => void;

const MAX_UNDO = 500;

/**
 * Marks stitches as done, keeps per-colour tallies and the daily count up to date, and records
 * every change for undo. A drag of the finger is one transaction, so one undo step.
 */
export class ProgressTracker {
  readonly pattern: Pattern;
  readonly data: ProgressData;
  /** Stitches (full and partial) per palette id. */
  readonly tallies = new Map<number, Tally>();
  readonly total: Tally = { total: 0, done: 0 };
  readonly backTotal: Tally = { total: 0, done: 0 };
  readonly knotTotal: Tally = { total: 0, done: 0 };
  version = 0;
  private undoStack: Step[] = [];
  private redoStack: Step[] = [];
  private pending: Step | null = null;
  private listeners = new Set<Listener>();
  private today: () => string;

  constructor(pattern: Pattern, data: ProgressData, today: () => string = () => localDay()) {
    this.pattern = pattern;
    this.data = data;
    this.today = today;
    this.recount();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 || (this.pending !== null && !isEmpty(this.pending));
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Recomputes all tallies from the pattern and the marks. */
  recount(): void {
    const p = this.pattern;
    const d = this.data;
    this.tallies.clear();
    for (const e of p.palette) this.tallies.set(e.id, { total: 0, done: 0 });
    const tally = (id: number) => {
      let t = this.tallies.get(id);
      if (!t) this.tallies.set(id, (t = { total: 0, done: 0 }));
      return t;
    };
    this.total.total = this.total.done = 0;
    for (let i = 0; i < p.cells.length; i++) {
      const id = p.cells[i];
      if (!id) continue;
      const t = tally(id);
      t.total++;
      if (bitAt(d.bits, i)) t.done++;
    }
    for (const [i, list] of p.partials) {
      const arms = d.partials.get(i) ?? 0;
      for (const s of list) {
        const t = tally(s.id);
        t.total++;
        if ((arms & s.mask) === s.mask) t.done++;
      }
    }
    for (const t of this.tallies.values()) {
      this.total.total += t.total;
      this.total.done += t.done;
    }
    this.backTotal.total = p.backstitches.length;
    this.backTotal.done = p.backstitches.filter((b) => d.backstitches.has(itemKey(b))).length;
    this.knotTotal.total = p.knots.length;
    this.knotTotal.done = p.knots.filter((k) => d.knots.has(itemKey(k))).length;
  }

  // --- Transactions ----------------------------------------------------------------------------

  begin(): void {
    if (this.pending) this.commit();
    this.pending = newStep();
  }

  commit(): void {
    const step = this.pending;
    this.pending = null;
    if (!step || isEmpty(step)) return;
    this.undoStack.push(step);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.emit({ cells: [], lines: false });
  }

  /** Reverts the open transaction (a stroke that turned into a pinch). */
  rollback(): void {
    const step = this.pending;
    this.pending = null;
    if (step && !isEmpty(step)) this.emit(this.apply(step, false));
  }

  undo(): void {
    this.commit();
    const step = this.undoStack.pop();
    if (!step) return;
    this.redoStack.push(step);
    this.emit(this.apply(step, false));
  }

  redo(): void {
    this.commit();
    const step = this.redoStack.pop();
    if (!step) return;
    this.undoStack.push(step);
    this.emit(this.apply(step, true));
  }

  // --- Queries ---------------------------------------------------------------------------------

  /** True if every stitch of the cell (of colour `filter`, if given) is done; false if none. */
  cellDone(i: number, filter: number | null = null): boolean {
    const p = this.pattern;
    const id = p.cells[i];
    if (id) return bitAt(this.data.bits, i);
    const list = p.partials.get(i);
    if (!list) return false;
    const arms = this.data.partials.get(i) ?? 0;
    const relevant = list.filter((s) => filter === null || s.id === filter);
    return relevant.length > 0 && relevant.every((s) => (arms & s.mask) === s.mask);
  }

  /** True if the cell has a stitch of colour `filter` (any colour when null). */
  hasStitch(i: number, filter: number | null = null): boolean {
    const p = this.pattern;
    const id = p.cells[i];
    if (id) return filter === null || id === filter;
    const list = p.partials.get(i);
    return !!list && list.some((s) => filter === null || s.id === filter);
  }

  /** Next cell after `from` (row by row, wrapping) with a stitch still to do; -1 if none. */
  findNext(from: number, filter: number | null = null): number {
    const n = this.pattern.cells.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (this.hasUndone(i, filter)) return i;
    }
    return -1;
  }

  /** True if the cell has a stitch (of colour `filter`, if given) not done yet. */
  hasUndone(i: number, filter: number | null = null): boolean {
    const p = this.pattern;
    const id = p.cells[i];
    if (id) return (filter === null || id === filter) && !bitAt(this.data.bits, i);
    const arms = this.data.partials.get(i) ?? 0;
    return (p.partials.get(i) ?? []).some(
      (s) => (filter === null || s.id === filter) && (arms & s.mask) !== s.mask,
    );
  }

  // --- Marking ---------------------------------------------------------------------------------

  /** Marks (done = true) or clears the stitches of a cell, only those of colour `filter` if set. */
  markCell(i: number, done: boolean, filter: number | null = null): void {
    this.markCells([i], done, filter);
  }

  /** Marks or clears many cells as one change (and one undo step, unless in a transaction). */
  markCells(cells: Iterable<number>, done: boolean, filter: number | null = null): void {
    const p = this.pattern;
    const own = !this.pending;
    if (own) this.begin();
    const pending = this.pending!;
    const delta = newStep();
    for (const i of cells) {
      if (i < 0 || i >= p.cells.length || delta.after.has(i)) continue;
      const before = this.readCell(i);
      const next = { ...before };
      const id = p.cells[i];
      if (id) {
        if (filter === null || id === filter) next.full = done;
      } else {
        for (const st of p.partials.get(i) ?? []) {
          if (filter !== null && st.id !== filter) continue;
          next.arms = done ? next.arms | st.mask : next.arms & ~st.mask;
        }
      }
      if (next.full === before.full && next.arms === before.arms) continue;
      delta.before.set(i, before);
      delta.after.set(i, next);
      if (!pending.before.has(i)) pending.before.set(i, before);
      pending.after.set(i, next);
    }
    if (delta.after.size) this.emit(this.apply(delta, true));
    if (own) this.commit();
  }

  /** Cells crossed by a straight drag from one cell to another. */
  static lineIndices(p: Pattern, x0: number, y0: number, x1: number, y1: number): number[] {
    return lineCells(x0, y0, x1, y1)
      .filter(([x, y]) => x >= 0 && y >= 0 && x < p.width && y < p.height)
      .map(([x, y]) => y * p.width + x);
  }

  markLine(key: string, kind: 'back' | 'knot', done: boolean): void {
    const set = kind === 'back' ? this.data.backstitches : this.data.knots;
    const before = set.has(key);
    if (before === done) return;
    this.record((step) => {
      const map = kind === 'back' ? step.back : step.knots;
      const prev = map.get(key);
      map.set(key, [prev ? prev[0] : before, done]);
    });
  }

  /** Places a parking mark for colour `id` at a cell, or removes the one already there. */
  togglePark(x: number, y: number, id: number): void {
    const before = this.data.parked.map((m) => ({ ...m }));
    const at = before.findIndex((m) => m.x === x && m.y === y);
    const after = at >= 0 ? before.filter((_, k) => k !== at) : [...before, { x, y, id }];
    this.record((step) => {
      step.parked = [step.parked ? step.parked[0] : before, after];
    });
  }

  /** Remembers where the view is, to reopen there. */
  setView(view: ViewMark): void {
    this.data.view = view;
  }

  /** Forgets the stitches-per-day history (not undoable). */
  clearHistory(): void {
    this.data.daily = {};
    this.emit({ cells: [], lines: true });
  }

  /** Clears every mark, as one undo step. */
  clearAll(): void {
    const own = !this.pending;
    if (own) this.begin();
    const cells: number[] = [];
    for (let i = 0; i < this.pattern.cells.length; i++) if (this.hasStitch(i)) cells.push(i);
    this.markCells(cells, false);
    for (const k of [...this.data.backstitches]) this.markLine(k, 'back', false);
    for (const k of [...this.data.knots]) this.markLine(k, 'knot', false);
    const before = this.data.parked.map((m) => ({ ...m }));
    if (before.length)
      this.record((step) => {
        step.parked = [step.parked ? step.parked[0] : before, []];
      });
    if (own) this.commit();
  }

  private readCell(i: number): CellMark {
    return { full: bitAt(this.data.bits, i), arms: this.data.partials.get(i) ?? 0 };
  }

  /** Adds to the open transaction (or a step of its own) and applies the change right away. */
  private record(edit: (step: Step) => void): void {
    const own = !this.pending;
    if (own) this.begin();
    const delta = newStep();
    edit(delta);
    edit(this.pending!);
    this.emit(this.apply(delta, true));
    if (own) this.commit();
  }

  /** Applies a step forwards or backwards, updating tallies and today's count. */
  private apply(step: Step, forward: boolean): ProgressChange {
    const p = this.pattern;
    const d = this.data;
    const target = forward ? step.after : step.before;
    let delta = 0;
    const cells: number[] = [];
    for (const [i, next] of target) {
      const cur = this.readCell(i);
      const id = p.cells[i];
      if (id) {
        if (cur.full !== next.full) {
          const t = this.tallies.get(id);
          const k = next.full ? 1 : -1;
          if (t) t.done += k;
          this.total.done += k;
          delta += k;
        }
      } else {
        for (const s of p.partials.get(i) ?? []) {
          const was = (cur.arms & s.mask) === s.mask;
          const now = (next.arms & s.mask) === s.mask;
          if (was === now) continue;
          const k = now ? 1 : -1;
          const t = this.tallies.get(s.id);
          if (t) t.done += k;
          this.total.done += k;
          delta += k;
        }
      }
      setBit(d.bits, i, next.full);
      if (next.arms) d.partials.set(i, next.arms);
      else d.partials.delete(i);
      cells.push(i);
    }
    let lines = false;
    for (const [key, [before, after]] of step.back) {
      const on = forward ? after : before;
      if (d.backstitches.has(key) === on) continue;
      if (on) d.backstitches.add(key);
      else d.backstitches.delete(key);
      this.backTotal.done += on ? 1 : -1;
      lines = true;
    }
    for (const [key, [before, after]] of step.knots) {
      const on = forward ? after : before;
      if (d.knots.has(key) === on) continue;
      if (on) d.knots.add(key);
      else d.knots.delete(key);
      this.knotTotal.done += on ? 1 : -1;
      lines = true;
    }
    if (step.parked) {
      d.parked = (forward ? step.parked[1] : step.parked[0]).map((m) => ({ ...m }));
      lines = true;
    }
    if (delta) {
      const day = this.today();
      d.daily[day] = (d.daily[day] ?? 0) + delta;
    }
    return { cells, lines };
  }

  private emit(change: ProgressChange): void {
    this.version++;
    for (const l of this.listeners) l(change);
  }
}

function newStep(): Step {
  return { before: new Map(), after: new Map(), back: new Map(), knots: new Map() };
}

function isEmpty(s: Step): boolean {
  return s.after.size === 0 && s.back.size === 0 && s.knots.size === 0 && !s.parked;
}

// --- Pace --------------------------------------------------------------------------------------

export interface Pace {
  /** Average stitches per stitching day over the recent active days. */
  perDay: number;
  /** Days with stitching in the window. */
  activeDays: number;
  /** Expected finishing day at that pace, if there is a pace and work left. */
  finish?: Date;
}

/** Fewer stitching days than this give no finishing date: one evening says little. */
export const MIN_PACE_DAYS = 3;

/**
 * Pace from the last `windowDays` calendar days (or since the first stitching day, if more
 * recent): the average of the days with stitching, spread over the calendar days, so a weekend
 * stitcher's estimate accounts for the gaps.
 */
export function pace(
  daily: Record<string, number>,
  remaining: number,
  today = new Date(),
  windowDays = 28,
): Pace {
  let sum = 0;
  let activeDays = 0;
  let span = 0;
  for (let k = 0; k < windowDays; k++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - k);
    const n = daily[localDay(d)] ?? 0;
    if (n > 0) {
      sum += n;
      activeDays++;
      span = k + 1;
    }
  }
  if (activeDays === 0) return { perDay: 0, activeDays };
  const perDay = sum / activeDays;
  const perCalendarDay = sum / span;
  if (remaining <= 0 || activeDays < MIN_PACE_DAYS) return { perDay, activeDays };
  const days = Math.ceil(remaining / perCalendarDay);
  const finish = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return { perDay, activeDays, finish };
}
