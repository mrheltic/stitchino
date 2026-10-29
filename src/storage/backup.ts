import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { inventoryCsv, parseInventoryCsv } from '../core/io/inventoryCsv.ts';
import { db, type StitchinoDb } from './db.ts';
import { importInventory } from './inventory.ts';
import { importProjectFile, projectFileOf } from './projects.ts';
import { decodeProject } from '../core/io/projectFile.ts';
import type { Pattern } from '../core/model/pattern.ts';

export const BACKUP_FORMAT = 'stitchino-backup';
export const BACKUP_EXTENSION = '.stitchino-backup';

interface Manifest {
  format: typeof BACKUP_FORMAT;
  version: 1;
  createdAt: number;
  projects: { file: string; id: string; imported: boolean; createdAt: number; updatedAt: number }[];
}

export class InvalidBackupError extends Error {
  constructor() {
    super('Not a Stitchino backup');
    this.name = 'InvalidBackupError';
  }
}

/**
 * Everything on this device in one file: every project with photo and progress (patterns
 * imported from PDFs included, since the file is the owner's own copy) and the thread inventory.
 */
export async function exportBackup(store: StitchinoDb = db): Promise<Uint8Array> {
  const rows = await store.projects.toArray();
  const files: Record<string, Uint8Array> = {};
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: 1,
    createdAt: Date.now(),
    projects: [],
  };
  for (const row of rows) {
    const file = `projects/${row.id}.stitchino`;
    files[file] = await projectFileOf(row, store);
    manifest.projects.push({
      file,
      id: row.id,
      imported: row.imported,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  const inventory = await store.inventory.toArray();
  files['inventory.csv'] = strToU8(
    inventoryCsv(
      inventory.map((r) => ({ ref: { brand: r.brand, code: r.code }, skeins: r.skeins })),
    ),
  );
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  // Project files are already compressed zips.
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [
        name,
        [data, { level: name.endsWith('.stitchino') ? 0 : 6 }],
      ]),
    ),
  );
}

export interface RestoreReport {
  added: number;
  /** Projects already on this device (same id), left as they are. */
  skipped: number;
  threads: number;
}

/** Adds the backup's projects that aren't here yet and merges its inventory. */
export async function restoreBackup(
  bytes: Uint8Array,
  store: StitchinoDb = db,
  thumbnailOf: (p: Pattern) => Promise<Blob | undefined> = async () => undefined,
): Promise<RestoreReport> {
  let files: Record<string, Uint8Array>;
  let manifest: Manifest;
  try {
    files = unzipSync(bytes);
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  } catch {
    throw new InvalidBackupError();
  }
  if (manifest?.format !== BACKUP_FORMAT || !Array.isArray(manifest.projects))
    throw new InvalidBackupError();
  const report: RestoreReport = { added: 0, skipped: 0, threads: 0 };
  for (const p of manifest.projects) {
    const data = files[p.file];
    if (!data || typeof p.id !== 'string') continue;
    if (await store.projects.get(p.id)) {
      report.skipped++;
      continue;
    }
    const thumbnail = await thumbnailOf(decodeProject(data).pattern);
    await importProjectFile(data, store, {
      id: p.id,
      imported: p.imported === true,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      thumbnail,
    });
    report.added++;
  }
  const csv = files['inventory.csv'];
  if (csv) {
    const { items } = parseInventoryCsv(strFromU8(csv));
    await importInventory(items, store);
    report.threads = items.length;
  }
  return report;
}
