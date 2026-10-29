import type {
  Backstitch,
  Fabric,
  Knot,
  PaletteEntry,
  PartialStitch,
  Pattern,
  PatternMeta,
} from './pattern.ts';

/** Rectangle of cells, inclusive of x0/y0 and exclusive of x1/y1. */
export interface CellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What a change touched, so views can redraw only that. */
export interface ChangeInfo {
  cells?: CellRect;
  palette?: boolean;
  backstitches?: boolean;
  knots?: boolean;
  meta?: boolean;
  /** Size changed: everything must be rebuilt. */
  resized?: boolean;
}

/** State of one cell: its full stitch id and its partial stitches. */
export interface CellState {
  full: number;
  partials?: readonly PartialStitch[];
}

/** An undoable change. `apply(doc, forward)` performs it (true) or reverts it (false). */
export interface Command {
  apply(pattern: Pattern, forward: boolean): ChangeInfo;
}

/** Cell edits recorded as before/after states, keyed by cell index. */
export class CellsCommand implements Command {
  readonly before = new Map<number, CellState>();
  readonly after = new Map<number, CellState>();
  private width: number;

  constructor(width: number) {
    this.width = width;
  }

  get size(): number {
    return this.after.size;
  }

  /** Records the new state of a cell; the first call for a cell also records its old state. */
  record(pattern: Pattern, index: number, next: CellState): void {
    if (!this.before.has(index)) this.before.set(index, readCell(pattern, index));
    this.after.set(index, normalise(next));
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    const states = forward ? this.after : this.before;
    let rect: CellRect | undefined;
    for (const [i, st] of states) {
      writeCell(pattern, i, st);
      rect = growRect(rect, i % this.width, Math.floor(i / this.width));
    }
    return rect ? { cells: rect } : {};
  }
}

/** Backstitch or knot additions/removals; items are compared by value, not identity. */
export class ListCommand<T extends Backstitch | Knot> implements Command {
  private readonly key: 'backstitches' | 'knots';
  private readonly added: T[];
  private readonly removed: T[];

  constructor(key: 'backstitches' | 'knots', added: T[], removed: T[]) {
    this.key = key;
    this.added = added.map((x) => ({ ...x }));
    this.removed = removed.map((x) => ({ ...x }));
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    const list = pattern[this.key] as T[];
    const [add, remove] = forward ? [this.added, this.removed] : [this.removed, this.added];
    const toDrop = new Map<string, number>();
    for (const r of remove) toDrop.set(itemKey(r), (toDrop.get(itemKey(r)) ?? 0) + 1);
    const kept = list.filter((x) => {
      const k = itemKey(x);
      const n = toDrop.get(k) ?? 0;
      if (n > 0) {
        toDrop.set(k, n - 1);
        return false;
      }
      return true;
    });
    kept.push(...add.map((x) => ({ ...x })));
    if (this.key === 'backstitches') pattern.backstitches = kept as Backstitch[];
    else pattern.knots = kept as Knot[];
    return { [this.key]: true };
  }
}

export function itemKey(x: Backstitch | Knot): string {
  return 'x1' in x ? `${x.x1},${x.y1},${x.x2},${x.y2},${x.id}` : `${x.x},${x.y},${x.id}`;
}

export class PaletteCommand implements Command {
  private readonly before: PaletteEntry[];
  private readonly after: PaletteEntry[];

  constructor(before: PaletteEntry[], after: PaletteEntry[]) {
    this.before = before.map(cloneEntry);
    this.after = after.map(cloneEntry);
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    pattern.palette = (forward ? this.after : this.before).map(cloneEntry);
    return { palette: true };
  }
}

export class MetaCommand implements Command {
  private readonly before: { meta: PatternMeta; fabric: Fabric };
  private readonly after: { meta: PatternMeta; fabric: Fabric };

  constructor(
    before: { meta: PatternMeta; fabric: Fabric },
    after: { meta: PatternMeta; fabric: Fabric },
  ) {
    this.before = structuredClone(before);
    this.after = structuredClone(after);
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    const s = structuredClone(forward ? this.after : this.before);
    pattern.meta = s.meta;
    pattern.fabric = s.fabric;
    return { meta: true };
  }
}

/** Whole-pattern snapshot swap, for operations that change the size. */
export class SnapshotCommand implements Command {
  private readonly before: Snapshot;
  private readonly after: Snapshot;

  constructor(before: Pattern, after: Pattern) {
    this.before = snapshot(before);
    this.after = snapshot(after);
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    restore(pattern, forward ? this.after : this.before);
    return {
      resized: true,
      palette: true,
      backstitches: true,
      knots: true,
      cells: fullRect(pattern),
    };
  }
}

export class CompositeCommand implements Command {
  readonly parts: Command[];

  constructor(parts: Command[]) {
    this.parts = parts;
  }

  apply(pattern: Pattern, forward: boolean): ChangeInfo {
    const order = forward ? this.parts : [...this.parts].reverse();
    return order.reduce<ChangeInfo>((acc, c) => mergeInfo(acc, c.apply(pattern, forward)), {});
  }
}

type Listener = (info: ChangeInfo) => void;

const MAX_UNDO = 300;

/**
 * A pattern being edited: applies commands, keeps undo/redo stacks and notifies listeners with
 * what changed. A transaction groups several commands (one drag of the pencil) into one step.
 */
export class EditorDocument {
  readonly pattern: Pattern;
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private listeners = new Set<Listener>();
  private pending: Command[] | null = null;
  /** Increments on every change; React reads it through useSyncExternalStore. */
  version = 0;

