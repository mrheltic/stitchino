/** Maps pattern cells to canvas (CSS pixel) coordinates: screen = offset + cell * scale. */
export class Viewport {
  /** CSS pixels per cell. */
  scale = 10;
  ox = 0;
  oy = 0;
  width = 0;
  height = 0;
  dpr = 1;
  minScale = 0.25;
  maxScale = 96;

  setSize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  /** Fits `cols × rows` cells in the canvas with a margin, centred. */
  fit(cols: number, rows: number, margin = 24): void {
    const s = Math.min((this.width - 2 * margin) / cols, (this.height - 2 * margin) / rows);
    this.scale = clamp(s, this.minScale, this.maxScale);
    this.ox = (this.width - cols * this.scale) / 2;
    this.oy = (this.height - rows * this.scale) / 2;
  }

  toCell(px: number, py: number): [number, number] {
    return [(px - this.ox) / this.scale, (py - this.oy) / this.scale];
  }

  toScreen(cx: number, cy: number): [number, number] {
    return [this.ox + cx * this.scale, this.oy + cy * this.scale];
  }

  zoomAt(px: number, py: number, factor: number): void {
    const next = clamp(this.scale * factor, this.minScale, this.maxScale);
    const [cx, cy] = this.toCell(px, py);
    this.scale = next;
    this.ox = px - cx * next;
    this.oy = py - cy * next;
  }

  pan(dx: number, dy: number): void {
    this.ox += dx;
    this.oy += dy;
  }

  /** Keeps at least `keep` CSS pixels of the pattern inside the canvas. */
  clamp(cols: number, rows: number, keep = 48): void {
    const w = cols * this.scale;
    const h = rows * this.scale;
    this.ox = clamp(this.ox, keep - w, this.width - keep);
    this.oy = clamp(this.oy, keep - h, this.height - keep);
  }

  /** Integer cell range visible in the canvas, clipped to the pattern. */
  visible(cols: number, rows: number): { x0: number; y0: number; x1: number; y1: number } {
    const [ax, ay] = this.toCell(0, 0);
    const [bx, by] = this.toCell(this.width, this.height);
    return {
      x0: Math.max(0, Math.floor(ax)),
      y0: Math.max(0, Math.floor(ay)),
      x1: Math.min(cols, Math.ceil(bx)),
      y1: Math.min(rows, Math.ceil(by)),
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
