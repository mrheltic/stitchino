import { rgbToOklab } from '../../core/color/oklab.ts';
import type { RasterImage } from '../../core/convert/raster.ts';

/**
 * Selects the 4-connected region around (x, y) whose colours are within `tolerance` (OKLab
 * distance, about 0..0.3) of the clicked colour, adding it to `into`.
 */
export function floodSelect(
  img: RasterImage,
  x: number,
  y: number,
  tolerance: number,
  into?: Uint8Array,
): Uint8Array {
  const { width: w, height: h, data } = img;
  const mask = into ?? new Uint8Array(w * h);
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return mask;
  const seed = rgbToOklab([
    data[(y * w + x) * 4],
    data[(y * w + x) * 4 + 1],
    data[(y * w + x) * 4 + 2],
  ]);
  const tol2 = tolerance * tolerance;
  const visited = new Uint8Array(w * h);
  const stack = [y * w + x];
  visited[y * w + x] = 1;
  const okCache = new Map<number, number>();
  const distance2 = (i: number) => {
    const key = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
    let d = okCache.get(key);
    if (d === undefined) {
      const c = rgbToOklab([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
      d = (c[0] - seed[0]) ** 2 + (c[1] - seed[1]) ** 2 + (c[2] - seed[2]) ** 2;
      okCache.set(key, d);
    }
    return d;
  };
  while (stack.length) {
    const i = stack.pop()!;
    if (data[i * 4 + 3] > 0 && distance2(i) > tol2) continue;
    mask[i] = 1;
    const px = i % w;
    const py = (i - px) / w;
    for (const j of [
      px > 0 ? i - 1 : -1,
      px < w - 1 ? i + 1 : -1,
      py > 0 ? i - w : -1,
      py < h - 1 ? i + w : -1,
    ]) {
      if (j >= 0 && !visited[j]) {
        visited[j] = 1;
        stack.push(j);
      }
    }
  }
  return mask;
}
