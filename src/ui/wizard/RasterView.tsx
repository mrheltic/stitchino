import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import type { MaskStroke } from '../../core/convert/mask.ts';
import type { RasterImage } from '../../core/convert/raster.ts';

/**
 * Shows a raster; masked pixels (background that will not be stitched) are drawn as a light
 * checkerboard. When `onPick` is set, clicks report the position as fractions of the image; with
 * `brush`, dragging paints a stroke that is reported when the pointer is lifted.
 */
export function RasterView({
  image,
  mask,
  onPick,
  brush,
  onStroke,
  label,
}: {
  image: RasterImage;
  mask?: Uint8Array;
  onPick?: (fx: number, fy: number) => void;
  brush?: { mode: MaskStroke['mode']; size: number };
  onStroke?: (stroke: MaskStroke) => void;
  label: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<[number, number][] | null>(null);

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

  const at = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, Math.round(v * 10000) / 10000));
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)];
  };

  /** Paints the stroke so far over the picture, until the new mask arrives. */
  const dab = (p: [number, number]) => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx || !brush) return;
    ctx.fillStyle = brush.mode === 'keep' ? 'rgba(46, 160, 67, 0.45)' : 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(p[0] * image.width, p[1] * image.height, brush.size * image.width, 0, Math.PI * 2);
    ctx.fill();
  };

  const brushHandlers = brush && {
    onPointerDown: (e: PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = at(e);
      stroke.current = [p];
      dab(p);
    },
    onPointerMove: (e: PointerEvent<HTMLCanvasElement>) => {
      if (!stroke.current) return;
      const p = at(e);
      const last = stroke.current[stroke.current.length - 1];
      // Skip points closer than a fifth of the brush: the stroke stays small.
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < brush.size / 5) return;
      stroke.current.push(p);
      dab(p);
    },
    onPointerUp: () => {
      const points = stroke.current;
      stroke.current = null;
      if (points?.length && onStroke) onStroke({ mode: brush.mode, size: brush.size, points });
    },
    onPointerCancel: () => {
      stroke.current = null;
    },
  };

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      onClick={onClick}
      {...brushHandlers}
      className={`mx-auto block h-auto rounded-lg ${onPick || brush ? 'cursor-crosshair' : ''}`}
      style={{
        width: `min(100%, calc(var(--preview-h) * ${image.width / image.height}))`,
        touchAction: brush ? 'none' : undefined,
      }}
    />
  );
}
