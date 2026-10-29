import { removeConfetti, type CleanupLevel } from '../convert/cleanup.ts';
import { countIsolated } from '../convert/cleanup.ts';
import { getThread } from '../threads/catalog.ts';
import {
  CellsCommand,
  CompositeCommand,
  ListCommand,
  PaletteCommand,
  SnapshotCommand,
  readCell,
  type CellState,
  type Command,
} from './document.ts';
import {
  ARM,
  FULL_MASK,
  createPattern,
  isValidPartialMask,
  type ArmMask,
  type Backstitch,
  type Knot,
  type PaletteEntry,
  type PartialStitch,
  type Pattern,
} from './pattern.ts';

export type Point = readonly [x: number, y: number];

export function inBounds(p: Pattern, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < p.width && y < p.height;
}

// --- Cell states -------------------------------------------------------------------------------

/** A cell after adding a stitch covering `mask` with colour `id` over its current content. */
export function withStitch(current: CellState, mask: ArmMask, id: number): CellState {
  if (mask === FULL_MASK) return { full: id };
  const existing: PartialStitch[] = current.full
    ? [{ mask: FULL_MASK, id: current.full }]
    : [...(current.partials ?? [])];
  const next: PartialStitch[] = [];
  for (const p of existing) {
    const rest = p.mask & ~mask;
    if (rest && isValidPartialMask(rest)) next.push({ mask: rest, id: p.id });
    else if (rest) next.push(...splitArms(rest, p.id));
  }
  next.push({ mask, id });
  return collapse(next);
}

/** A cell after removing whatever covers `mask`. */
export function withoutStitch(current: CellState, mask: ArmMask): CellState {
  if (mask === FULL_MASK) return { full: 0 };
  const existing: PartialStitch[] = current.full
    ? [{ mask: FULL_MASK, id: current.full }]
    : [...(current.partials ?? [])];
  const next: PartialStitch[] = [];
  for (const p of existing) {
    const rest = p.mask & ~mask;
    if (rest && isValidPartialMask(rest)) next.push({ mask: rest, id: p.id });
    else if (rest) next.push(...splitArms(rest, p.id));
  }
  return collapse(next);
}

function splitArms(mask: number, id: number): PartialStitch[] {
  return [ARM.TL, ARM.TR, ARM.BL, ARM.BR].filter((a) => mask & a).map((a) => ({ mask: a, id }));
}

/** Merges arms of the same colour and turns a complete single-colour cross into a full stitch. */
function collapse(list: PartialStitch[]): CellState {
  const byId = new Map<number, number>();
  for (const p of list) byId.set(p.id, (byId.get(p.id) ?? 0) | p.mask);
  if (byId.size === 1) {
    const [[id, mask]] = byId;
    if (mask === FULL_MASK) return { full: id };
  }
  const partials: PartialStitch[] = [];
  for (const [id, mask] of byId) {
    if (isValidPartialMask(mask)) partials.push({ mask, id });
    else partials.push(...splitArms(mask, id));
  }
  partials.sort((a, b) => a.mask - b.mask);
  return partials.length ? { full: 0, partials } : { full: 0 };
}

/** Quarter-stitch corner nearest to a position inside the cell (fractions 0..1). */
export function cornerAt(fx: number, fy: number): ArmMask {
  return fy < 0.5 ? (fx < 0.5 ? ARM.TL : ARM.TR) : fx < 0.5 ? ARM.BL : ARM.BR;
}

const OPPOSITE: Record<number, number> = {
  [ARM.TL]: ARM.BR,
  [ARM.TR]: ARM.BL,
  [ARM.BL]: ARM.TR,
  [ARM.BR]: ARM.TL,
};

/** Three-quarter stitch covering the given corner (the opposite arm is missing). */
export function threeQuarterFor(corner: ArmMask): ArmMask {
  return FULL_MASK & ~OPPOSITE[corner];
}

export function mirrorMask(mask: ArmMask, horizontal: boolean): ArmMask {
  const swap = horizontal
    ? [
        [ARM.TL, ARM.TR],
        [ARM.BL, ARM.BR],
      ]
    : [
        [ARM.TL, ARM.BL],
        [ARM.TR, ARM.BR],
      ];
  let out = 0;
  for (const [a, b] of swap) {
    if (mask & a) out |= b;
    if (mask & b) out |= a;
  }
  return out;
}

