import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ViewMode } from '../../render/chartRenderer.ts';
import { safeStorage } from '../state/settings.ts';

export type StitchTool = 'mark' | 'area' | 'rect' | 'lines' | 'park' | 'pan';

/** Highlighter colours for done stitches. */
export const DONE_COLORS = ['#16a34a', '#eab308', '#db2777', '#2563eb', '#374151'] as const;

export interface StitchPrefs {
  mode: ViewMode;
  /** A highlighter colour, or 'auto': the one that stands out most from the pattern. */
  doneColor: string;
  leftHanded: boolean;
  keepAwake: boolean;
  grid: boolean;
  rulers: boolean;
}

export interface StitchState extends StitchPrefs {
  tool: StitchTool;
  /** Colour being stitched: the others fade and marking only touches it. */
  activeId: number | null;
  /** A short message over the chart: how a tool works, or what it needs first. */
  hint: string | null;
  set: (patch: Partial<Omit<StitchState, 'set'>>) => void;
}

export const useStitch = create<StitchState>()(
  persist(
    (set) => ({
      tool: 'mark',
      activeId: null,
      hint: null,
      mode: 'colorSymbols',
      doneColor: 'auto',
      leftHanded: false,
      keepAwake: true,
      grid: true,
      rulers: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'puntocroce.stitch',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s): StitchPrefs => ({
        mode: s.mode,
        doneColor: s.doneColor,
        leftHanded: s.leftHanded,
        keepAwake: s.keepAwake,
        grid: s.grid,
        rulers: s.rulers,
      }),
    },
  ),
);
