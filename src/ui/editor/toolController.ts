import {
  CellsCommand,
  ListCommand,
  readCell,
  type EditorDocument,
} from '../../core/model/document.ts';
import { entryRgb } from '../../core/model/entryColor.ts';
import {
  cleanupCommand,
  cornerAt,
  ellipseCells,
  floodRegion,
  inBounds,
  lineCells,
  paint,
  rectCells,
  threeQuarterFor,
  type Point,
} from '../../core/model/ops.ts';
import {
  FULL_MASK,
  HALF_BACKSLASH,
  HALF_SLASH,
  type Backstitch,
  type Knot,
} from '../../core/model/pattern.ts';
import type { Overlay } from '../../render/chartRenderer.ts';
import type { EditorActions, EditorState } from './store.ts';

export interface PointerCell {
  /** Position in cells (fractional). */
  cx: number;
  cy: number;
  alt: boolean;
  shift: boolean;
}

type Store = () => EditorState & EditorActions;

interface Stroke {
  start: [number, number];
  last: [number, number];
  startPoint?: [number, number];
  /** Lasso path in cells. */
  path?: [number, number][];
  dragFrom?: [number, number];
  floatingFrom?: [number, number];
}

const PAINT_TOOLS = new Set(['pencil', 'half', 'quarter', 'threeQuarter', 'eraser']);

/**
 * Turns pointer input (already in cell coordinates) into document commands for the current
 * tool, and keeps the overlay (previews, cursor) up to date. One drag = one undo step.
 */
export class ToolController {
  overlay: Overlay = {};
  private stroke: Stroke | null = null;
  private doc: EditorDocument;
  private store: Store;
  private listeners = new Set<() => void>();

  constructor(doc: EditorDocument, store: Store) {
    this.doc = doc;
    this.store = store;
  }

