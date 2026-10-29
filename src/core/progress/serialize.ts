import { itemKey } from '../model/document.ts';
import type { Pattern } from '../model/pattern.ts';
import {
  bitAt,
  emptyProgress,
  type ParkMark,
  type ProgressData,
  type ViewMark,
} from './tracker.ts';

/** Marks other than full stitches, stored next to the bitset. */
export interface ProgressExtras {
  v: 1;
  width: number;
  height: number;
  partials: [number, number][];
  backstitches: string[];
  knots: string[];
  parked: ParkMark[];
  view?: ViewMark;
}

export interface StoredProgress {
  bits: Uint8Array;
  daily: Record<string, number>;
  extras?: unknown;
}

export function progressExtras(d: ProgressData): ProgressExtras {
  return {
    v: 1,
    width: d.width,
    height: d.height,
    partials: [...d.partials.entries()],
    backstitches: [...d.backstitches],
    knots: [...d.knots],
    parked: d.parked.map((m) => ({ ...m })),
    view: d.view && { ...d.view },
  };
}

function isExtras(x: unknown): x is ProgressExtras {
  const e = x as ProgressExtras | null;
  return (
    !!e &&
    e.v === 1 &&
    Number.isInteger(e.width) &&
    Number.isInteger(e.height) &&
    Array.isArray(e.partials) &&
    Array.isArray(e.backstitches) &&
    Array.isArray(e.knots) &&
    Array.isArray(e.parked)
  );
}

/**
 * Progress for the pattern as it is now. Marks that no longer match a stitch (the pattern was
 * edited after stitching began) are dropped; if the size changed, progress starts over
 * (`reset`), since positions no longer line up.
 */
export function restoreProgress(
  p: Pattern,
  stored?: StoredProgress,
): { data: ProgressData; reset: boolean } {
  const data = emptyProgress(p);
  if (!stored) return { data, reset: false };
  const extras = isExtras(stored.extras) ? stored.extras : undefined;
  const sameSize = extras
    ? extras.width === p.width && extras.height === p.height
    : stored.bits.length === data.bits.length;
  if (!sameSize || stored.bits.length !== data.bits.length) return { data, reset: true };

  data.daily = { ...stored.daily };
  for (let i = 0; i < p.cells.length; i++) {
    if (p.cells[i] && bitAt(stored.bits, i)) data.bits[i >> 3] |= 1 << (i & 7);
  }
  if (extras) {
    for (const [i, arms] of extras.partials) {
      const list = p.partials.get(i);
      if (!list) continue;
      const valid = list.reduce((m, s) => ((arms & s.mask) === s.mask ? m | s.mask : m), 0);
      if (valid) data.partials.set(i, valid);
    }
    const back = new Set(p.backstitches.map(itemKey));
    for (const k of extras.backstitches) if (back.has(k)) data.backstitches.add(k);
    const knots = new Set(p.knots.map(itemKey));
    for (const k of extras.knots) if (knots.has(k)) data.knots.add(k);
    const ids = new Set(p.palette.map((e) => e.id));
    data.parked = extras.parked.filter(
      (m) => m.x >= 0 && m.y >= 0 && m.x < p.width && m.y < p.height && ids.has(m.id),
    );
    if (extras.view) data.view = { ...extras.view };
  }
  return { data, reset: false };
}
