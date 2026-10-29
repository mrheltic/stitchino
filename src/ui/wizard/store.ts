import { create } from 'zustand';
import { NO_ADJUSTMENTS, type Adjustments } from '../../core/convert/adjust.ts';
import type { CleanupLevel } from '../../core/convert/cleanup.ts';
import type { DitherMethod } from '../../core/convert/dither.ts';
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
  wandTolerance: number;
  /** Magic-wand clicks, as fractions of the cropped image. */
  wandSeeds: [number, number][];
  width: number;
  fabric: Fabric;
  brand: Brand;
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
  wandTolerance: 0.08,
  wandSeeds: [],
  width: 120,
  fabric: DEFAULT_FABRIC,
  brand: 'DMC',
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
