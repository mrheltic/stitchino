import { hexToRgb, type Rgb } from '../core/color/srgb.ts';
import type { PaletteEntry } from '../core/model/pattern.ts';
import { entryRgb } from '../core/model/entryColor.ts';

export { entryRgb };

export function paintCells(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
  cells: Uint16Array,
  palette: readonly PaletteEntry[],
  fabricColor: string,
): void {
  const lut = new Map<number, Rgb>(palette.map((p) => [p.id, entryRgb(p)]));
  const bg = hexToRgb(fabricColor);
  const img = ctx.createImageData(width, height);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i] ? (lut.get(cells[i]) ?? bg) : bg;
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

/** Small PNG of the pattern for project lists. */
export async function patternThumbnail(
  width: number,
  height: number,
  cells: Uint16Array,
  palette: readonly PaletteEntry[],
  fabricColor: string,
  maxSide = 320,
): Promise<Blob | undefined> {
  if (typeof OffscreenCanvas === 'undefined') return undefined;
  const src = new OffscreenCanvas(width, height);
  const sctx = src.getContext('2d');
  if (!sctx) return undefined;
  paintCells(sctx, width, height, cells, palette, fabricColor);
  const scale = Math.max(1, Math.floor(maxSide / Math.max(width, height)));
  const out = new OffscreenCanvas(width * scale, height * scale);
  const octx = out.getContext('2d');
  if (!octx) return undefined;
  octx.imageSmoothingEnabled = false;
  octx.drawImage(src, 0, 0, width * scale, height * scale);
  return out.convertToBlob({ type: 'image/png' });
}
