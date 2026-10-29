import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type Units = 'metric' | 'imperial';

export interface SettingsState {
  theme: ThemePref;
  units: Units;
  setTheme: (theme: ThemePref) => void;
  setUnits: (units: Units) => void;
}

/** localStorage can be missing or throw (private mode, blocked storage): fall back to memory. */
const safeStorage: StateStorage = (() => {
  const memory = new Map<string, string>();
  return {
    getItem: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        memory.delete(key);
      }
    },
  };
})();

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      units: 'metric',
      setTheme: (theme) => set({ theme }),
      setUnits: (units) => set({ units }),
    }),
    { name: 'puntocroce.settings', storage: createJSONStorage(() => safeStorage) },
  ),
);

/** Keeps `<html data-theme>` in sync with the preference and the OS setting. */
export function bindThemeToDocument(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const pref = useSettings.getState().theme;
    const dark = pref === 'dark' || (pref === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  };
  apply();
  media.addEventListener('change', apply);
  const unsubscribe = useSettings.subscribe(apply);
  return () => {
    media.removeEventListener('change', apply);
    unsubscribe();
  };
}
