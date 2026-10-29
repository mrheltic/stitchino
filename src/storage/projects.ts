import { countStitches, totalStitches, type Pattern } from '../core/model/pattern.ts';
import { decodeProject, encodeProject, type ProjectSource } from '../core/io/projectFile.ts';
import { progressExtras, restoreProgress } from '../core/progress/serialize.ts';
import { ProgressTracker, type ProgressData } from '../core/progress/tracker.ts';
import { db, type StitchinoDb, type ProjectRow } from './db.ts';

export type ProjectSummary = Omit<ProjectRow, 'data'>;

export class ImportedPatternError extends Error {
  constructor() {
    super('Patterns imported from PDF files are for personal use and cannot be exported');
    this.name = 'ImportedPatternError';
  }
}

function summaryFields(pattern: Pattern) {
  const counts = countStitches(pattern);
  const used = [...counts.values()].filter(
    (c) => c.full + c.half + c.quarter + c.threeQuarter + c.backstitchCells + c.knots > 0,
  ).length;
  return {
    title: pattern.meta.title,
    width: pattern.width,
    height: pattern.height,
    colors: used,
    stitches: totalStitches(pattern),
    source: pattern.meta.source,
  };
}

export async function listProjects(store: StitchinoDb = db): Promise<ProjectSummary[]> {
  const rows = await store.projects.orderBy('updatedAt').reverse().toArray();
  return rows.map(({ data: _data, ...summary }) => summary);
}

export async function createProject(
  pattern: Pattern,
  opts: { thumbnail?: Blob; source?: ProjectSource; imported?: boolean } = {},
  store: StitchinoDb = db,
): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await store.transaction('rw', store.projects, store.sources, async () => {
    await store.projects.add({
      id,
      createdAt: now,
      updatedAt: now,
      imported: opts.imported ?? false,
      thumbnail: opts.thumbnail,
      data: encodeProject({ pattern }),
      ...summaryFields(pattern),
    });
    if (opts.source) await store.sources.put({ projectId: id, ...opts.source });
  });
  return id;
}

export async function loadProject(
  id: string,
  store: StitchinoDb = db,
): Promise<{ summary: ProjectSummary; pattern: Pattern } | undefined> {
  const row = await store.projects.get(id);
  if (!row) return undefined;
  const { data, ...summary } = row;
  return { summary, pattern: decodeProject(data).pattern };
}

export async function saveProject(
  id: string,
  pattern: Pattern,
  thumbnail?: Blob,
  store: StitchinoDb = db,
): Promise<void> {
  const changes: Partial<ProjectRow> = {
    updatedAt: Date.now(),
    data: encodeProject({ pattern }),
    ...summaryFields(pattern),
  };
  if (thumbnail) changes.thumbnail = thumbnail;
  const updated = await store.projects.update(id, changes);
  if (!updated) throw new Error(`Project ${id} not found`);
}

export async function deleteProject(id: string, store: StitchinoDb = db): Promise<void> {
  await store.transaction('rw', store.projects, store.sources, store.progress, async () => {
    await store.projects.delete(id);
    await store.sources.delete(id);
    await store.progress.delete(id);
  });
}

export async function duplicateProject(
  id: string,
  title: string,
  store: StitchinoDb = db,
): Promise<string> {
  const row = await store.projects.get(id);
  if (!row) throw new Error(`Project ${id} not found`);
  if (row.imported) throw new ImportedPatternError();
  const pattern = decodeProject(row.data).pattern;
  pattern.meta = { ...pattern.meta, title };
  const source = await store.sources.get(id);
  return createProject(
    pattern,
    {
      thumbnail: row.thumbnail,
      source: source && { bytes: source.bytes, mime: source.mime, settings: source.settings },
    },
    store,
  );
}

/** Full project file with photo and progress, for backup or moving to another device. */
export async function exportProjectFile(id: string, store: StitchinoDb = db): Promise<Uint8Array> {
  const row = await store.projects.get(id);
  if (!row) throw new Error(`Project ${id} not found`);
  if (row.imported) throw new ImportedPatternError();
  const pattern = decodeProject(row.data).pattern;
  const [source, progress] = await Promise.all([store.sources.get(id), store.progress.get(id)]);
  return encodeProject({
    pattern,
    source: source && { bytes: source.bytes, mime: source.mime, settings: source.settings },
    progress: progress?.bits,
    progressInfo: progress && { daily: progress.daily, extras: progress.extras },
  });
}

export async function importProjectFile(
  bytes: Uint8Array,
  store: StitchinoDb = db,
): Promise<string> {
  const bundle = decodeProject(bytes);
  const id = await createProject(bundle.pattern, { source: bundle.source }, store);
  if (bundle.progress) {
    const { data } = restoreProgress(bundle.pattern, {
      bits: bundle.progress,
      daily: bundle.progressInfo?.daily ?? {},
      extras: bundle.progressInfo?.extras,
    });
    await putProgress(id, new ProgressTracker(bundle.pattern, data), store);
  }
  return id;
}

// --- Stitching progress ----------------------------------------------------------------------

/** Progress for the pattern as it is now; `reset` when the size changed since it was saved. */
export async function loadProgress(
  id: string,
  pattern: Pattern,
  store: StitchinoDb = db,
): Promise<{ data: ProgressData; reset: boolean }> {
  const row = await store.progress.get(id);
  return restoreProgress(pattern, row && { bits: row.bits, daily: row.daily, extras: row.extras });
}

export async function putProgress(
  id: string,
  tracker: ProgressTracker,
  store: StitchinoDb = db,
): Promise<void> {
  const d = tracker.data;
  await store.progress.put({
    projectId: id,
    bits: d.bits,
    done: tracker.total.done,
    total: tracker.total.total,
    updatedAt: Date.now(),
    daily: { ...d.daily },
    extras: progressExtras(d),
  });
}
