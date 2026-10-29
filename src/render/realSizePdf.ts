import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { APP_NAME } from '../core/brand.ts';
import type { Pattern } from '../core/model/pattern.ts';
import { cellSizeMm, stitchesPerInch } from '../core/size/fabric.ts';
import { RealisticPainter, type RealisticStyle } from './realistic.ts';

export type Paper = 'a4' | 'letter';

export const PAPER_MM: Record<Paper, [number, number]> = { a4: [210, 297], letter: [215.9, 279.4] };
const PT = 72 / 25.4;
const MARGIN = 10;
const HEADER = 14;
const FOOTER = 18;

export interface RealSizeLabels {
  title: string;
  page: (n: number, total: number) => string;
  cells: (x0: number, x1: number, y0: number, y1: number) => string;
  ruler: string;
  instructions: string;
}

export interface RealSizeLayout {
  landscape: boolean;
  cols: number;
  rows: number;
  /** Cells per page horizontally and vertically. */
  cellsX: number;
  cellsY: number;
}

/** Page grid for printing the pattern at real size, choosing the orientation with fewer pages. */
export function realSizeLayout(
  pattern: Pattern,
  style: RealisticStyle,
  paper: Paper,
): RealSizeLayout {
  const cell = cellSizeMm(style.fabric);
  const options = [false, true].map((landscape) => {
    const [w, h] = landscape ? [PAPER_MM[paper][1], PAPER_MM[paper][0]] : PAPER_MM[paper];
    const cellsX = Math.max(1, Math.floor((w - 2 * MARGIN) / cell));
    const cellsY = Math.max(1, Math.floor((h - 2 * MARGIN - HEADER - FOOTER) / cell));
    return {
      landscape,
      cellsX,
      cellsY,
      cols: Math.ceil(pattern.width / cellsX),
      rows: Math.ceil(pattern.height / cellsY),
    };
  });
  return options.sort((a, b) => a.cols * a.rows - b.cols * b.rows)[0];
}

/**
 * PDF of the stitched preview at exact physical size, split over as many pages as needed, with
 * a 5 cm control ruler on every page so the print scale can be checked.
 */
export async function realSizePdf(
  pattern: Pattern,
  style: RealisticStyle,
  paper: Paper,
  labels: RealSizeLabels,
  dpi = 200,
): Promise<Uint8Array> {
  const layout = realSizeLayout(pattern, style, paper);
  const cell = cellSizeMm(style.fabric);
  const px = Math.max(4, Math.round(dpi / stitchesPerInch(style.fabric)));
  const [pw, ph] = layout.landscape ? [PAPER_MM[paper][1], PAPER_MM[paper][0]] : PAPER_MM[paper];
  const painter = new RealisticPainter(pattern, style);
  const pdf = await PDFDocument.create();
  pdf.setTitle(labels.title);
  pdf.setCreator(APP_NAME);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const total = layout.cols * layout.rows;
  let n = 0;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      n++;
      const x0 = col * layout.cellsX;
      const y0 = row * layout.cellsY;
      const x1 = Math.min(pattern.width, x0 + layout.cellsX);
      const y1 = Math.min(pattern.height, y0 + layout.cellsY);
      const canvas = painter.renderRegion({ x0, y0, x1, y1 }, px);
      const blob = await toJpeg(canvas);
      const image = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const page = pdf.addPage([pw * PT, ph * PT]);
      const wMm = (x1 - x0) * cell;
      const hMm = (y1 - y0) * cell;
      const left = MARGIN;
      const top = MARGIN + HEADER;
      page.drawImage(image, {
        x: left * PT,
        y: (ph - top - hMm) * PT,
        width: wMm * PT,
        height: hMm * PT,
      });
      cropMarks(page, left, top, wMm, hMm, ph);
      page.drawText(labels.title, {
        x: MARGIN * PT,
        y: (ph - MARGIN - 5) * PT,
        size: 11,
        font: bold,
        color: rgb(0.15, 0.12, 0.1),
      });
      const info = `${labels.page(n, total)} · ${labels.cells(x0 + 1, x1, y0 + 1, y1)}`;
      page.drawText(info, {
        x: MARGIN * PT,
        y: (ph - MARGIN - 10.5) * PT,
        size: 8.5,
        font,
        color: rgb(0.35, 0.32, 0.3),
      });
      ruler(page, font, labels, ph, pw);
    }
  }
  return pdf.save();
}

async function toJpeg(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.9),
  );
}

function cropMarks(page: PDFPage, x: number, y: number, w: number, h: number, ph: number): void {
  const len = 4;
  const gap = 1.5;
  const color = rgb(0.3, 0.3, 0.3);
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    page.drawLine({
      start: { x: x1 * PT, y: (ph - y1) * PT },
      end: { x: x2 * PT, y: (ph - y2) * PT },
      thickness: 0.4,
      color,
    });
  for (const [cx, cy, sx, sy] of [
    [x, y, -1, -1],
    [x + w, y, 1, -1],
    [x, y + h, -1, 1],
    [x + w, y + h, 1, 1],
  ] as const) {
    line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
    line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
  }
}

function ruler(page: PDFPage, font: PDFFont, labels: RealSizeLabels, ph: number, pw: number): void {
  const x0 = MARGIN;
  const y = ph - MARGIN - 9;
  const color = rgb(0.1, 0.1, 0.1);
  page.drawLine({
    start: { x: x0 * PT, y: (ph - y) * PT },
    end: { x: (x0 + 50) * PT, y: (ph - y) * PT },
    thickness: 0.8,
    color,
  });
  for (let mm = 0; mm <= 50; mm += 5) {
    const tick = mm % 10 === 0 ? 3 : 1.6;
    page.drawLine({
      start: { x: (x0 + mm) * PT, y: (ph - y) * PT },
      end: { x: (x0 + mm) * PT, y: (ph - y + tick) * PT },
      thickness: 0.6,
      color,
    });
  }
  page.drawText('0', { x: (x0 - 0.8) * PT, y: (ph - y - 4) * PT, size: 7, font, color });
  page.drawText('5 cm', { x: (x0 + 47) * PT, y: (ph - y - 4) * PT, size: 7, font, color });
  page.drawText(labels.ruler, {
    x: (x0 + 56) * PT,
    y: (ph - y + 0.6) * PT,
    size: 7.5,
    font,
    color,
    maxWidth: (pw - x0 - 66) * PT,
  });
  page.drawText(labels.instructions, {
    x: (x0 + 56) * PT,
    y: (ph - y - 3.6) * PT,
    size: 7.5,
    font,
    color: rgb(0.35, 0.32, 0.3),
    maxWidth: (pw - x0 - 66) * PT,
  });
}
