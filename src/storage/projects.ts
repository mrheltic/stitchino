import { countStitches, totalStitches, type Pattern } from '../core/model/pattern.ts';
import { decodeProject, encodeProject, type ProjectSource } from '../core/io/projectFile.ts';
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
  });
}

export async function importProjectFile(
  bytes: Uint8Array,
  store: StitchinoDb = db,
): Promise<string> {
  const bundle = decodeProject(bytes);
  const id = await createProject(bundle.pattern, { source: bundle.source }, store);
  if (bundle.progress) {
    let done = 0;
    for (const byte of bundle.progress) for (let b = byte; b; b &= b - 1) done++;
    await store.progress.put({
      projectId: id,
      bits: bundle.progress,
      done,
      updatedAt: Date.now(),
      daily: {},
    });
  }
  return id;
}
