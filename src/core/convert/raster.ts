/** RGBA image with 8-bit channels, row-major (same layout as ImageData). */
export interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function createRaster(width: number, height: number): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

export function cloneRaster(img: RasterImage): RasterImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
}

/** Fills a raster from a callback returning [r, g, b] or [r, g, b, a]. */
export function rasterFrom(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly number[],
): RasterImage {
  const img = createRaster(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixel(x, y);
      img.data.set([r, g, b, a], (y * width + x) * 4);
    }
  }
  return img;
}