  /** The chart view listens to redraw when the overlay changes. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  get active(): boolean {
    return this.stroke !== null;
  }

  hover(p: PointerCell): void {
    const s = this.store();
    const x = Math.floor(p.cx);
    const y = Math.floor(p.cy);
    const inside = inBounds(this.doc.pattern, x, y);
    const next: Overlay = {
      ...this.overlay,
      cursor: inside ? { x, y } : undefined,
      point: undefined,
    };
    if (s.tool === 'backstitch' || s.tool === 'knot') {
      const [x, y] = this.snap(p);
      next.point = { x, y };
    }
    this.overlay = this.withFloating(next);
    this.notify();
  }

  leave(): void {
    this.overlay = this.withFloating(this.selectionOverlay({}));
    this.notify();
  }

  down(p: PointerCell): void {
    const s = this.store();
    const cell: [number, number] = [Math.floor(p.cx), Math.floor(p.cy)];
    if (s.floating) {
      this.stroke = {
        start: cell,
        last: cell,
        dragFrom: cell,
        floatingFrom: [s.floating.x, s.floating.y],
      };
      return;
    }
    if (p.alt && PAINT_TOOLS.has(s.tool)) {
      this.pick(cell[0], cell[1]);
      return;
    }
    switch (s.tool) {
      case 'picker':
        this.pick(cell[0], cell[1]);
        return;
      case 'fill':
        this.fill(cell[0], cell[1]);
        return;
      case 'knot':
        this.knot(p);
        return;
      case 'pan':
        return;
    }
    this.stroke = { start: cell, last: cell, startPoint: this.snap(p) };
    if (PAINT_TOOLS.has(s.tool) || s.tool === 'cleanup') {
      this.doc.begin();
      this.paintAt(p, cell, null);
    } else if (s.tool === 'select') {
      if (s.selectMode === 'wand') {
        this.stroke = null;
        this.selectSameColour(cell[0], cell[1]);
        return;
      }
      if (s.selectMode === 'lasso') this.stroke.path = [[p.cx, p.cy]];
      s.set({ selection: rectOf(cell, cell), selectionMask: null });
      this.overlay = { ...this.overlay, selection: rectOf(cell, cell), selectionMask: undefined };
    }
    this.move(p);
  }

  move(p: PointerCell): void {
    const st = this.stroke;
    if (!st) return this.hover(p);
    const s = this.store();
    const cell: [number, number] = [Math.floor(p.cx), Math.floor(p.cy)];
    if (st.dragFrom && st.floatingFrom && s.floating) {
      s.set({
        floating: {
          ...s.floating,
          x: st.floatingFrom[0] + cell[0] - st.dragFrom[0],
          y: st.floatingFrom[1] + cell[1] - st.dragFrom[1],
        },
      });
      this.overlay = this.withFloating({ ...this.overlay });
      this.notify();
      return;
    }
    switch (s.tool) {
      case 'pencil':
      case 'half':
      case 'quarter':
      case 'threeQuarter':
      case 'eraser':
      case 'cleanup':
        if (
          cell[0] !== st.last[0] ||
          cell[1] !== st.last[1] ||
          s.tool === 'quarter' ||
          s.tool === 'threeQuarter'
        ) {
          this.paintAt(p, cell, st.last);
          st.last = cell;
        }
        break;
      case 'line':
      case 'rect':
      case 'ellipse':
        this.overlay = {
          ...this.overlay,
          cells: { points: this.shape(st.start, cell), color: this.activeCss() },
        };
        break;
      case 'select': {
        if (st.path) {
          st.path.push([p.cx, p.cy]);
          this.overlay = { ...this.overlay, path: [...st.path], selection: undefined };
        } else {
          this.overlay = { ...this.overlay, selection: rectOf(st.start, cell) };
        }
        break;
      }
      case 'backstitch': {
        const end = this.snap(p);
        const [x1, y1] = st.startPoint!;
        this.overlay = {
          ...this.overlay,
          line: { x1, y1, x2: end[0], y2: end[1], color: this.activeCss() },
          point: { x: end[0], y: end[1] },
        };
        break;
      }
    }
    st.last = cell;
    this.overlay.cursor = inBounds(this.doc.pattern, cell[0], cell[1])
      ? { x: cell[0], y: cell[1] }
      : undefined;
    this.notify();
  }

  up(p: PointerCell): void {
    const st = this.stroke;
    this.stroke = null;
    if (!st) return;
    const s = this.store();
    const cell: [number, number] = [Math.floor(p.cx), Math.floor(p.cy)];
    if (st.dragFrom) return;
    switch (s.tool) {
      case 'line':
      case 'rect':
      case 'ellipse': {
        const id = s.activeId;
        if (id) {
          const cmd = new CellsCommand(this.doc.pattern.width);
          paint(this.doc.pattern, cmd, this.shape(st.start, cell), FULL_MASK, id, s.symmetry);
          if (cmd.size) this.doc.execute(cmd);
        }
        this.overlay = { ...this.overlay, cells: undefined };
        break;
      }
      case 'select': {
        if (st.path) {
          this.finishLasso(st.path);
          break;
        }
        const sel = rectOf(st.start, cell);
        const clipped = clipRect(sel, this.doc.pattern.width, this.doc.pattern.height);
        s.set({ selection: clipped, selectionMask: null });
        this.overlay = {
          ...this.overlay,
          selection: clipped ?? undefined,
          selectionMask: undefined,
        };
        break;
      }
      case 'backstitch': {
        const end = this.snap(p);
        const [x1, y1] = st.startPoint!;
        if (s.activeId && (end[0] !== x1 || end[1] !== y1)) {
          const b: Backstitch = { x1, y1, x2: end[0], y2: end[1], id: s.activeId };
          this.doc.execute(new ListCommand<Backstitch>('backstitches', [b], []));
        }
        this.overlay = { ...this.overlay, line: undefined };
        break;
      }
      default:
        this.doc.commit();
    }
    this.notify();
  }

  /** A second finger arrived: undo the stroke in progress. */
  cancel(): void {
    if (!this.stroke) return;
    this.stroke = null;
    if (this.doc.inTransaction) this.doc.rollback();
    this.overlay = this.withFloating(this.selectionOverlay({}));
    this.notify();
  }

  refresh(): void {
    this.overlay = this.withFloating(this.selectionOverlay({ ...this.overlay, path: undefined }));
    this.notify();
  }

  private selectionOverlay(o: Overlay): Overlay {
    const s = this.store();
    return {
      ...o,
      selection: s.selection ?? undefined,
      selectionMask: s.selectionMask ?? undefined,
    };
  }