// --- Painting ----------------------------------------------------------------------------------

export type Symmetry = 'none' | 'horizontal' | 'vertical' | 'both';

/** The position and its mirror images; masks are mirrored to match. */
export function symmetric(
  p: Pattern,
  x: number,
  y: number,
  mask: ArmMask,
  sym: Symmetry,
): [number, number, ArmMask][] {
  const out: [number, number, ArmMask][] = [[x, y, mask]];
  const mx = p.width - 1 - x;
  const my = p.height - 1 - y;
  if (sym === 'horizontal' || sym === 'both') out.push([mx, y, mirrorMask(mask, true)]);
  if (sym === 'vertical' || sym === 'both') out.push([x, my, mirrorMask(mask, false)]);
  if (sym === 'both') out.push([mx, my, mirrorMask(mirrorMask(mask, true), false)]);
  const seen = new Set<string>();
  return out.filter(
    ([a, b, m]) => !seen.has(`${a},${b},${m}`) && (seen.add(`${a},${b},${m}`), true),
  );
}

/** Adds stitches (id > 0) or erases (id = 0) at the given cells into `cmd`. */
export function paint(
  p: Pattern,
  cmd: CellsCommand,
  cells: Iterable<Point>,
  mask: ArmMask,
  id: number,
  sym: Symmetry = 'none',
): void {
  for (const [x0, y0] of cells) {
    for (const [x, y, m] of symmetric(p, x0, y0, mask, sym)) {
      if (!inBounds(p, x, y)) continue;
      const i = y * p.width + x;
      const current = cmd.after.get(i) ?? readCell(p, i);
      cmd.record(p, i, id ? withStitch(current, m, id) : withoutStitch(current, m));
    }
  }
}

/** Cells on the segment between two cells (Bresenham), both ends included. */
export function lineCells(x0: number, y0: number, x1: number, y1: number): Point[] {
  const out: Point[] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    out.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

export function rectCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const out: Point[] = [];
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) {
      if (filled || x === ax || x === bx || y === ay || y === by) out.push([x, y]);
    }
  }
  return out;
}

/** Cells of the ellipse inscribed in the rectangle (outline is one stitch wide). */
export function ellipseCells(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
): Point[] {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  const cx = (ax + bx) / 2;
  const cy = (ay + by) / 2;
  const rx = (bx - ax) / 2 + 0.5;
  const ry = (by - ay) / 2 + 0.5;
  const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const out: Point[] = [];
  for (let y = ay; y <= by; y++) {
    for (let x = ax; x <= bx; x++) {
      if (!inside(x, y)) continue;
      if (
        filled ||
        !inside(x - 1, y) ||
        !inside(x + 1, y) ||
        !inside(x, y - 1) ||
        !inside(x, y + 1)
      )
        out.push([x, y]);
    }
  }
  return out;
}

