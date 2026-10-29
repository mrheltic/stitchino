import { itemKey } from '../../core/model/document.ts';
import { floodRegion } from '../../core/model/ops.ts';
import { ProgressTracker } from '../../core/progress/tracker.ts';
import type { Overlay } from '../../render/chartRenderer.ts';
import type { PointerTool } from '../editor/ChartView.tsx';
import type { PointerCell } from '../editor/toolController.ts';
import type { StitchState } from './store.ts';

interface Stroke {
  start: [number, number];
  last: [number, number];
  /** Mark (true) or clear (false); decided by the first cell with a stitch. */
  done?: boolean;
  moved: boolean;
}

/** Distance from a point to a segment, all in cells. */
function segmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Stitching-mode input: tap or drag to mark stitches (dragging from a done stitch clears),
 * rectangle and same-colour area, backstitch and knots, parking marks. With an active colour,
 * only its stitches are touched. One gesture is one undo step.
 */
export class StitchController implements PointerTool {
  private base: Overlay = {};
  private ring: { x: number; y: number } | undefined;
  private tracker: ProgressTracker;
  private state: () => StitchState;
  private colorOf: (id: number) => string;
  private stroke: Stroke | null = null;
  private listeners = new Set<() => void>();
  /** Called with a message key when a tool can't act (e.g. parking without a colour). */
  onHint?: (key: string) => void;

  constructor(tracker: ProgressTracker, state: () => StitchState, colorOf: (id: number) => string) {
    this.tracker = tracker;
    this.state = state;
    this.colorOf = colorOf;
  }

  /** Tool feedback plus the parking marks and the pointed-out stitch. */
  get overlay(): Overlay {
    const parked = this.tracker.data.parked;
    return {
      ...this.base,
      ring: this.ring,
      markers: parked.length
        ? parked.map((m) => ({ x: m.x, y: m.y, color: this.colorOf(m.id) }))
        : undefined,
    };
  }

