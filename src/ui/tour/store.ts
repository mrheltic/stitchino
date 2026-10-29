import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../state/settings.ts';

/** Where a step happens: anywhere, in the photo wizard or in the editor. */
export type TourRoute = 'any' | 'wizard' | 'editor';

export interface TourStep {
  id: string;
  route: TourRoute;
  /** `data-tour` anchor to point at; without one the card sits in the middle. */
  target?: string;
  /** The step ends when the highlighted element is used, not with "Next". */
  clickTarget?: boolean;
}

/** A first pattern from the example picture, then the editor's main controls. */
export const TOUR: readonly TourStep[] = [
  { id: 'welcome', route: 'any' },
  { id: 'preview', route: 'wizard', target: 'preview' },
  { id: 'crop', route: 'wizard', target: 'step-crop' },
  { id: 'adjust', route: 'wizard', target: 'step-adjust' },
  { id: 'size', route: 'wizard', target: 'step-size' },
  { id: 'colors', route: 'wizard', target: 'step-colors' },
  { id: 'variants', route: 'wizard', target: 'variants' },
  { id: 'create', route: 'wizard', target: 'create', clickTarget: true },
  { id: 'palette', route: 'editor', target: 'palette' },
  { id: 'tools', route: 'editor', target: 'tools' },
  { id: 'export', route: 'editor', target: 'export' },
  { id: 'stitch', route: 'editor', target: 'stitch' },
  { id: 'done', route: 'any' },
];

/** The page the example tour starts from. */
export const TOUR_START_PATH = '/new?example=1';

interface TourState {
  /** "new" until the tour has been offered once. */
  status: 'new' | 'running' | 'done';
  step: number;
  /** Last page a step was shown on, to resume a paused tour. */
  lastPath: string;
  start: () => void;
  next: () => void;
  back: () => void;
  end: () => void;
  seen: (path: string) => void;
}

export const useTour = create<TourState>()(
  persist(
    (set, get) => ({
      status: 'new',
      step: 0,
      lastPath: TOUR_START_PATH,
      start: () => set({ status: 'running', step: 0, lastPath: TOUR_START_PATH }),
      next: () => {
        const step = get().step + 1;
        set(step < TOUR.length ? { step } : { status: 'done', step: 0 });
      },
      back: () => set({ step: Math.max(0, get().step - 1) }),
      end: () => set({ status: 'done', step: 0 }),
      seen: (lastPath) => {
        if (get().lastPath !== lastPath) set({ lastPath });
      },
    }),
    {
      name: 'puntocroce.tour',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ status: s.status, step: s.step, lastPath: s.lastPath }),
    },
  ),
);

export function routeMatches(route: TourRoute, pathname: string): boolean {
  if (route === 'any') return true;
  if (route === 'wizard') return pathname === '/new';
  return /^\/project\/[^/]+$/.test(pathname);
}