  /** Every cell with the same content as (x, y), connected to it. */
  private selectSameColour(x: number, y: number): void {
    const pattern = this.doc.pattern;
    if (!inBounds(pattern, x, y)) return;
    const mask = new Uint8Array(pattern.width * pattern.height);
    let x0 = x;
    let y0 = y;
    let x1 = x;
    let y1 = y;
    for (const [cx, cy] of floodRegion(pattern, x, y)) {
      mask[cy * pattern.width + cx] = 1;
      x0 = Math.min(x0, cx);
      y0 = Math.min(y0, cy);
      x1 = Math.max(x1, cx);
      y1 = Math.max(y1, cy);
    }
    this.store().set({ selection: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, selectionMask: mask });
  }

  /** Cells whose centre lies inside the lasso (even-odd rule). */
  private finishLasso(path: [number, number][]): void {
    const pattern = this.doc.pattern;
    const s = this.store();
    this.overlay = { ...this.overlay, path: undefined };
    if (path.length < 3) {
      s.set({ selection: null, selectionMask: null });
      return;
    }
    const xs = path.map((q) => q[0]);
    const ys = path.map((q) => q[1]);
    const bx0 = Math.max(0, Math.floor(Math.min(...xs)));
    const by0 = Math.max(0, Math.floor(Math.min(...ys)));
    const bx1 = Math.min(pattern.width, Math.ceil(Math.max(...xs)));
    const by1 = Math.min(pattern.height, Math.ceil(Math.max(...ys)));
    const mask = new Uint8Array(pattern.width * pattern.height);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = by0; y < by1; y++) {
      for (let x = bx0; x < bx1; x++) {
        if (!insidePolygon(path, x + 0.5, y + 0.5)) continue;
        mask[y * pattern.width + x] = 1;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) s.set({ selection: null, selectionMask: null });
    else s.set({ selection: { x0, y0, x1: x1 + 1, y1: y1 + 1 }, selectionMask: mask });
  }

  // -------------------------------------------------------------------------------------------

