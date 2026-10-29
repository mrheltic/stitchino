import { create } from 'zustand';
import { NO_ADJUSTMENTS, type Adjustments } from '../../core/convert/adjust.ts';
import type { CleanupLevel } from '../../core/convert/cleanup.ts';
import type { DitherMethod } from '../../core/convert/dither.ts';
import { sanitizeStrokes, type MaskStroke } from '../../core/convert/mask.ts';
import { DEFAULT_FABRIC, type Fabric } from '../../core/model/pattern.ts';
import type { Brand } from '../../core/threads/types.ts';
import { FULL_CROP, type Crop, type Orientation } from './image.ts';

export type AspectPreset = 'free' | '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16';

export const ASPECTS: Record<AspectPreset, number | null> = {
  free: null,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

/** Everything needed to recreate a pattern from its photo (saved with the project). */
export interface WizardSettings {
  orientation: Orientation;
  crop: Crop;
  aspect: AspectPreset;
  adjustments: Adjustments;
  removeBackground: boolean;
  /** Find the subject on its own (GrabCut) before the wand and the brush. */
  autoSubject: boolean;
  wandTolerance: number;
  /** Magic-wand clicks, as fractions of the cropped image. */
  wandSeeds: [number, number][];
  /** Brush corrections, applied last. */
  bgStrokes: MaskStroke[];
  /** Backstitch outline around the subject, added when the project is created. */
  outline: boolean;
  width: number;
  fabric: Fabric;
  brand: Brand;
  /** Which threads to use: any, only those in the inventory, or those preferably. */
  threads: 'all' | 'only' | 'prefer';
  maxColors: number;
  dither: DitherMethod;
  ditherStrength: number;
  cleanup: CleanupLevel;
  protectDetails: boolean;
  minStitches: number;
  title: string;
}

export const DEFAULT_WIZARD: WizardSettings = {
  orientation: { rotation: 0, flip: false },
  crop: FULL_CROP,
  aspect: 'free',
  adjustments: NO_ADJUSTMENTS,
  removeBackground: false,
  autoSubject: true,
  wandTolerance: 0.08,
  wandSeeds: [],
  bgStrokes: [],
  outline: false,
  width: 120,
  fabric: DEFAULT_FABRIC,
  brand: 'DMC',
  threads: 'all',
  maxColors: 30,
  dither: 'none',
  ditherStrength: 0.6,
  cleanup: 1,
  protectDetails: true,
  minStitches: 4,
  title: '',
};

interface WizardStore extends WizardSettings {
  set: (patch: Partial<WizardSettings>) => void;
  reset: () => void;
}

export const useWizard = create<WizardStore>()((set) => ({
  ...DEFAULT_WIZARD,
  set: (patch) => set(patch),
  reset: () => set(DEFAULT_WIZARD),
}));

export function pickSettings(s: WizardSettings): WizardSettings {
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_WIZARD)) out[k] = s[k as keyof WizardSettings];
  return out as unknown as WizardSettings;
}

/** Crop centred in the image with the given pixel aspect ratio, as large as possible. */
export function cropForAspect(ratio: number, orientedW: number, orientedH: number): Crop {
  const imgRatio = orientedW / orientedH;
  if (ratio >= imgRatio) {
    const h = imgRatio / ratio;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  const w = ratio / imgRatio;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/**
 * Wizard settings stored with a project may come from an imported file: keep only well-formed
 * values and fall back to the defaults for the rest.
 */
export function sanitizeSettings(raw: unknown): WizardSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  const d = DEFAULT_WIZARD;
  const o = (r.orientation ?? {}) as Record<string, unknown>;
  const c = (r.crop ?? {}) as Record<string, unknown>;
  const a = (r.adjustments ?? {}) as Record<string, unknown>;
  const f = (r.fabric ?? {}) as Record<string, unknown>;
  const crop = {
    x: num(c.x, 0, 0.95, 0),
    y: num(c.y, 0, 0.95, 0),
    w: num(c.w, 0.05, 1, 1),
    h: num(c.h, 0.05, 1, 1),
  };
  crop.w = Math.min(crop.w, 1 - crop.x);
  crop.h = Math.min(crop.h, 1 - crop.y);
  return {
    orientation: {
      rotation: ([0, 90, 180, 270] as const).find((x) => x === o.rotation) ?? 0,
      flip: o.flip === true,
    },
    crop,
    aspect: (Object.keys(ASPECTS) as AspectPreset[]).find((x) => x === r.aspect) ?? 'free',
    adjustments: {
      brightness: num(a.brightness, -1, 1, 0),
      contrast: num(a.contrast, -1, 1, 0),
      saturation: num(a.saturation, -1, 1, 0),
      gamma: num(a.gamma, 0.5, 2, 1),
      sharpen: num(a.sharpen, 0, 1, 0),
      denoise: num(a.denoise, 0, 1, 0),
    },
    removeBackground: r.removeBackground === true,
    // Settings saved before automatic subject finding existed keep their result.
    autoSubject: r.autoSubject === true,
    wandTolerance: num(r.wandTolerance, 0.02, 0.25, d.wandTolerance),
    wandSeeds: Array.isArray(r.wandSeeds)
      ? r.wandSeeds
          .filter(
            (p): p is [number, number] =>
              Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number'),
          )
          .slice(0, 200)
          .map(([x, y]) => [num(x, 0, 1, 0), num(y, 0, 1, 0)] as [number, number])
      : [],
    bgStrokes: sanitizeStrokes(r.bgStrokes),
    outline: r.outline === true,
    width: Math.round(num(r.width, 10, 1000, d.width)),
    fabric: {
      kind: (['aida', 'evenweave', 'linen'] as const).find((k) => k === f.kind) ?? 'aida',
      count: Math.round(num(f.count, 6, 60, 14)),
      over: f.over === 2 ? 2 : 1,
      color:
        typeof f.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : d.fabric.color,
    },
    brand: r.brand === 'Anchor' ? 'Anchor' : 'DMC',
    threads: r.threads === 'only' || r.threads === 'prefer' ? r.threads : 'all',
    maxColors: Math.round(num(r.maxColors, 2, 80, d.maxColors)),
    dither:
      (['none', 'floyd-steinberg', 'atkinson', 'ordered'] as const).find((x) => x === r.dither) ??
      'none',
    ditherStrength: num(r.ditherStrength, 0.1, 1, d.ditherStrength),
    cleanup: ([0, 1, 2, 3] as const).find((x) => x === r.cleanup) ?? d.cleanup,
    protectDetails: r.protectDetails !== false,
    minStitches: Math.round(num(r.minStitches, 0, 30, d.minStitches)),
    title: typeof r.title === 'string' ? r.title.slice(0, 120) : '',
  };
}
