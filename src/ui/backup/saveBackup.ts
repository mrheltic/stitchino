import { APP_NAME } from '../../core/brand.ts';
import {
  BACKUP_EXTENSION,
  exportBackup,
  restoreBackup,
  type RestoreReport,
} from '../../storage/backup.ts';
import { db } from '../../storage/db.ts';
import { downloadBytes } from '../download.ts';
import { patternThumbnail } from '../patternPaint.ts';
import { noteBackup, noteRestored, type ProgressCount } from './reminder.ts';

async function progressCounts(): Promise<ProgressCount[]> {
  const rows = await db.progress.toArray();
  return rows.map((r) => ({ projectId: r.projectId, done: r.done }));
}

/** Downloads a backup of everything and remembers what it holds. */
export async function downloadBackup(): Promise<void> {
  // Counted first: stitches marked while the file is built are not in it for sure.
  const rows = await progressCounts();
  const date = new Date().toISOString().slice(0, 10);
  downloadBytes(await exportBackup(), `${APP_NAME.toLowerCase()}-${date}${BACKUP_EXTENSION}`);
  noteBackup(rows);
}

/** Restores a backup file; the projects it adds don't need a new backup. */
export async function restoreBackupFile(bytes: Uint8Array): Promise<RestoreReport> {
  const before = new Set(await db.projects.toCollection().primaryKeys());
  const report = await restoreBackup(bytes, undefined, (p) =>
    patternThumbnail(p.width, p.height, p.cells, p.palette, p.fabric.color),
  );
  noteRestored((await progressCounts()).filter((r) => !before.has(r.projectId)));
  return report;
}