  constructor(pattern: Pattern) {
    this.pattern = pattern;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Applies and records a command (inside a transaction it joins the transaction). */
  execute(command: Command): void {
    const info = command.apply(this.pattern, true);
    if (this.pending) this.pending.push(command);
    else this.push(command);
    this.emit(info);
  }

  begin(): void {
    if (this.pending) this.commit();
    this.pending = [];
  }

  commit(): void {
    const parts = this.pending;
    this.pending = null;
    if (!parts || parts.length === 0) return;
    this.push(parts.length === 1 ? parts[0] : new CompositeCommand(parts));
    // Nothing new to draw, but undo/redo availability changed.
    this.emit({});
  }

  get inTransaction(): boolean {
    return this.pending !== null;
  }

  /** Reverts and discards the commands of the open transaction (e.g. a stroke cut short by a pinch). */
  rollback(): void {
    const parts = this.pending;
    this.pending = null;
    if (!parts || parts.length === 0) return;
    let info: ChangeInfo = {};
    for (let i = parts.length - 1; i >= 0; i--)
      info = mergeInfo(info, parts[i].apply(this.pattern, false));
    this.emit(info);
  }

  undo(): void {
    this.commit();
    const c = this.undoStack.pop();
    if (!c) return;
    this.redoStack.push(c);
    this.emit(c.apply(this.pattern, false));
  }

  redo(): void {
    this.commit();
    const c = this.redoStack.pop();
    if (!c) return;
    this.undoStack.push(c);
    this.emit(c.apply(this.pattern, true));
  }

  private push(c: Command): void {
    this.undoStack.push(c);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
  }

  private emit(info: ChangeInfo): void {
    this.version++;
    for (const l of this.listeners) l(info);
  }
}

// ---------------------------------------------------------------------------------------------

export function readCell(pattern: Pattern, index: number): CellState {
  const partials = pattern.partials.get(index);
  return partials
    ? { full: 0, partials: partials.map((p) => ({ ...p })) }
    : { full: pattern.cells[index] };
}

function normalise(st: CellState): CellState {
  const partials = st.partials?.filter((p) => p.mask && p.id);
  if (st.full || !partials || partials.length === 0) return { full: st.full };
  return { full: 0, partials: partials.map((p) => ({ ...p })) };
}

export function writeCell(pattern: Pattern, index: number, st: CellState): void {
  pattern.cells[index] = st.full;
  if (!st.full && st.partials && st.partials.length)
    pattern.partials.set(
      index,
      st.partials.map((p) => ({ ...p })),
    );
  else pattern.partials.delete(index);
}

export function sameCell(a: CellState, b: CellState): boolean {
  if (a.full !== b.full) return false;
  const pa = a.partials ?? [];
  const pb = b.partials ?? [];
  return pa.length === pb.length && pa.every((p, i) => p.mask === pb[i].mask && p.id === pb[i].id);
}

export function growRect(r: CellRect | undefined, x: number, y: number): CellRect {
  if (!r) return { x0: x, y0: y, x1: x + 1, y1: y + 1 };
  return {
    x0: Math.min(r.x0, x),
    y0: Math.min(r.y0, y),
    x1: Math.max(r.x1, x + 1),
    y1: Math.max(r.y1, y + 1),
  };
}

export function fullRect(p: Pattern): CellRect {
  return { x0: 0, y0: 0, x1: p.width, y1: p.height };
}

export function mergeInfo(a: ChangeInfo, b: ChangeInfo): ChangeInfo {
  const cells =
    a.cells && b.cells
      ? {
          x0: Math.min(a.cells.x0, b.cells.x0),
          y0: Math.min(a.cells.y0, b.cells.y0),
          x1: Math.max(a.cells.x1, b.cells.x1),
          y1: Math.max(a.cells.y1, b.cells.y1),
        }
      : (a.cells ?? b.cells);
  return {
    cells,
    palette: a.palette || b.palette,
    backstitches: a.backstitches || b.backstitches,
    knots: a.knots || b.knots,
    meta: a.meta || b.meta,
    resized: a.resized || b.resized,
  };
}

function cloneEntry(e: PaletteEntry): PaletteEntry {
  return { ...e, threads: e.threads.map((t) => ({ ...t })) };
}

interface Snapshot {
  width: number;
  height: number;
  cells: Uint16Array;
  partials: [number, PartialStitch[]][];
  backstitches: Backstitch[];
  knots: Knot[];
  palette: PaletteEntry[];
}

function snapshot(p: Pattern): Snapshot {
  return {
    width: p.width,
    height: p.height,
    cells: new Uint16Array(p.cells),
    partials: [...p.partials.entries()].map(([i, l]) => [i, l.map((s) => ({ ...s }))]),
    backstitches: p.backstitches.map((b) => ({ ...b })),
    knots: p.knots.map((k) => ({ ...k })),
    palette: p.palette.map(cloneEntry),
  };
}

function restore(p: Pattern, s: Snapshot): void {
  p.width = s.width;
  p.height = s.height;
  p.cells = new Uint16Array(s.cells);
  p.partials = new Map(s.partials.map(([i, l]) => [i, l.map((x) => ({ ...x }))]));
  p.backstitches = s.backstitches.map((b) => ({ ...b }));
  p.knots = s.knots.map((k) => ({ ...k }));
  p.palette = s.palette.map(cloneEntry);
}
