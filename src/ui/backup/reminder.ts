import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../state/settings.ts';

/**
 * When to remind about backups. Stitching progress is months of work kept in one browser, so the
 * home page asks for a backup once enough stitches have been marked since the last one: at most
 * once a week, and not for two weeks after "Not now".
 */
export interface BackupState {
  /** When the last backup was downloaded in this browser; 0 if never. */
  at: number;
  /** Stitches done per project that are in a backup file (downloaded here, or restored from). */
  saved: Record<string, number>;
  /** "Not now": no reminder before this time. */
  snoozedUntil: number;
}

/** Stitches done in a project, as stored with its progress. */
export interface ProgressCount {
  projectId: string;
  done: number;
}

/** A few evenings of stitching: enough to hurt if lost. */
export const REMIND_AFTER_STITCHES = 500;
const DAY_MS = 24 * 3600 * 1000;
const MIN_INTERVAL_MS = 7 * DAY_MS;
const SNOOZE_MS = 14 * DAY_MS;

export const useBackupState = create<BackupState>()(
  persist((): BackupState => ({ at: 0, saved: {}, snoozedUntil: 0 }), {
    name: 'puntocroce.backup',
    storage: createJSONStorage(() => safeStorage),
  }),
);

/** Stitches marked since they were last in a backup; unmarking never counts. */
export function unsavedStitches(
  saved: Record<string, number>,
  rows: readonly ProgressCount[],
): number {
  let n = 0;
  for (const r of rows) n += Math.max(0, r.done - (saved[r.projectId] ?? 0));
  return n;
}

export function backupDue(s: BackupState, rows: readonly ProgressCount[], now: number): boolean {
  return (
    now >= s.snoozedUntil &&
    now - s.at >= MIN_INTERVAL_MS &&
    unsavedStitches(s.saved, rows) >= REMIND_AFTER_STITCHES
  );
}

function counts(rows: readonly ProgressCount[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.projectId, r.done]));
}

/** A backup with these projects was downloaded. */
export function noteBackup(rows: readonly ProgressCount[], now = Date.now()): void {
  useBackupState.setState({ at: now, saved: counts(rows), snoozedUntil: 0 });
}

/** These projects came from a backup file, so what they hold is already saved. */
export function noteRestored(rows: readonly ProgressCount[]): void {
  useBackupState.setState((s) => ({ saved: { ...s.saved, ...counts(rows) } }));
}

export function snoozeBackup(now = Date.now()): void {
  useBackupState.setState({ snoozedUntil: now + SNOOZE_MS });
}
