import type { Pattern } from '../core/model/pattern.ts';
import { finishedSize, type SizeMm } from '../core/size/fabric.ts';
import { RealisticPainter, type RealisticStyle } from './realistic.ts';
import { makeCanvas } from './symbolAtlas.ts';

type AnyCanvas = ReturnType<typeof makeCanvas>;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** The whole pattern stitched, at about `maxSide` pixels on its longest side. */
export function stitchedImage(
  pattern: Pattern,
  style: RealisticStyle,
  maxSide: number,
): { canvas: AnyCanvas; px: number } {
  const px = Math.max(
    2,
    Math.min(24, Math.floor(maxSide / Math.max(pattern.width, pattern.height))),
  );
  const painter = new RealisticPainter(pattern, style);
  const canvas = painter.renderRegion({ x0: 0, y0: 0, x1: pattern.width, y1: pattern.height }, px);
  return { canvas, px };
}

/**
 * Framed mockup: the stitched piece on its fabric, a mat around it and a wooden frame, on a wall.
 * `frameMm` is the outer size of the opening (the standard frame size).
 */
export function frameMockup(
  pattern: Pattern,
  style: RealisticStyle,
  frameMm: SizeMm,
  size = 900,
): AnyCanvas {
  const design = finishedSize(pattern.width, pattern.height, style.fabric);
  const border = Math.max(frameMm.widthMm, frameMm.heightMm) * 0.07;
  const totalW = frameMm.widthMm + 2 * border;
  const totalH = frameMm.heightMm + 2 * border;
  const k = (size * 0.8) / Math.max(totalW, totalH); // px per mm
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d') as Ctx;
  wall(ctx, size);
  const fx = (size - totalW * k) / 2;
  const fy = (size - totalH * k) / 2;
  // Shadow, frame, fabric showing through the opening, stitched design.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.03;
  ctx.shadowOffsetY = size * 0.012;
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(fx, fy, totalW * k, totalH * k);
  ctx.restore();
  woodFrame(ctx, fx, fy, totalW * k, totalH * k, border * k);
  const ox = fx + border * k;
  const oy = fy + border * k;
  ctx.fillStyle = style.fabric.color;
  ctx.fillRect(ox, oy, frameMm.widthMm * k, frameMm.heightMm * k);
  const { canvas: art } = stitchedImage(pattern, style, Math.min(1600, design.widthMm * k * 2));
  const dx = ox + ((frameMm.widthMm - design.widthMm) / 2) * k;
  const dy = oy + ((frameMm.heightMm - design.heightMm) / 2) * k;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art as CanvasImageSource, dx, dy, design.widthMm * k, design.heightMm * k);
  // Inner shadow of the frame on the fabric.
  const g = ctx.createLinearGradient(0, oy, 0, oy + border * k * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ox, oy, frameMm.widthMm * k, border * k * 0.5);
  return canvas;
}

/** Hoop mockup: a round piece of fabric in a wooden embroidery hoop of `diameterMm`. */
export function hoopMockup(
  pattern: Pattern,
  style: RealisticStyle,
  diameterMm: number,
  size = 900,
): AnyCanvas {
  const design = finishedSize(pattern.width, pattern.height, style.fabric);
  const ring = diameterMm * 0.06;
  const k = (size * 0.8) / (diameterMm + 2 * ring);
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d') as Ctx;
  wall(ctx, size);
  const c = size / 2;
  const r = (diameterMm / 2) * k;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = size * 0.03;
  ctx.shadowOffsetY = size * 0.012;
  ctx.beginPath();
  ctx.arc(c, c, r + ring * k, 0, Math.PI * 2);
  ctx.fillStyle = '#c99a63';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = style.fabric.color;
  ctx.fillRect(0, 0, size, size);
  const { canvas: art } = stitchedImage(pattern, style, Math.min(1600, design.widthMm * k * 2));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    art as CanvasImageSource,
    c - (design.widthMm / 2) * k,
    c - (design.heightMm / 2) * k,
    design.widthMm * k,
    design.heightMm * k,
  );
  const shade = ctx.createRadialGradient(c, c, r * 0.75, c, c, r);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  // Wooden ring with a highlight.
  ctx.lineWidth = ring * k;
  const wood = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
  wood.addColorStop(0, '#e2b57f');
  wood.addColorStop(0.5, '#c4904f');
  wood.addColorStop(1, '#a8743c');
  ctx.strokeStyle = wood;
  ctx.beginPath();
  ctx.arc(c, c, r + (ring * k) / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#9c6a36';
  ctx.fillRect(c - ring * k * 0.6, c - r - ring * k * 2.1, ring * k * 1.2, ring * k * 1.4);
  return canvas;
}

function wall(ctx: Ctx, size: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#ece7e0');
  g.addColorStop(1, '#ddd5ca');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

function woodFrame(ctx: Ctx, x: number, y: number, w: number, h: number, b: number): void {
  const sides: [number, number, number, number, string][] = [
    [x, y, w, b, '#8a6440'],
    [x, y + h - b, w, b, '#5c3f26'],
    [x, y, b, h, '#7a5636'],
    [x + w - b, y, b, h, '#684828'],
  ];
  for (const [sx, sy, sw, sh, col] of sides) {
    ctx.fillStyle = col;
    ctx.fillRect(sx, sy, sw, sh);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, b * 0.08);
  ctx.strokeRect(x + b * 0.15, y + b * 0.15, w - b * 0.3, h - b * 0.3);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.strokeRect(x + b - 1, y + b - 1, w - 2 * b + 2, h - 2 * b + 2);
}
