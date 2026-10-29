import { useEffect, useRef } from 'react';
import type { PaletteEntry } from '../../core/model/pattern.ts';
import { paintCells } from '../patternPaint.ts';

/** Pattern as colour blocks, one canvas pixel per stitch, scaled up without smoothing. */
export function PatternCanvas({
  width,
  height,
  cells,
  palette,
  fabricColor,
  className = '',
  label,
  fit = false,
}: {
  width: number;
  height: number;
  cells: Uint16Array;
  palette: readonly PaletteEntry[];
  fabricColor: string;
  className?: string;
  label?: string;
  /** Fill the width, but no taller than the preview height (--preview-h). */
  fit?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || cells.length !== width * height) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) paintCells(ctx, width, height, cells, palette, fabricColor);
  }, [width, height, cells, palette, fabricColor]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={label}
      className={className}
      style={{
        imageRendering: 'pixelated',
        aspectRatio: `${width} / ${height}`,
        width: fit ? `min(100%, calc(var(--preview-h) * ${width / height}))` : undefined,
      }}
    />
  );
}
