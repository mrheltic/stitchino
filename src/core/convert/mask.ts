/**
 * A brush stroke on the background mask, in fractions of the picture so it survives a change of
 * resolution. "remove" paints background (left as bare fabric), "keep" gives it back to the subject.
 */
export interface MaskStroke {
  mode: 'keep' | 'remove';
  /** Radius as a fraction of the picture's width. */
  size: number;
  points: [number, number][];
}

/** Paints a stroke into a background mask (1 = background) of `w` × `h` pixels. */
export function paintStroke(mask: Uint8Array, w: number, h: number, stroke: MaskStroke): void {
  const r = Math.max(1, stroke.size * w);
  const r2 = r * r;
  const value = stroke.mode === 'remove' ? 1 : 0;
  const dab = (cx: number, cy: number) => {
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(h - 1, Math.ceil(cy + r));
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(w - 1, Math.ceil(cx + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) mask[y * w + x] = value;
      }
    }
  };
  const pts = stroke.points.map(([fx, fy]) => [fx * w, fy * h] as const);
  if (pts.length === 1) dab(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (r / 2)));
    for (let s = 0; s <= steps; s++)
      dab(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
  }
}

/** Keeps only well-formed strokes from saved settings, clamped to the picture. */
export function sanitizeStrokes(raw: unknown): MaskStroke[] {
  if (!Array.isArray(raw)) return [];
  const unit = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null;
  const out: MaskStroke[] = [];
  for (const s of raw.slice(0, 300)) {
    if (!s || typeof s !== 'object') continue;
    const r = s as Record<string, unknown>;
    if (r.mode !== 'keep' && r.mode !== 'remove') continue;
    const size = unit(r.size);
    if (size === null || !Array.isArray(r.points)) continue;
    const points: [number, number][] = [];
    for (const p of r.points.slice(0, 2000)) {
      if (!Array.isArray(p)) continue;
      const x = unit(p[0]);
      const y = unit(p[1]);
      if (x !== null && y !== null) points.push([x, y]);
    }
    if (points.length)
      out.push({ mode: r.mode, size: Math.max(0.002, Math.min(0.3, size)), points });
  }
  return out;
}
