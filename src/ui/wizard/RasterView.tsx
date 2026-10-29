import { useEffect, useRef, type MouseEvent } from 'react';
import type { RasterImage } from '../../core/convert/raster.ts';

/**
 * Shows a raster; masked pixels (background that will not be stitched) are drawn as a light
 * checkerboard. When `onPick` is set, clicks report the position as fractions of the image.
 */
export function RasterView({
  image,
  mask,
  onPick,
  label,
}: {
  image: RasterImage;
  mask?: Uint8Array;
  onPick?: (fx: number, fy: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
    if (mask) {
      const d = out.data;
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i]) continue;
        const x = i % image.width;
        const y = (i - x) / image.width;
        const light = ((x >> 3) + (y >> 3)) % 2 === 0 ? 255 : 225;
        d[i * 4] = d[i * 4] * 0.25 + light * 0.75;
        d[i * 4 + 1] = d[i * 4 + 1] * 0.25 + light * 0.75;
        d[i * 4 + 2] = d[i * 4 + 2] * 0.25 + light * 0.75;
      }
    }
    ctx.putImageData(out, 0, 0);
  }, [image, mask]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    onPick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      onClick={onClick}
      className={`mx-auto block h-auto rounded-lg ${onPick ? 'cursor-crosshair' : ''}`}
      style={{ width: `min(100%, calc(var(--preview-h) * ${image.width / image.height}))` }}
    />
  );
}
