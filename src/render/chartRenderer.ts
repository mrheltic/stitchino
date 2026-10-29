import { hexToRgb, relativeLuminance, type Rgb } from '../core/color/srgb.ts';
import type { ChangeInfo, CellRect } from '../core/model/document.ts';
import { ARM, type PaletteEntry, type PartialStitch, type Pattern } from '../core/model/pattern.ts';
import { entryRgb } from '../core/model/entryColor.ts';
import { RealisticPainter, type RealisticStyle } from './realistic.ts';
import { SymbolAtlas, makeCanvas, type Ink } from './symbolAtlas.ts';
import type { Viewport } from './viewport.ts';

export type ViewMode = 'colorSymbols' | 'symbols' | 'colors' | 'realistic';

export interface Overlay {
  /** Cells previewed by the current tool (shapes, text). */
  cells?: { points: readonly (readonly [number, number])[]; color: string };
  /** Backstitch being drawn, in half-cell coordinates. */
  line?: { x1: number; y1: number; x2: number; y2: number; color: string };
  /** Cell under the pointer. */
  cursor?: { x: number; y: number };
  /** Selection rectangle in cells (x1/y1 exclusive). */
  selection?: CellRect;
  /** Half-grid point under the pointer (backstitch and knot tools). */
  point?: { x: number; y: number };
  /** Cells selected by lasso or colour (one byte per pattern cell), tinted inside `selection`. */
  selectionMask?: Uint8Array;
  /** Lasso being drawn, in cells. */
  path?: readonly (readonly [number, number])[];
  /** Pasted content being placed: cells with their colours, and its frame. */
  clip?: { cells: [number, number, string][]; rect: CellRect };
}

export interface RenderOptions {
  mode: ViewMode;
  grid: boolean;
  rulers: boolean;
  /** Only this colour at full strength. */
  highlightId: number | null;
  /** Colours shown faded. */
  hidden: ReadonlySet<number>;
  showIsolated: boolean;
  isolated?: Uint8Array;
  /** Workspace colour around the pattern. */
  background: string;
  overlay?: Overlay;
  /** Extra cell layer drawn over the colours (stitching progress). */
  layer?: { image: CanvasImageSource; scale: number };
  /** Fabric and strands for the stitched view; defaults to the pattern's fabric. */
  realistic?: RealisticStyle;
}

interface Swatch {
  rgb: Rgb;
  css: string;
  ink: Ink;
}

const RULER = 22;
const QUADRANT: Record<number, [number, number]> = {
  [ARM.TL]: [0, 0],
  [ARM.TR]: [1, 0],
  [ARM.BL]: [0, 1],
  [ARM.BR]: [1, 1],
};

/**
 * Draws a pattern as layers of images with two pixels per cell (one per quarter), scaled up
 * without smoothing, plus symbols from a sprite atlas, grid, backstitch, knots and overlays.
 * Only what changed is repainted into the layers; a frame is a handful of drawImage calls.
 */
export class ChartRenderer {
  private pattern: Pattern;
  private colours: ReturnType<typeof makeCanvas>;
  private dim: ReturnType<typeof makeCanvas> | null = null;
  private dimKey = '';
  private isolatedImg: ReturnType<typeof makeCanvas> | null = null;
  private isolatedRef: Uint8Array | null = null;
  private swatches = new Map<number, Swatch>();
  private fabric: Rgb;
  private atlas = new SymbolAtlas();
  private painter: RealisticPainter | null = null;

  constructor(pattern: Pattern) {
    this.pattern = pattern;
    this.fabric = hexToRgb(pattern.fabric.color);
    this.colours = makeCanvas(pattern.width * 2, pattern.height * 2);
    this.rebuildSwatches();
    this.paintColours(fullRectOf(pattern));
  }

  /** Call after the symbol font has loaded so the atlas is redrawn with it. */
  fontsReady(): void {
    this.atlas.reset();
  }

