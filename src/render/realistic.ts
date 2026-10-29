import { hexToRgb, type Rgb } from '../core/color/srgb.ts';
import type { CellRect } from '../core/model/document.ts';
import { entryRgb } from '../core/model/entryColor.ts';
import {
  ARM,
  FULL_MASK,
  type Fabric,
  type PaletteEntry,
  type Pattern,
} from '../core/model/pattern.ts';
import { cellSizeMm } from '../core/size/fabric.ts';
import { makeCanvas } from './symbolAtlas.ts';

type AnyCanvas = ReturnType<typeof makeCanvas>;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Apparent width of one strand of six-strand cotton once laid on the fabric (mm). */
const STRAND_MM = 0.36;
const VARIANTS = 3;

export interface RealisticStyle {
  fabric: Fabric;
  /** Overrides the strands of every colour (e.g. to preview 1 vs 2 strands). */
  strands?: number;
}

/**
 * Paints a pattern as stitched thread on fabric. Stitch sprites (per colour, variant, arm mask
 * and size) and the fabric tile are cached; drawing is one drawImage per stitch.
 */
export class RealisticPainter {
  private pattern: Pattern;
  private style: RealisticStyle;
  private sprites = new Map<string, AnyCanvas>();
  private fabricTile: { key: string; canvas: AnyCanvas } | null = null;
  private colours = new Map<number, Rgb>();

  constructor(pattern: Pattern, style?: RealisticStyle) {
    this.pattern = pattern;
    this.style = style ?? { fabric: pattern.fabric };
    this.refreshColours();
  }

  setStyle(style: RealisticStyle): void {
    const same =
      style.strands === this.style.strands &&
      JSON.stringify(style.fabric) === JSON.stringify(this.style.fabric);
    this.style = style;
    if (!same) {
      this.sprites.clear();
      this.fabricTile = null;
    }
  }

  /** Call when the palette changed. */
  refreshColours(): void {
    this.colours = new Map(this.pattern.palette.map((e: PaletteEntry) => [e.id, entryRgb(e)]));
    this.sprites.clear();
  }

  private strandsOf(id: number, back = false): number {
    if (this.style.strands) return this.style.strands;
    const e = this.pattern.palette.find((p) => p.id === id);
    return (back ? e?.backStrands : e?.strands) ?? 2;
  }

  /** Width of a leg relative to the cell side. */
  private legRatio(strands: number): number {
    const mm = cellSizeMm(this.style.fabric);
    return Math.min(0.72, Math.max(0.12, (STRAND_MM * strands) / mm));
  }

  /**
   * Draws the cells of `rect` so that cell (x, y) lands at (ox + x·s, oy + y·s), in the caller's
   * coordinate space; `devicePx` is the cell size in device pixels (sprite resolution).
   */
  draw(ctx: Ctx, ox: number, oy: number, s: number, devicePx: number, rect: CellRect): void {
    const p = this.pattern;
    const px = Math.max(2, Math.round(devicePx));
    this.drawFabric(ctx, ox, oy, s, px, rect);
    for (let y = rect.y0; y < rect.y1; y++) {
      for (let x = rect.x0; x < rect.x1; x++) {
        const i = y * p.width + x;
        const full = p.cells[i];
        const variant = hashCell(x, y) % VARIANTS;
        if (full) {
          ctx.drawImage(
            this.sprite(full, FULL_MASK, variant, px) as CanvasImageSource,
            ox + x * s - s * 0.1,
            oy + y * s - s * 0.1,
            s * 1.2,
            s * 1.2,
          );
          continue;
        }
        const partials = p.partials.get(i);
        if (!partials) continue;
        for (const st of partials) {
          ctx.drawImage(
            this.sprite(st.id, st.mask, variant, px) as CanvasImageSource,
            ox + x * s - s * 0.1,
            oy + y * s - s * 0.1,
            s * 1.2,
            s * 1.2,
          );
        }
      }
    }
    this.drawBackstitches(ctx, ox, oy, s, rect);
    this.drawKnots(ctx, ox, oy, s, rect);
  }

  /** The whole region rendered at `px` pixels per cell, on its own canvas (for printing). */
  renderRegion(rect: CellRect, px: number): AnyCanvas {
    const canvas = makeCanvas((rect.x1 - rect.x0) * px, (rect.y1 - rect.y0) * px);
    const ctx = canvas.getContext('2d') as Ctx;
    this.draw(ctx, -rect.x0 * px, -rect.y0 * px, px, px, rect);
    return canvas;
  }

