import { beforeEach, describe, expect, it } from 'vitest';
import {
  REMIND_AFTER_STITCHES,
  backupDue,
  noteBackup,
  noteRestored,
  snoozeBackup,
  unsavedStitches,
  useBackupState,
} from '../src/ui/backup/reminder.ts';

const DAY = 24 * 3600 * 1000;
const NOW = Date.UTC(2026, 10, 12);
const due = (rows: { projectId: string; done: number }[], now = NOW) =>
  backupDue(useBackupState.getState(), rows, now);

describe('backup reminder', () => {
  beforeEach(() => useBackupState.setState({ at: 0, saved: {}, snoozedUntil: 0 }));

  it('counts the stitches marked since the last backup, project by project', () => {
    const saved = { a: 100, gone: 5000 };
    const rows = [
      { projectId: 'a', done: 350 },
      { projectId: 'b', done: 40 },
      // Unmarked since: nothing new to lose.
      { projectId: 'c', done: 0 },
    ];
    expect(unsavedStitches(saved, rows)).toBe(290);
    expect(unsavedStitches({ a: 400 }, [{ projectId: 'a', done: 350 }])).toBe(0);
  });

  it('asks once enough was stitched and no backup holds it', () => {
    expect(due([{ projectId: 'a', done: REMIND_AFTER_STITCHES - 1 }])).toBe(false);
    expect(due([{ projectId: 'a', done: REMIND_AFTER_STITCHES }])).toBe(true);
  });

  it('keeps quiet after a backup until a week has passed and more was stitched', () => {
    noteBackup([{ projectId: 'a', done: 600 }], NOW);
    expect(due([{ projectId: 'a', done: 600 }], NOW + 30 * DAY)).toBe(false);
    const more = [{ projectId: 'a', done: 600 + REMIND_AFTER_STITCHES }];
    expect(due(more, NOW + 6 * DAY)).toBe(false);
    expect(due(more, NOW + 7 * DAY)).toBe(true);
  });

  it('waits two weeks after "Not now"', () => {
    const rows = [{ projectId: 'a', done: 900 }];
    snoozeBackup(NOW);
    expect(due(rows, NOW + 13 * DAY)).toBe(false);
    expect(due(rows, NOW + 14 * DAY)).toBe(true);
  });

  it('does not ask for what was just restored from a backup', () => {
    noteBackup([{ projectId: 'mine', done: 10 }], NOW - 30 * DAY);
    noteRestored([{ projectId: 'restored', done: 4000 }]);
    const rows = [
      { projectId: 'mine', done: 10 },
      { projectId: 'restored', done: 4000 },
    ];
    expect(due(rows)).toBe(false);
    expect(useBackupState.getState().saved).toEqual({ mine: 10, restored: 4000 });
  });
});