/** Same-content region around (x, y), 4-connected; cells with partial stitches are walls. */
export function floodRegion(p: Pattern, x: number, y: number): Point[] {
  if (!inBounds(p, x, y)) return [];
  const start = y * p.width + x;
  if (p.partials.has(start)) return [[x, y]];
  const target = p.cells[start];
  const seen = new Uint8Array(p.width * p.height);
  const out: Point[] = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const cx = i % p.width;
    const cy = (i - cx) / p.width;
    out.push([cx, cy]);
    const next = [
      cx > 0 ? i - 1 : -1,
      cx < p.width - 1 ? i + 1 : -1,
      cy > 0 ? i - p.width : -1,
      cy < p.height - 1 ? i + p.width : -1,
    ];
    for (const j of next) {
      if (j >= 0 && !seen[j] && p.cells[j] === target && !p.partials.has(j)) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return out;
}

// --- Palette operations ------------------------------------------------------------------------

/** Replaces colour `from` with `to` everywhere (cells, partials, backstitch, knots). */
export function replaceColorCommand(p: Pattern, from: number, to: number): Command {
  const cells = new CellsCommand(p.width);
  for (let i = 0; i < p.cells.length; i++) {
    if (p.cells[i] === from) cells.record(p, i, { full: to });
  }
  for (const [i, list] of p.partials) {
    if (list.some((s) => s.id === from)) {
      let st: CellState = { full: 0 };
      for (const s of list) st = withStitch(st, s.mask, s.id === from ? to : s.id);
      cells.record(p, i, st);
    }
  }
  const backOld = p.backstitches.filter((b) => b.id === from);
  const knotsOld = p.knots.filter((k) => k.id === from);
  const parts: Command[] = [cells];
  if (backOld.length)
    parts.push(
      new ListCommand<Backstitch>(
        'backstitches',
        backOld.map((b) => ({ ...b, id: to })),
        backOld,
      ),
    );
  if (knotsOld.length)
    parts.push(
      new ListCommand<Knot>(
        'knots',
        knotsOld.map((k) => ({ ...k, id: to })),
        knotsOld,
      ),
    );
  return new CompositeCommand(parts);
}

/** Moves all stitches of `from` to `into` and removes `from` from the palette. */
export function mergeColorsCommand(p: Pattern, from: number, into: number): Command {
  const replace = replaceColorCommand(p, from, into);
  const palette = new PaletteCommand(
    p.palette,
    p.palette.filter((e) => e.id !== from),
  );
  return new CompositeCommand([replace, palette]);
}

/** Removes a colour and every stitch that uses it. */
export function deleteColorCommand(p: Pattern, id: number): Command {
  const replace = replaceColorCommand(p, id, 0);
  const palette = new PaletteCommand(
    p.palette,
    p.palette.filter((e) => e.id !== id),
  );
  return new CompositeCommand([replace, palette]);
}

export function updatePaletteCommand(
  p: Pattern,
  update: (entries: PaletteEntry[]) => PaletteEntry[],
): Command {
  const after = update(p.palette.map((e) => ({ ...e, threads: e.threads.map((t) => ({ ...t })) })));
  return new PaletteCommand(p.palette, after);
}

// --- Canvas operations -------------------------------------------------------------------------

/**
 * New canvas size; `ax`/`ay` (0, 0.5 or 1) say where the old content sits (0 = left/top).
 * Content outside the new canvas is dropped.
 */
export function resizeCommand(
  p: Pattern,
  width: number,
  height: number,
  ax: number,
  ay: number,
): Command {
  const dx = Math.round((width - p.width) * ax);
  const dy = Math.round((height - p.height) * ay);
  return new SnapshotCommand(p, shifted(p, width, height, dx, dy));
}

/** Crops the canvas to a rectangle of cells. */
export function cropCommand(p: Pattern, x0: number, y0: number, x1: number, y1: number): Command {
  return new SnapshotCommand(p, shifted(p, x1 - x0, y1 - y0, -x0, -y0));
}

function shifted(p: Pattern, width: number, height: number, dx: number, dy: number): Pattern {
  const out = createPattern(width, height, { palette: p.palette, fabric: p.fabric, meta: p.meta });
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const i = y * p.width + x;
      const j = ny * width + nx;
      out.cells[j] = p.cells[i];
      const partials = p.partials.get(i);
      if (partials)
        out.partials.set(
          j,
          partials.map((s) => ({ ...s })),
        );
    }
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x <= 2 * width && y <= 2 * height;
  out.backstitches = p.backstitches
    .map((b) => ({
      ...b,
      x1: b.x1 + 2 * dx,
      y1: b.y1 + 2 * dy,
      x2: b.x2 + 2 * dx,
      y2: b.y2 + 2 * dy,
    }))
    .filter((b) => inside(b.x1, b.y1) && inside(b.x2, b.y2));
  out.knots = p.knots
    .map((k) => ({ ...k, x: k.x + 2 * dx, y: k.y + 2 * dy }))
    .filter((k) => inside(k.x, k.y));
  return out;
}

// --- Clips (selections) ------------------------------------------------------------------------