  private drawFabric(
    ctx: Ctx,
    ox: number,
    oy: number,
    s: number,
    px: number,
    rect: CellRect,
  ): void {
    const tile = this.fabric(px);
    const pattern = ctx.createPattern(tile as CanvasImageSource, 'repeat');
    if (!pattern) return;
    // The tile holds 4×4 cells at `px` per cell; scale it to the drawing scale.
    pattern.setTransform(new DOMMatrix().translate(ox, oy).scale(s / px, s / px));
    ctx.fillStyle = pattern;
    ctx.fillRect(
      ox + rect.x0 * s,
      oy + rect.y0 * s,
      (rect.x1 - rect.x0) * s,
      (rect.y1 - rect.y0) * s,
    );
  }

  /** A 4×4-cell tile of fabric with holes, weave shading and (for linen) uneven threads. */
  private fabric(px: number): AnyCanvas {
    const f = this.style.fabric;
    const key = `${f.kind}|${f.count}|${f.over}|${f.color}|${px}`;
    if (this.fabricTile?.key === key) return this.fabricTile.canvas;
    const n = 4;
    const size = px * n;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d') as Ctx;
    const [r, g, b] = hexToRgb(f.color);
    const lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    ctx.fillStyle = f.color;
    ctx.fillRect(0, 0, size, size);
    const rnd = mulberry32(f.count * 131 + (f.kind === 'linen' ? 7 : 1));
    // Threads per cell: Aida blocks look like 2 threads each way; evenweave/linen "over 2" too,
    // with a hole between them.
    const threads = f.kind === 'aida' ? 3 : 2 * f.over;
    const step = px / threads;
    const shade = (alpha: number) =>
      lum > 0.5 ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha})`;
    const light = (alpha: number) =>
      lum > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 0.6})`;
    for (let k = 0; k < n * threads; k++) {
      const jitter = f.kind === 'linen' ? 0.6 + rnd() * 0.8 : 1;
      ctx.fillStyle = shade(0.05 * jitter);
      ctx.fillRect(k * step + step * 0.15, 0, step * 0.35 * jitter, size);
      ctx.fillRect(0, k * step + step * 0.15, size, step * 0.35 * jitter);
      ctx.fillStyle = light(0.12);
      ctx.fillRect(k * step + step * 0.6, 0, step * 0.15, size);
      ctx.fillRect(0, k * step + step * 0.6, size, step * 0.15);
    }
    // Holes: at every cell corner for Aida, at every fabric thread crossing for evenweave/linen.
    const holeStep = f.kind === 'aida' ? px : px / f.over;
    const holeR = Math.max(0.6, holeStep * (f.kind === 'aida' ? 0.13 : 0.12));
    ctx.fillStyle = shade(lum > 0.5 ? 0.32 : 0.25);
    for (let y = 0; y <= size; y += holeStep) {
      for (let x = 0; x <= size; x += holeStep) {
        ctx.beginPath();
        ctx.arc(x, y, holeR * (f.kind === 'linen' ? 0.8 + rnd() * 0.5 : 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.fabricTile = { key, canvas };
    return canvas;
  }

  private sprite(id: number, mask: number, variant: number, px: number): AnyCanvas {
    const key = `${id}|${mask}|${variant}|${px}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const base = this.colours.get(id) ?? [128, 128, 128];
    const jitter = 1 + (variant - 1) * 0.035;
    const rgb: Rgb = [
      clamp255(base[0] * jitter),
      clamp255(base[1] * jitter),
      clamp255(base[2] * jitter),
    ];
    const pad = px * 0.1;
    const size = Math.ceil(px * 1.2);
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d') as Ctx;
    ctx.translate(pad, pad);
    const w = this.legRatio(this.strandsOf(id)) * px;
    const strands = this.strandsOf(id);
    const rnd = mulberry32(id * 977 + variant * 31 + mask);
    const inset = px * 0.07;
    const c = px / 2;
    const corner: Record<number, [number, number]> = {
      [ARM.TL]: [inset, inset],
      [ARM.TR]: [px - inset, inset],
      [ARM.BL]: [inset, px - inset],
      [ARM.BR]: [px - inset, px - inset],
    };
    const wobble = () => (rnd() - 0.5) * px * 0.04;
    // Bottom leg "/" first (BL–TR), then the top leg "\" (TL–BR), as stitched.
    const legs: [number, number][] = [];
    if ((mask & (ARM.BL | ARM.TR)) === (ARM.BL | ARM.TR)) legs.push([ARM.BL, ARM.TR]);
    if ((mask & (ARM.TL | ARM.BR)) === (ARM.TL | ARM.BR)) legs.push([ARM.TL, ARM.BR]);
    const arms = [ARM.BL, ARM.TR, ARM.TL, ARM.BR].filter(
      (a) => mask & a && !legs.some(([p, q]) => p === a || q === a),
    );
    const segments: [number, number, number, number][] = [
      ...legs.map(([a, b]): [number, number, number, number] => [
        corner[a][0] + wobble(),
        corner[a][1] + wobble(),
        corner[b][0] + wobble(),
        corner[b][1] + wobble(),
      ]),
      ...arms.map((a): [number, number, number, number] => [
        corner[a][0] + wobble(),
        corner[a][1] + wobble(),
        c,
        c,
      ]),
    ];
    for (const [x1, y1, x2, y2] of segments) drawThread(ctx, x1, y1, x2, y2, w, rgb, strands, rnd);
    this.sprites.set(key, canvas);
    return canvas;
  }

  private drawBackstitches(ctx: Ctx, ox: number, oy: number, s: number, rect: CellRect): void {
    const rnd = mulberry32(17);
    for (const b of this.pattern.backstitches) {
      const minX = Math.min(b.x1, b.x2) / 2;
      const maxX = Math.max(b.x1, b.x2) / 2;
      const minY = Math.min(b.y1, b.y2) / 2;
      const maxY = Math.max(b.y1, b.y2) / 2;
      if (maxX < rect.x0 || minX > rect.x1 || maxY < rect.y0 || minY > rect.y1) continue;
      const rgb = this.colours.get(b.id) ?? [0, 0, 0];
      const w = this.legRatio(this.strandsOf(b.id, true)) * s * 0.9;
      drawThread(
        ctx,
        ox + (b.x1 / 2) * s,
        oy + (b.y1 / 2) * s,
        ox + (b.x2 / 2) * s,
        oy + (b.y2 / 2) * s,
        w,
        rgb,
        this.strandsOf(b.id, true),
        rnd,
      );
    }
  }

  private drawKnots(ctx: Ctx, ox: number, oy: number, s: number, rect: CellRect): void {
    for (const k of this.pattern.knots) {
      const x = k.x / 2;
      const y = k.y / 2;
      if (x < rect.x0 - 1 || x > rect.x1 + 1 || y < rect.y0 - 1 || y > rect.y1 + 1) continue;
      const [r, g, b] = this.colours.get(k.id) ?? [0, 0, 0];
      const cx = ox + x * s;
      const cy = oy + y * s;
      const rad = Math.max(1.5, this.legRatio(this.strandsOf(k.id)) * s * 0.85);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(cx + rad * 0.15, cy + rad * 0.2, rad * 1.05, 0, Math.PI * 2);
      ctx.fill();
      const grad = ctx.createRadialGradient(
        cx - rad * 0.35,
        cy - rad * 0.35,
        rad * 0.1,
        cx,
        cy,
        rad,
      );
      grad.addColorStop(0, `rgb(${lighten(r)},${lighten(g)},${lighten(b)})`);
      grad.addColorStop(0.6, `rgb(${r},${g},${b})`);
      grad.addColorStop(1, `rgb(${darken(r)},${darken(g)},${darken(b)})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** A thread from (x1, y1) to (x2, y2): shadow, body darker at the ends, strands, twist. */
function drawThread(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  rgb: Rgb,
  strands: number,
  rnd: () => number,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 0.5) return;
  const [r, g, b] = rgb;
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  // Shadow on the fabric.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, w * 0.1, -w / 2 + w * 0.18, len, w, w / 2);
  ctx.fill();
  // Body: darker where the thread dives into the holes.
  const body = ctx.createLinearGradient(0, 0, len, 0);
  body.addColorStop(0, `rgb(${darken(r)},${darken(g)},${darken(b)})`);
  body.addColorStop(0.18, `rgb(${r},${g},${b})`);
  body.addColorStop(0.82, `rgb(${r},${g},${b})`);
  body.addColorStop(1, `rgb(${darken(r)},${darken(g)},${darken(b)})`);
  ctx.fillStyle = body;
  roundRect(ctx, 0, -w / 2, len, w, w / 2);
  ctx.fill();
  // Roundness across the thread.
  const across = ctx.createLinearGradient(0, -w / 2, 0, w / 2);
  across.addColorStop(0, 'rgba(255,255,255,0.16)');
  across.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  across.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = across;
  roundRect(ctx, 0, -w / 2, len, w, w / 2);
  ctx.fill();
  // Separate strands and the twist of the plies.
  ctx.lineWidth = Math.max(0.5, w * 0.06);
  if (strands > 1 && w > 3) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    for (let k = 1; k < strands; k++) {
      const yy = -w / 2 + (w * k) / strands;
      ctx.beginPath();
      ctx.moveTo(w * 0.3, yy);
      ctx.lineTo(len - w * 0.3, yy);
      ctx.stroke();
    }
  }
  if (w > 2.5) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    const step = Math.max(2, w * 0.55);
    for (let t = w * 0.4 + rnd() * step; t < len - w * 0.4; t += step) {
      ctx.beginPath();
      ctx.moveTo(t - w * 0.2, -w * 0.42);
      ctx.lineTo(t + w * 0.2, w * 0.42);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, h / 2, w / 2));
}

function darken(v: number): number {
  return Math.round(v * 0.72);
}

function lighten(v: number): number {
  return Math.round(v + (255 - v) * 0.35);
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hashCell(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