  /** Points out a cell (the next stitch to do), or nothing. */
  setRing(cell: { x: number; y: number } | undefined): void {
    this.ring = cell;
    this.changed();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(): void {
    for (const l of this.listeners) l();
  }

  private index(x: number, y: number): number {
    const p = this.tracker.pattern;
    return x >= 0 && y >= 0 && x < p.width && y < p.height ? y * p.width + x : -1;
  }

  /** Marks or clears one cell along a drag, deciding the direction on the first stitch met. */
  private touch(stroke: Stroke, i: number): void {
    if (i < 0) return;
    const filter = this.state().activeId;
    if (!this.tracker.hasStitch(i, filter)) return;
    stroke.done ??= this.tracker.hasUndone(i, filter);
    this.tracker.markCell(i, stroke.done, filter);
  }

  down(p: PointerCell): void {
    const x = Math.floor(p.cx);
    const y = Math.floor(p.cy);
    const tool = this.state().tool;
    this.stroke = { start: [x, y], last: [x, y], moved: false };
    if (tool === 'mark') {
      this.tracker.begin();
      this.touch(this.stroke, this.index(x, y));
    } else if (tool === 'rect') {
      this.base = { selection: { x0: x, y0: y, x1: x + 1, y1: y + 1 } };
      this.changed();
    }
  }

  move(p: PointerCell): void {
    const x = Math.floor(p.cx);
    const y = Math.floor(p.cy);
    const s = this.stroke;
    if (!s) {
      this.hover(p);
      return;
    }
    if (x === s.last[0] && y === s.last[1]) return;
    s.moved = true;
    const tool = this.state().tool;
    if (tool === 'mark') {
      const p0 = this.tracker.pattern;
      for (const i of ProgressTracker.lineIndices(p0, s.last[0], s.last[1], x, y)) this.touch(s, i);
    } else if (tool === 'rect') {
      this.base = {
        selection: {
          x0: Math.min(s.start[0], x),
          y0: Math.min(s.start[1], y),
          x1: Math.max(s.start[0], x) + 1,
          y1: Math.max(s.start[1], y) + 1,
        },
      };
      this.changed();
    }
    s.last = [x, y];
  }

  up(p: PointerCell): void {
    const s = this.stroke;
    this.stroke = null;
    if (!s) return;
    const tool = this.state().tool;
    const filter = this.state().activeId;
    const x = Math.floor(p.cx);
    const y = Math.floor(p.cy);
    if (tool === 'mark') {
      this.tracker.commit();
    } else if (tool === 'rect') {
      const r = this.base.selection;
      this.base = {};
      this.changed();
      if (!r) return;
      const cells: number[] = [];
      const pattern = this.tracker.pattern;
      for (let cy = Math.max(0, r.y0); cy < Math.min(pattern.height, r.y1); cy++)
        for (let cx = Math.max(0, r.x0); cx < Math.min(pattern.width, r.x1); cx++)
          if (this.tracker.hasStitch(cy * pattern.width + cx, filter))
            cells.push(cy * pattern.width + cx);
      const done = cells.some((i) => this.tracker.hasUndone(i, filter));
      this.tracker.markCells(cells, done, filter);
    } else if (!s.moved) {
      if (tool === 'area') this.markArea(x, y);
      else if (tool === 'lines') this.markLineAt(p.cx, p.cy);
      else if (tool === 'park') this.park(x, y);
    }
  }

  private markArea(x: number, y: number): void {
    const i = this.index(x, y);
    const filter = this.state().activeId;
    if (i < 0 || !this.tracker.hasStitch(i, filter)) return;
    const pattern = this.tracker.pattern;
    const cells = floodRegion(pattern, x, y).map(([cx, cy]) => cy * pattern.width + cx);
    const done = cells.some((c) => this.tracker.hasUndone(c, filter));
    this.tracker.markCells(cells, done, filter);
  }

  /** Toggles the backstitch segment or knot nearest to the tap, if close enough. */
  private markLineAt(cx: number, cy: number): void {
    const filter = this.state().activeId;
    const p = this.tracker.pattern;
    let best: { key: string; kind: 'back' | 'knot'; d: number } | null = null;
    for (const k of p.knots) {
      if (filter !== null && k.id !== filter) continue;
      const d = Math.hypot(cx - k.x / 2, cy - k.y / 2);
      if (d < 0.45 && (!best || d < best.d)) best = { key: itemKey(k), kind: 'knot', d };
    }
    for (const b of p.backstitches) {
      if (filter !== null && b.id !== filter) continue;
      const d = segmentDistance(cx, cy, b.x1 / 2, b.y1 / 2, b.x2 / 2, b.y2 / 2);
      if (d < 0.35 && (!best || d < best.d - 0.05)) best = { key: itemKey(b), kind: 'back', d };
    }
    if (!best) return;
    const set = best.kind === 'back' ? this.tracker.data.backstitches : this.tracker.data.knots;
    this.tracker.markLine(best.key, best.kind, !set.has(best.key));
  }

  private park(x: number, y: number): void {
    const id = this.state().activeId;
    if (this.index(x, y) < 0) return;
    const existing = this.tracker.data.parked.some((m) => m.x === x && m.y === y);
    if (id === null && !existing) {
      this.onHint?.('stitch.hints.parkColor');
      return;
    }
    this.tracker.togglePark(x, y, id ?? 0);
  }

  hover(p: PointerCell): void {
    if (this.stroke) return;
    const x = Math.floor(p.cx);
    const y = Math.floor(p.cy);
    const c = this.base.cursor;
    if (c && c.x === x && c.y === y) return;
    this.base = { ...this.base, cursor: this.index(x, y) >= 0 ? { x, y } : undefined };
    this.changed();
  }

  leave(): void {
    if (!this.base.cursor) return;
    this.base = { ...this.base, cursor: undefined };
    this.changed();
  }

  cancel(): void {
    if (this.stroke && this.state().tool === 'mark') this.tracker.rollback();
    this.stroke = null;
    this.base = {};
    this.changed();
  }
}