/** A copied piece of pattern; coordinates are relative to its top-left cell. */
export interface Clip {
  width: number;
  height: number;
  /** Cell states by local index; missing = empty. */
  cells: Map<number, CellState>;
  backstitches: Backstitch[];
  knots: Knot[];
}

/** Copies the cells selected in `mask` (one byte per pattern cell) inside the rectangle. */
export function extractClip(
  p: Pattern,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mask?: Uint8Array,
): Clip {
  const width = x1 - x0;
  const height = y1 - y0;
  const cells = new Map<number, CellState>();
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * p.width + x;
      if (mask && !mask[i]) continue;
      const st = readCell(p, i);
      if (st.full || st.partials) cells.set((y - y0) * width + (x - x0), st);
    }
  }
  const inRect = (hx: number, hy: number) =>
    hx >= 2 * x0 && hy >= 2 * y0 && hx <= 2 * x1 && hy <= 2 * y1;
  const backstitches = p.backstitches
    .filter((b) => inRect(b.x1, b.y1) && inRect(b.x2, b.y2))
    .map((b) => ({
      ...b,
      x1: b.x1 - 2 * x0,
      y1: b.y1 - 2 * y0,
      x2: b.x2 - 2 * x0,
      y2: b.y2 - 2 * y0,
    }));
  const knots = p.knots
    .filter((k) => inRect(k.x, k.y))
    .map((k) => ({ ...k, x: k.x - 2 * x0, y: k.y - 2 * y0 }));
  return { width, height, cells, backstitches, knots };
}

export function flipClip(c: Clip, horizontal: boolean): Clip {
  const cells = new Map<number, CellState>();
  for (const [i, st] of c.cells) {
    const x = i % c.width;
    const y = (i - x) / c.width;
    const nx = horizontal ? c.width - 1 - x : x;
    const ny = horizontal ? y : c.height - 1 - y;
    cells.set(ny * c.width + nx, {
      full: st.full,
      partials: st.partials?.map((s) => ({ id: s.id, mask: mirrorMask(s.mask, horizontal) })),
    });
  }
  const fx = (v: number) => (horizontal ? 2 * c.width - v : v);
  const fy = (v: number) => (horizontal ? v : 2 * c.height - v);
  return {
    ...c,
    cells,
    backstitches: c.backstitches.map((b) => ({
      ...b,
      x1: fx(b.x1),
      y1: fy(b.y1),
      x2: fx(b.x2),
      y2: fy(b.y2),
    })),
    knots: c.knots.map((k) => ({ ...k, x: fx(k.x), y: fy(k.y) })),
  };
}

/** Rotates a clip 90° clockwise. */
export function rotateClip(c: Clip): Clip {
  const cells = new Map<number, CellState>();
  const rotMask = (m: number) =>
    (m & ARM.TL ? ARM.TR : 0) |
    (m & ARM.TR ? ARM.BR : 0) |
    (m & ARM.BR ? ARM.BL : 0) |
    (m & ARM.BL ? ARM.TL : 0);
  for (const [i, st] of c.cells) {
    const x = i % c.width;
    const y = (i - x) / c.width;
    const nx = c.height - 1 - y;
    const ny = x;
    cells.set(ny * c.height + nx, {
      full: st.full,
      partials: st.partials?.map((s) => ({ id: s.id, mask: rotMask(s.mask) })),
    });
  }
  // Half-grid point (hx, hy) → (2·height − hy, hx).
  const rx = (hy: number) => 2 * c.height - hy;
  return {
    width: c.height,
    height: c.width,
    cells,
    backstitches: c.backstitches.map((b) => ({
      ...b,
      x1: rx(b.y1),
      y1: b.x1,
      x2: rx(b.y2),
      y2: b.x2,
    })),
    knots: c.knots.map((k) => ({ ...k, x: rx(k.y), y: k.x })),
  };
}

