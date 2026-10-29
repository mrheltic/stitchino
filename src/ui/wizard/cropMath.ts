import type { Crop } from './image.ts';

export type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const MIN = 0.05;

/**
 * Moves or resizes a crop by (dx, dy) in fractions of the image; `r` is the required w/h ratio in
 * fractions (null = free). The result stays inside the image.
 */
export function resizeCrop(
  c: Crop,
  handle: CropHandle,
  dx: number,
  dy: number,
  r: number | null,
): Crop {
  if (handle === 'move') {
    return { ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) };
  }
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  // The corner opposite to the dragged one stays put.
  const fx = west ? c.x + c.w : c.x;
  const fy = north ? c.y + c.h : c.y;
  const maxW = west ? fx : 1 - fx;
  const maxH = north ? fy : 1 - fy;
  let w = clamp(west ? c.w - dx : c.w + dx, MIN, maxW);
  let h = clamp(north ? c.h - dy : c.h + dy, MIN, maxH);
  if (r !== null) {
    if (w / r > h) h = w / r;
    else w = h * r;
    if (w > maxW) {
      w = maxW;
      h = w / r;
    }
    if (h > maxH) {
      h = maxH;
      w = h * r;
    }
  }
  return { x: west ? fx - w : fx, y: north ? fy - h : fy, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