  private paintAt(p: PointerCell, cell: [number, number], from: [number, number] | null): void {
    const s = this.store();
    const pattern = this.doc.pattern;
    const cells: Point[] = from ? lineCells(from[0], from[1], cell[0], cell[1]) : [cell];
    if (s.tool === 'cleanup') {
      const region = new Uint8Array(pattern.width * pattern.height);
      for (const [x, y] of cells) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (inBounds(pattern, x + dx, y + dy)) region[(y + dy) * pattern.width + x + dx] = 1;
          }
        }
      }
      const cmd = cleanupCommand(pattern, 2, true, region);
      if (cmd.size) this.doc.execute(cmd);
      return;
    }
    if (s.tool === 'eraser' && s.eraserTarget === 'backstitch') {
      this.eraseLines(p);
      return;
    }
    const id = s.tool === 'eraser' ? 0 : s.activeId;
    if (id === null) return;
    let mask = FULL_MASK;
    if (s.tool === 'half') mask = s.halfDirection === 'slash' ? HALF_SLASH : HALF_BACKSLASH;
    const fx = p.cx - Math.floor(p.cx);
    const fy = p.cy - Math.floor(p.cy);
    if (s.tool === 'quarter') mask = cornerAt(fx, fy);
    if (s.tool === 'threeQuarter') mask = threeQuarterFor(cornerAt(fx, fy));
    const targets = s.tool === 'quarter' || s.tool === 'threeQuarter' ? [cell] : cells;
    const cmd = new CellsCommand(pattern.width);
    paint(pattern, cmd, targets, mask, id, s.symmetry);
    // Skip no-op edits so a click on an identical stitch does not create an undo step.
    for (const [i, after] of cmd.after) {
      const before = cmd.before.get(i)!;
      if (JSON.stringify(before) === JSON.stringify(after)) {
        cmd.after.delete(i);
        cmd.before.delete(i);
      }
    }
    if (cmd.size) this.doc.execute(cmd);
  }

  private eraseLines(p: PointerCell): void {
    const pattern = this.doc.pattern;
    const hits = pattern.backstitches.filter(
      (b) => distanceToSegment(p.cx, p.cy, b.x1 / 2, b.y1 / 2, b.x2 / 2, b.y2 / 2) < 0.3,
    );
    const knots = pattern.knots.filter((k) => Math.hypot(p.cx - k.x / 2, p.cy - k.y / 2) < 0.35);
    if (hits.length) this.doc.execute(new ListCommand<Backstitch>('backstitches', [], hits));
    if (knots.length) this.doc.execute(new ListCommand<Knot>('knots', [], knots));
  }

  private pick(x: number, y: number): void {
    const pattern = this.doc.pattern;
    if (!inBounds(pattern, x, y)) return;
    const st = readCell(pattern, y * pattern.width + x);
    const id = st.full || st.partials?.[0]?.id;
    if (id) this.store().set({ activeId: id });
  }

  private fill(x: number, y: number): void {
    const s = this.store();
    if (!s.activeId || !inBounds(this.doc.pattern, x, y)) return;
    const cmd = new CellsCommand(this.doc.pattern.width);
    paint(this.doc.pattern, cmd, floodRegion(this.doc.pattern, x, y), FULL_MASK, s.activeId);
    if (cmd.size) this.doc.execute(cmd);
  }

  private knot(p: PointerCell): void {
    const s = this.store();
    if (!s.activeId) return;
    const [x, y] = this.snap(p);
    if (this.doc.pattern.knots.some((k) => k.x === x && k.y === y && k.id === s.activeId)) return;
    this.doc.execute(new ListCommand<Knot>('knots', [{ x, y, id: s.activeId }], []));
  }

  private shape(a: [number, number], b: [number, number]): Point[] {
    const s = this.store();
    if (s.tool === 'line') return lineCells(a[0], a[1], b[0], b[1]);
    if (s.tool === 'rect') return rectCells(a[0], a[1], b[0], b[1], s.shapeFilled);
    return ellipseCells(a[0], a[1], b[0], b[1], s.shapeFilled);
  }

  /** Nearest point of the half-cell grid: holes (cell corners), or every half cell. */
  private snap(p: PointerCell): [number, number] {
    const pattern = this.doc.pattern;
    const half = this.store().halfSnap;
    let hx = half ? Math.round(p.cx * 2) : Math.round(p.cx) * 2;
    let hy = half ? Math.round(p.cy * 2) : Math.round(p.cy) * 2;
    hx = Math.max(0, Math.min(2 * pattern.width, hx));
    hy = Math.max(0, Math.min(2 * pattern.height, hy));
    return [hx, hy];
  }

  private activeCss(): string {
    const s = this.store();
    const e = this.doc.pattern.palette.find((x) => x.id === s.activeId);
    if (!e) return '#1d4ed8';
    const [r, g, b] = entryRgb(e);
    return `rgb(${r},${g},${b})`;
  }

  private withFloating(o: Overlay): Overlay {
    const f = this.store().floating;
    if (!f) return { ...o, clip: undefined };
    const colors = new Map(this.doc.pattern.palette.map((e) => [e.id, entryRgb(e)]));
    const cells: [number, number, string][] = [];
    for (const [i, st] of f.clip.cells) {
      const id = st.full || st.partials?.[0]?.id;
      const c = id ? colors.get(id) : undefined;
      if (c)
        cells.push([
          f.x + (i % f.clip.width),
          f.y + Math.floor(i / f.clip.width),
          `rgb(${c[0]},${c[1]},${c[2]})`,
        ]);
    }
    return {
      ...o,
      clip: { cells, rect: { x0: f.x, y0: f.y, x1: f.x + f.clip.width, y1: f.y + f.clip.height } },
    };
  }
}

function rectOf(a: [number, number], b: [number, number]) {
  return {
    x0: Math.min(a[0], b[0]),
    y0: Math.min(a[1], b[1]),
    x1: Math.max(a[0], b[0]) + 1,
    y1: Math.max(a[1], b[1]) + 1,
  };
}

function clipRect(r: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) {
  const out = {
    x0: Math.max(0, r.x0),
    y0: Math.max(0, r.y0),
    x1: Math.min(w, r.x1),
    y1: Math.min(h, r.y1),
  };
  return out.x1 > out.x0 && out.y1 > out.y0 ? out : null;
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function insidePolygon(poly: [number, number][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
