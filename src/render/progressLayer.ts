import { hexToRgb, type Rgb } from '../core/color/srgb.ts';
import { ARM, type Pattern } from '../core/model/pattern.ts';
import { bitAt, type ProgressData } from '../core/progress/tracker.ts';
import { makeCanvas } from './symbolAtlas.ts';

const ALPHA = 175;
const QUADRANTS: [number, number, number][] = [
  [ARM.TL, 0, 0],
  [ARM.TR, 1, 0],
  [ARM.BL, 0, 1],
  [ARM.BR, 1, 1],
];

/**
 * Done stitches as a translucent highlighter layer, two pixels per cell (one per quarter, so
 * partial stitches show exactly), drawn by the chart renderer over the colours.
 */
export class ProgressLayer {
  readonly canvas: ReturnType<typeof makeCanvas>;
  /** Pixels per cell, for RenderOptions.layer. */
  readonly scale = 2;
  private pattern: Pattern;
  private data: ProgressData;
  private rgb: Rgb;

  constructor(pattern: Pattern, data: ProgressData, color: string) {
    this.pattern = pattern;
    this.data = data;
    this.rgb = hexToRgb(color);
    this.canvas = makeCanvas(pattern.width * 2, pattern.height * 2);
    this.paintAll();
  }

  setColor(color: string): void {
    this.rgb = hexToRgb(color);
    this.paintAll();
  }

  paintAll(): void {
    this.paintRect(0, 0, this.pattern.width, this.pattern.height);
  }

  /** Repaints the bounding box of the given cells. */
  paintCells(cells: readonly number[]): void {
    if (!cells.length) return;
    const w = this.pattern.width;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (const i of cells) {
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    this.paintRect(x0, y0, x1 + 1, y1 + 1);
  }

  private paintRect(x0: number, y0: number, x1: number, y1: number): void {
    const { width, cells, partials } = this.pattern;
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return;
    const ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    const img = ctx.createImageData(w * 2, h * 2);
    const d = img.data;
    const [r, g, b] = this.rgb;
    const put = (qx: number, qy: number) => {
      const o = (qy * w * 2 + qx) * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = ALPHA;
    };
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * width + x;
        const lx = (x - x0) * 2;
        const ly = (y - y0) * 2;
        if (cells[i]) {
          if (!bitAt(this.data.bits, i)) continue;
          put(lx, ly);
          put(lx + 1, ly);
          put(lx, ly + 1);
          put(lx + 1, ly + 1);
          continue;
        }
        const arms = this.data.partials.get(i);
        if (!arms || !partials.has(i)) continue;
        for (const [arm, qx, qy] of QUADRANTS) if (arms & arm) put(lx + qx, ly + qy);
      }
    }
    ctx.putImageData(img, x0 * 2, y0 * 2);
  }
}
