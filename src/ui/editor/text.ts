import type { CellState } from '../../core/model/document.ts';
import type { Clip } from '../../core/model/ops.ts';

const SUPERSAMPLE = 6;

/**
 * Rasterises text into stitches: rendered at SUPERSAMPLE× resolution and kept where at least
 * half of a cell is covered. `height` is the capital-letter height in stitches.
 */
export function textClip(
  text: string,
  font: string,
  height: number,
  bold: boolean,
  id: number,
): Clip {
  const lines = text.split('\n');
  const px = height * SUPERSAMPLE;
  const fontSize = px / 0.72; // cap height is about 72% of the font size
  const fontSpec = `${bold ? 'bold ' : ''}${fontSize}px ${font}`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontSpec;
  const lineHeight = Math.round(fontSize * 1.15);
  const widths = lines.map((l) => measure.measureText(l || ' ').width);
  const w = Math.max(1, Math.ceil(Math.max(...widths) + fontSize * 0.1));
  const h = Math.max(1, Math.ceil(lineHeight * lines.length));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.font = fontSpec;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, fontSize * 0.05, i * lineHeight + fontSize * 0.92));
  const data = ctx.getImageData(0, 0, w, h).data;

  const cols = Math.ceil(w / SUPERSAMPLE);
  const rows = Math.ceil(h / SUPERSAMPLE);
  const cover = new Float32Array(cols * rows);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      cover[Math.floor(y / SUPERSAMPLE) * cols + Math.floor(x / SUPERSAMPLE)] +=
        data[(y * w + x) * 4 + 3] / 255;
    }
  }
  const cells = new Map<number, CellState>();
  let minX = cols;
  let minY = rows;
  let maxX = -1;
  let maxY = -1;
  const threshold = (SUPERSAMPLE * SUPERSAMPLE) / 2;
  for (let i = 0; i < cover.length; i++) {
    if (cover[i] < threshold) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0) return { width: 1, height: 1, cells, backstitches: [], knots: [] };
  const cw = maxX - minX + 1;
  for (let i = 0; i < cover.length; i++) {
    if (cover[i] < threshold) continue;
    const x = (i % cols) - minX;
    const y = Math.floor(i / cols) - minY;
    cells.set(y * cw + x, { full: id });
  }
  return { width: cw, height: maxY - minY + 1, cells, backstitches: [], knots: [] };
}