  invalidate(info: ChangeInfo): void {
    const p = this.pattern;
    if (info.resized) {
      this.colours = makeCanvas(p.width * 2, p.height * 2);
      this.dim = null;
      this.dimKey = '';
    }
    if (info.palette || info.meta || info.resized) {
      this.fabric = hexToRgb(p.fabric.color);
      this.painter?.refreshColours();
      this.rebuildSwatches();
      this.paintColours(fullRectOf(p));
      this.dimKey = '';
      return;
    }
    if (info.cells) {
      this.paintColours(info.cells);
      this.dimKey = '';
    }
  }

  private rebuildSwatches(): void {
    this.swatches.clear();
    for (const e of this.pattern.palette) this.swatches.set(e.id, swatchOf(e));
  }

  private paintColours(r: CellRect): void {
    const p = this.pattern;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    if (w <= 0 || h <= 0) return;
    const ctx = ctx2d(this.colours);
    const img = ctx.createImageData(w * 2, h * 2);
    const d = img.data;
    const put = (qx: number, qy: number, c: Rgb) => {
      const o = (qy * w * 2 + qx) * 4;
      d[o] = c[0];
      d[o + 1] = c[1];
      d[o + 2] = c[2];
      d[o + 3] = 255;
    };
    for (let y = r.y0; y < r.y1; y++) {
      for (let x = r.x0; x < r.x1; x++) {
        const i = y * p.width + x;
        const lx = (x - r.x0) * 2;
        const ly = (y - r.y0) * 2;
        const full = p.cells[i];
        const base = full ? (this.swatches.get(full)?.rgb ?? this.fabric) : this.fabric;
        put(lx, ly, base);
        put(lx + 1, ly, base);
        put(lx, ly + 1, base);
        put(lx + 1, ly + 1, base);
        const partials = p.partials.get(i);
        if (partials) {
          for (const s of partials) {
            const c = this.swatches.get(s.id)?.rgb ?? this.fabric;
            for (const arm of [ARM.TL, ARM.TR, ARM.BL, ARM.BR]) {
              if (s.mask & arm) put(lx + QUADRANT[arm][0], ly + QUADRANT[arm][1], c);
            }
          }
        }
      }
    }
    ctx.putImageData(img, r.x0 * 2, r.y0 * 2);
  }

