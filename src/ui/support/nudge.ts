import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DONATION_LINKS } from '../../core/brand.ts';
import { safeStorage } from '../state/settings.ts';

/**
 * The only request for support inside the app: a short thank-you line after an export, from the
 * third export on, at most once every four months, and never again once dismissed.
 */
export interface SupportState {
  exports: number;
  lastShown: number;
  never: boolean;
}

const MIN_EXPORTS = 3;
const INTERVAL_MS = 120 * 24 * 3600 * 1000;

const useSupportState = create<SupportState>()(
  persist((): SupportState => ({ exports: 0, lastShown: 0, never: false }), {
    name: 'puntocroce.support',
    storage: createJSONStorage(() => safeStorage),
  }),
);

export function noteExport(): void {
  useSupportState.setState((s) => ({ exports: s.exports + 1 }));
}

export function shouldNudge(
  s: SupportState,
  now: number,
  links: readonly string[] = DONATION_LINKS,
): boolean {
  return (
    links.length > 0 && !s.never && s.exports >= MIN_EXPORTS && now - s.lastShown > INTERVAL_MS
  );
}

/** True if the thank-you line is due now; it then counts as shown. */
export function takeNudge(): boolean {
  const now = Date.now();
  if (!shouldNudge(useSupportState.getState(), now)) return false;
  useSupportState.setState({ lastShown: now });
  return true;
}

export function neverNudge(): void {
  useSupportState.setState({ never: true });
}