/** Pastes a clip with its top-left cell at (x, y); empty clip cells leave the canvas untouched. */
export function pasteCommand(p: Pattern, c: Clip, x: number, y: number): Command {
  const cells = new CellsCommand(p.width);
  for (const [i, st] of c.cells) {
    const cx = (i % c.width) + x;
    const cy = Math.floor(i / c.width) + y;
    if (inBounds(p, cx, cy)) cells.record(p, cy * p.width + cx, st);
  }
  const ok = (hx: number, hy: number) =>
    hx >= 0 && hy >= 0 && hx <= 2 * p.width && hy <= 2 * p.height;
  const back = c.backstitches
    .map((b) => ({ ...b, x1: b.x1 + 2 * x, y1: b.y1 + 2 * y, x2: b.x2 + 2 * x, y2: b.y2 + 2 * y }))
    .filter((b) => ok(b.x1, b.y1) && ok(b.x2, b.y2));
  const knots = c.knots
    .map((k) => ({ ...k, x: k.x + 2 * x, y: k.y + 2 * y }))
    .filter((k) => ok(k.x, k.y));
  const parts: Command[] = [cells];
  if (back.length) parts.push(new ListCommand<Backstitch>('backstitches', back, []));
  if (knots.length) parts.push(new ListCommand<Knot>('knots', knots, []));
  return new CompositeCommand(parts);
}

/** Clears the selected cells and the backstitch/knots inside the rectangle. */
export function clearCommand(
  p: Pattern,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mask?: Uint8Array,
): Command {
  const cells = new CellsCommand(p.width);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * p.width + x;
      if (mask && !mask[i]) continue;
      if (p.cells[i] || p.partials.has(i)) cells.record(p, i, { full: 0 });
    }
  }
  const inRect = (hx: number, hy: number) =>
    hx >= 2 * x0 && hy >= 2 * y0 && hx <= 2 * x1 && hy <= 2 * y1;
  const back = p.backstitches.filter((b) => inRect(b.x1, b.y1) && inRect(b.x2, b.y2));
  const knots = p.knots.filter((k) => inRect(k.x, k.y));
  const parts: Command[] = [cells];
  if (back.length) parts.push(new ListCommand<Backstitch>('backstitches', [], back));
  if (knots.length) parts.push(new ListCommand<Knot>('knots', [], knots));
  return new CompositeCommand(parts);
}

// --- Confetti --------------------------------------------------------------------------------

/** Full stitches with no same-colour neighbour, as a cell mask. */
export function isolatedMask(p: Pattern): Uint8Array {
  const { width: w, height: h, cells } = p;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = cells[y * w + x];
      if (!c) continue;
      let alone = true;
      for (let dy = -1; dy <= 1 && alone; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (
            (dx || dy) &&
            x + dx >= 0 &&
            y + dy >= 0 &&
            x + dx < w &&
            y + dy < h &&
            cells[(y + dy) * w + x + dx] === c
          ) {
            alone = false;
            break;
          }
        }
      }
      if (alone) out[y * w + x] = 1;
    }
  }
  return out;
}

export function isolatedCount(p: Pattern): number {
  return countIsolated(p.cells, p.width, p.height, 0);
}

/**
 * Confetti cleanup on full stitches, as an undoable command. With `region`, only cells inside it
 * may change (cleanup brush).
 */
export function cleanupCommand(
  p: Pattern,
  level: CleanupLevel,
  protectDetails: boolean,
  region?: Uint8Array,
): CellsCommand {
  const ids = p.palette.map((e) => e.id);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const lab = Float64Array.from(
    p.palette.flatMap((e) => {
      const t = getThread(e.threads[0]);
      return t ? [...t.lab] : [50, 0, 0];
    }),
  );
  const assign = new Int16Array(p.cells.length);
  for (let i = 0; i < p.cells.length; i++) {
    assign[i] = p.partials.has(i) ? -2 : p.cells[i] ? (indexOf.get(p.cells[i]) ?? -1) : -1;
  }
  const before = new Int16Array(assign);
  removeConfetti(assign, p.width, p.height, lab, level, protectDetails);
  const cmd = new CellsCommand(p.width);
  for (let i = 0; i < assign.length; i++) {
    if (assign[i] === before[i] || before[i] === -2 || assign[i] === -2) continue;
    if (region && !region[i]) continue;
    cmd.record(p, i, { full: assign[i] >= 0 ? ids[assign[i]] : 0 });
  }
  return cmd;
}
