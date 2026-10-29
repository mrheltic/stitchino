import type { RasterImage } from '../../core/convert/raster.ts';

export type Rotation = 0 | 90 | 180 | 270;

/** Crop rectangle in the rotated/flipped image, as fractions of its width and height. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Orientation {
  rotation: Rotation;
  flip: boolean;
}

export const FULL_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };

/** Longest side of the image handed to the converter: plenty for patterns up to ~500 stitches. */
export const WORKING_MAX_SIDE = 1400;

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function orientedSize(
  bitmap: { width: number; height: number },
  rotation: Rotation,
): [number, number] {
  return rotation % 180 === 0 ? [bitmap.width, bitmap.height] : [bitmap.height, bitmap.width];
}

/** Pixel size of the crop in the oriented image. */
export function cropPixels(
  bitmap: { width: number; height: number },
  o: Orientation,
  crop: Crop,
): [number, number] {
  const [w, h] = orientedSize(bitmap, o.rotation);
  return [crop.w * w, crop.h * h];
}

/**
 * Draws the cropped, rotated and flipped image at most `maxSide` pixels on its longest side
 * (never upscaled) and returns its pixels.
 */
export function renderRaster(
  bitmap: ImageBitmap,
  o: Orientation,
  crop: Crop,
  maxSide: number,
): RasterImage {
  const canvas = drawOriented(bitmap, o, crop, maxSide);
  const ctx = canvas.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return { width: canvas.width, height: canvas.height, data };
}

export function drawOriented(
  bitmap: ImageBitmap,
  o: Orientation,
  crop: Crop,
  maxSide: number,
): OffscreenCanvas | HTMLCanvasElement {
  const W = bitmap.width;
  const H = bitmap.height;
  const [Wo, Ho] = orientedSize(bitmap, o.rotation);
  const X0 = crop.x * Wo;
  const Y0 = crop.y * Ho;
  const CW = crop.w * Wo;
  const CH = crop.h * Ho;
  const s = Math.min(1, maxSide / Math.max(CW, CH));
  const outW = Math.max(1, Math.round(CW * s));
  const outH = Math.max(1, Math.round(CH * s));
  const canvas = makeCanvas(outW, outH);
  const ctx = canvas.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // output = scale · translate(-crop) · flip · rotate · source
  let m = new DOMMatrix().scale(s, s).translate(-X0, -Y0);
  if (o.flip) m = m.translate(Wo, 0).scale(-1, 1);
  const rot = {
    0: new DOMMatrix([1, 0, 0, 1, 0, 0]),
    90: new DOMMatrix([0, 1, -1, 0, H, 0]),
    180: new DOMMatrix([-1, 0, 0, -1, W, H]),
    270: new DOMMatrix([0, -1, 1, 0, 0, W]),
  }[o.rotation];
  ctx.setTransform(m.multiply(rot));
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export async function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  );
}