  /** Fabric-coloured veil over every quarter not in the highlighted (or not hidden) colours. */
  private dimLayer(
    highlightId: number | null,
    hidden: ReadonlySet<number>,
  ): ReturnType<typeof makeCanvas> | null {
    if (highlightId === null && hidden.size === 0) return null;
    const key = `${highlightId}|${[...hidden].sort().join(',')}`;
    if (this.dim && this.dimKey === key) return this.dim;
    const p = this.pattern;
    this.dim ??= makeCanvas(p.width * 2, p.height * 2);
    const ctx = ctx2d(this.dim);
    const img = ctx.createImageData(p.width * 2, p.height * 2);
    const d = img.data;
    const faded = (id: number) => (highlightId !== null ? id !== highlightId : hidden.has(id));
    const [fr, fg, fb] = this.fabric;
    const veil = (qx: number, qy: number) => {
      const o = (qy * p.width * 2 + qx) * 4;
      d[o] = fr;
      d[o + 1] = fg;
      d[o + 2] = fb;
      d[o + 3] = 215;
    };
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        const i = y * p.width + x;
        const full = p.cells[i];
        if (full) {
          if (faded(full)) {
            veil(2 * x, 2 * y);
            veil(2 * x + 1, 2 * y);
            veil(2 * x, 2 * y + 1);
            veil(2 * x + 1, 2 * y + 1);
          }
          continue;
        }
        for (const s of p.partials.get(i) ?? []) {
          if (!faded(s.id)) continue;
          for (const arm of [ARM.TL, ARM.TR, ARM.BL, ARM.BR]) {
            if (s.mask & arm) veil(2 * x + QUADRANT[arm][0], 2 * y + QUADRANT[arm][1]);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dimKey = key;
    return this.dim;
  }

  private isolatedLayer(mask: Uint8Array): ReturnType<typeof makeCanvas> {
    if (this.isolatedImg && this.isolatedRef === mask) return this.isolatedImg;
    const p = this.pattern;
    this.isolatedImg = makeCanvas(p.width, p.height);
    const ctx = ctx2d(this.isolatedImg);
    const img = ctx.createImageData(p.width, p.height);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      img.data[i * 4] = 230;
      img.data[i * 4 + 1] = 20;
      img.data[i * 4 + 2] = 60;
      img.data[i * 4 + 3] = 170;
    }
    ctx.putImageData(img, 0, 0);
    this.isolatedRef = mask;
    return this.isolatedImg;
  }

  render(ctx: CanvasRenderingContext2D, vp: Viewport, o: RenderOptions): void {
    const p = this.pattern;
    const s = vp.scale;
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = o.background;
    ctx.fillRect(0, 0, vp.width, vp.height);

    const v = vp.visible(p.width, p.height);
    if (v.x1 <= v.x0 || v.y1 <= v.y0) {
      if (o.rulers) this.drawRulers(ctx, vp, o);
      return;
    }
    const [vx, vy] = vp.toScreen(v.x0, v.y0);
    const vw = (v.x1 - v.x0) * s;
    const vh = (v.y1 - v.y0) * s;

    // Fabric and colours.
    ctx.fillStyle =
      o.mode === 'symbols' ? '#ffffff' : (o.realistic?.fabric.color ?? p.fabric.color);
    ctx.fillRect(vx, vy, vw, vh);
    if (o.mode === 'realistic' && s >= 1.5) {
      this.painter ??= new RealisticPainter(p);
      this.painter.setStyle(o.realistic ?? { fabric: p.fabric });
      ctx.imageSmoothingEnabled = true;
      this.painter.draw(ctx, vp.ox, vp.oy, s, s * vp.dpr, v);
      ctx.imageSmoothingEnabled = false;
    } else if (o.mode !== 'symbols') {
      ctx.drawImage(
        this.colours as CanvasImageSource,
        v.x0 * 2,
        v.y0 * 2,
        (v.x1 - v.x0) * 2,
        (v.y1 - v.y0) * 2,
        vx,
        vy,
        vw,
        vh,
      );
    }
    if (o.layer) {
      const k = o.layer.scale;
      ctx.drawImage(
        o.layer.image,
        v.x0 * k,
        v.y0 * k,
        (v.x1 - v.x0) * k,
        (v.y1 - v.y0) * k,
        vx,
        vy,
        vw,
        vh,
      );
    }

    // Symbols.
    if (o.mode !== 'colors' && o.mode !== 'realistic' && s >= 9)
      this.drawSymbols(ctx, vp, v, o.mode);

    const dim = this.dimLayer(o.highlightId, o.hidden);
    if (dim)
      ctx.drawImage(
        dim as CanvasImageSource,
        v.x0 * 2,
        v.y0 * 2,
        (v.x1 - v.x0) * 2,
        (v.y1 - v.y0) * 2,
        vx,
        vy,
        vw,
        vh,
      );
    if (o.showIsolated && o.isolated) {
      ctx.drawImage(
        this.isolatedLayer(o.isolated) as CanvasImageSource,
        v.x0,
        v.y0,
        v.x1 - v.x0,
        v.y1 - v.y0,
        vx,
        vy,
        vw,
        vh,
      );
    }

    if (o.grid && s >= 4) this.drawGrid(ctx, vp, v);
    this.drawBorderAndCentre(ctx, vp);
    if (o.mode !== 'realistic') {
      this.drawBackstitches(ctx, vp, o);
      this.drawKnots(ctx, vp, o);
    }
    if (o.overlay) this.drawOverlay(ctx, vp, o.overlay);
    if (o.rulers) this.drawRulers(ctx, vp, o);
  }

  private drawSymbols(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    v: CellRect,
    mode: ViewMode,
  ): void {
    const p = this.pattern;
    const s = vp.scale;
    const symbols = p.palette.map((e) => e.symbol).filter(Boolean);
    this.atlas.prepare(symbols, s * 0.8 * vp.dpr);
    const byId = new Map<number, PaletteEntry>(p.palette.map((e) => [e.id, e]));
    const ink = (id: number): Ink =>
      mode === 'symbols' ? 'black' : (this.swatches.get(id)?.ink ?? 'black');
    for (let y = v.y0; y < v.y1; y++) {
      for (let x = v.x0; x < v.x1; x++) {
        const i = y * p.width + x;
        const full = p.cells[i];
        const [sx, sy] = vp.toScreen(x, y);
        if (full) {
          const e = byId.get(full);
          if (e?.symbol) this.atlas.draw(ctx, e.symbol, ink(full), sx + s / 2, sy + s / 2, s * 0.8);
          continue;
        }
        const partials = p.partials.get(i);
        if (partials && s >= 14) {
          for (const st of partials) {
            const e = byId.get(st.id);
            if (!e?.symbol) continue;
            const [qx, qy] = centroid(st);
            if (mode === 'symbols') {
              ctx.strokeStyle = 'rgba(0,0,0,0.5)';
              ctx.lineWidth = 1;
              strokeArms(ctx, sx, sy, s, st);
            }
            this.atlas.draw(ctx, e.symbol, ink(st.id), sx + qx * s, sy + qy * s, s * 0.42);
          }
        }
      }
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, v: CellRect): void {
    const s = vp.scale;
    const [ax, ay] = vp.toScreen(v.x0, v.y0);
    const [bx, by] = vp.toScreen(v.x1, v.y1);
    const px = 1 / vp.dpr;
    const snap = (c: number) => Math.round(c * vp.dpr) / vp.dpr + px / 2;
    ctx.lineWidth = px;
    ctx.strokeStyle = 'rgba(40, 30, 30, 0.22)';
    ctx.beginPath();
    if (s >= 6) {
      for (let x = v.x0; x <= v.x1; x++) {
        if (x % 10 === 0) continue;
        const sx = snap(vp.ox + x * s);
        ctx.moveTo(sx, ay);
        ctx.lineTo(sx, by);
      }
      for (let y = v.y0; y <= v.y1; y++) {
        if (y % 10 === 0) continue;
        const sy = snap(vp.oy + y * s);
        ctx.moveTo(ax, sy);
        ctx.lineTo(bx, sy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30, 20, 20, 0.7)';
    ctx.lineWidth = Math.max(px, Math.min(2, s / 10));
    ctx.beginPath();
    for (let x = Math.ceil(v.x0 / 10) * 10; x <= v.x1; x += 10) {
      const sx = snap(vp.ox + x * s);
      ctx.moveTo(sx, ay);
      ctx.lineTo(sx, by);
    }
    for (let y = Math.ceil(v.y0 / 10) * 10; y <= v.y1; y += 10) {
      const sy = snap(vp.oy + y * s);
      ctx.moveTo(ax, sy);
      ctx.lineTo(bx, sy);
    }
    ctx.stroke();
  }

  private drawBorderAndCentre(ctx: CanvasRenderingContext2D, vp: Viewport): void {
    const p = this.pattern;
    const [x0, y0] = vp.toScreen(0, 0);
    const [x1, y1] = vp.toScreen(p.width, p.height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(30, 20, 20, 0.8)';
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
    // Centre arrows on the four sides.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const a = 7;
    ctx.fillStyle = '#9e2f45';
    ctx.beginPath();
    ctx.moveTo(cx - a, y0 - a - 2);
    ctx.lineTo(cx + a, y0 - a - 2);
    ctx.lineTo(cx, y0 - 2);
    ctx.moveTo(cx - a, y1 + a + 2);
    ctx.lineTo(cx + a, y1 + a + 2);
    ctx.lineTo(cx, y1 + 2);
    ctx.moveTo(x0 - a - 2, cy - a);
    ctx.lineTo(x0 - a - 2, cy + a);
    ctx.lineTo(x0 - 2, cy);
    ctx.moveTo(x1 + a + 2, cy - a);
    ctx.lineTo(x1 + a + 2, cy + a);
    ctx.lineTo(x1 + 2, cy);
    ctx.fill();
  }

  private drawBackstitches(ctx: CanvasRenderingContext2D, vp: Viewport, o: RenderOptions): void {
    const p = this.pattern;
    if (p.backstitches.length === 0) return;
    const s = vp.scale;
    ctx.lineCap = 'round';
    const width = Math.max(1.5, s * 0.16);
    for (const b of p.backstitches) {
      const [x1, y1] = vp.toScreen(b.x1 / 2, b.y1 / 2);
      const [x2, y2] = vp.toScreen(b.x2 / 2, b.y2 / 2);
      if (
        Math.max(x1, x2) < 0 ||
        Math.min(x1, x2) > vp.width ||
        Math.max(y1, y2) < 0 ||
        Math.min(y1, y2) > vp.height
      )
        continue;
      const faded = o.highlightId !== null ? b.id !== o.highlightId : o.hidden.has(b.id);
      ctx.globalAlpha = faded ? 0.2 : 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = width + 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.strokeStyle = this.swatches.get(b.id)?.css ?? '#000';
      ctx.lineWidth = width;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawKnots(ctx: CanvasRenderingContext2D, vp: Viewport, o: RenderOptions): void {
    const p = this.pattern;
    if (p.knots.length === 0) return;
    const r = Math.max(2.5, vp.scale * 0.28);
    for (const k of p.knots) {
      const [x, y] = vp.toScreen(k.x / 2, k.y / 2);
      if (x < -r || y < -r || x > vp.width + r || y > vp.height + r) continue;
      const faded = o.highlightId !== null ? k.id !== o.highlightId : o.hidden.has(k.id);
      ctx.globalAlpha = faded ? 0.2 : 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = this.swatches.get(k.id)?.css ?? '#000';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawOverlay(ctx: CanvasRenderingContext2D, vp: Viewport, ov: Overlay): void {
    const s = vp.scale;
    if (ov.cells) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = ov.cells.color;
      for (const [x, y] of ov.cells.points) {
        const [sx, sy] = vp.toScreen(x, y);
        if (sx > vp.width || sy > vp.height || sx + s < 0 || sy + s < 0) continue;
        ctx.fillRect(sx, sy, s, s);
      }
      ctx.globalAlpha = 1;
    }
    if (ov.clip) {
      ctx.globalAlpha = 0.85;
      for (const [x, y, css] of ov.clip.cells) {
        const [sx, sy] = vp.toScreen(x, y);
        if (sx > vp.width || sy > vp.height || sx + s < 0 || sy + s < 0) continue;
        ctx.fillStyle = css;
        ctx.fillRect(sx, sy, s, s);
      }
      ctx.globalAlpha = 1;
      const [x0, y0] = vp.toScreen(ov.clip.rect.x0, ov.clip.rect.y0);
      const [x1, y1] = vp.toScreen(ov.clip.rect.x1, ov.clip.rect.y1);
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#16a34a';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
    }
    if (ov.selection && ov.selectionMask) {
      const p = this.pattern;
      const v = vp.visible(p.width, p.height);
      const sel = ov.selection;
      ctx.fillStyle = 'rgba(29, 78, 216, 0.28)';
      for (let y = Math.max(v.y0, sel.y0); y < Math.min(v.y1, sel.y1); y++) {
        for (let x = Math.max(v.x0, sel.x0); x < Math.min(v.x1, sel.x1); x++) {
          if (!ov.selectionMask[y * p.width + x]) continue;
          const [sx, sy] = vp.toScreen(x, y);
          ctx.fillRect(sx, sy, s, s);
        }
      }
    }
    if (ov.path && ov.path.length > 1) {
      ctx.beginPath();
      ov.path.forEach(([x, y], i) => {
        const [sx, sy] = vp.toScreen(x, y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#1d4ed8';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (ov.selection) {
      const [x0, y0] = vp.toScreen(ov.selection.x0, ov.selection.y0);
      const [x1, y1] = vp.toScreen(ov.selection.x1, ov.selection.y1);
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.lineDashOffset = 5;
      ctx.strokeStyle = '#1d4ed8';
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
    if (ov.line) {
      const [x1, y1] = vp.toScreen(ov.line.x1 / 2, ov.line.y1 / 2);
      const [x2, y2] = vp.toScreen(ov.line.x2 / 2, ov.line.y2 / 2);
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = ov.line.color;
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (ov.point) {
      const [x, y] = vp.toScreen(ov.point.x / 2, ov.point.y / 2);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(3, s * 0.15), 0, Math.PI * 2);
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (ov.cursor && s >= 4) {
      const [sx, sy] = vp.toScreen(ov.cursor.x, ov.cursor.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1d4ed8';
      ctx.strokeRect(sx, sy, s, s);
    }
  }

  private drawRulers(ctx: CanvasRenderingContext2D, vp: Viewport, o: RenderOptions): void {
    const p = this.pattern;
    const s = vp.scale;
    ctx.fillStyle = o.background;
    ctx.globalAlpha = 0.94;
    ctx.fillRect(0, 0, vp.width, RULER);
    ctx.fillRect(0, 0, RULER, vp.height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(80, 70, 65, 0.95)';
    ctx.font = '10px system-ui, sans-serif';
    const step = s >= 12 ? 5 : s >= 3 ? 10 : s >= 1 ? 50 : 100;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let x = 0; x <= p.width; x += step) {
      const sx = vp.ox + x * s;
      if (sx < RULER || sx > vp.width) continue;
      ctx.fillRect(sx, RULER - (x % 10 === 0 ? 7 : 4), 1, x % 10 === 0 ? 7 : 4);
      if (x % 10 === 0 || step === 5) ctx.fillText(String(x), sx, 8);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y <= p.height; y += step) {
      const sy = vp.oy + y * s;
      if (sy < RULER || sy > vp.height) continue;
      ctx.fillRect(RULER - (y % 10 === 0 ? 7 : 4), sy, y % 10 === 0 ? 7 : 4, 1);
      if (y % 10 === 0 || step === 5) ctx.fillText(String(y), RULER - 8, sy);
    }
    if (o.overlay?.cursor) {
      const { x, y } = o.overlay.cursor;
      ctx.fillStyle = 'rgba(29, 78, 216, 0.35)';
      ctx.fillRect(vp.ox + x * s, 0, s, RULER);
      ctx.fillRect(0, vp.oy + y * s, RULER, s);
    }
  }
}

function swatchOf(e: PaletteEntry): Swatch {
  const rgb = entryRgb(e);
  return {
    rgb,
    css: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
    ink: relativeLuminance(rgb) > 0.3 ? 'black' : 'white',
  };
}

function centroid(s: PartialStitch): [number, number] {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const arm of [ARM.TL, ARM.TR, ARM.BL, ARM.BR]) {
    if (s.mask & arm) {
      x += QUADRANT[arm][0] * 0.5 + 0.25;
      y += QUADRANT[arm][1] * 0.5 + 0.25;
      n++;
    }
  }
  return n ? [x / n, y / n] : [0.5, 0.5];
}

function strokeArms(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  s: number,
  st: PartialStitch,
): void {
  ctx.beginPath();
  for (const arm of [ARM.TL, ARM.TR, ARM.BL, ARM.BR]) {
    if (!(st.mask & arm)) continue;
    const [qx, qy] = QUADRANT[arm];
    ctx.moveTo(sx + s / 2, sy + s / 2);
    ctx.lineTo(sx + qx * s, sy + qy * s);
  }
  ctx.stroke();
}

function fullRectOf(p: Pattern): CellRect {
  return { x0: 0, y0: 0, x1: p.width, y1: p.height };
}

function ctx2d(c: ReturnType<typeof makeCanvas>): CanvasRenderingContext2D {
  return c.getContext('2d') as CanvasRenderingContext2D;
}
