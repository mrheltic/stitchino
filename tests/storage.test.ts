import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createPattern } from '../src/core/model/index.ts';
import { PuntoCroceDb } from '../src/storage/db.ts';
import {
  ImportedPatternError,
  createProject,
  deleteProject,
  duplicateProject,
  exportProjectFile,
  importProjectFile,
  listProjects,
  loadProject,
  saveProject,
} from '../src/storage/projects.ts';

function pattern(title: string) {
  const p = createPattern(3, 2, { meta: { title, source: 'blank' } });
  p.palette = [
    { id: 1, threads: [{ brand: 'DMC', code: '310' }], symbol: '●', strands: 2, backStrands: 1 },
  ];
  p.cells.set([1, 0, 1]);
  return p;
}

describe('project storage', () => {
  it('creates, lists, loads, saves and deletes projects', async () => {
    const store = new PuntoCroceDb(`test-${Math.random()}`);
    const a = await createProject(pattern('A'), {}, store);
    await new Promise((r) => setTimeout(r, 2));
    const b = await createProject(pattern('B'), {}, store);
    expect((await listProjects(store)).map((p) => p.title)).toEqual(['B', 'A']);

    const loaded = await loadProject(a, store);
    expect(loaded?.summary).toMatchObject({ title: 'A', stitches: 2, colors: 1, width: 3 });
    const p = loaded!.pattern;
    p.cells[1] = 1;
    p.meta.title = 'A2';
    await new Promise((r) => setTimeout(r, 2));
    await saveProject(a, p, undefined, store);
    const list = await listProjects(store);
    expect(list[0]).toMatchObject({ title: 'A2', stitches: 3 });

    await deleteProject(b, store);
    expect((await listProjects(store)).map((x) => x.id)).toEqual([a]);
    expect(await loadProject(b, store)).toBeUndefined();
  });

  it('exports and re-imports a project with its photo and progress', async () => {
    const store = new PuntoCroceDb(`test-${Math.random()}`);
    const id = await createProject(
      pattern('Foto'),
      { source: { bytes: Uint8Array.from([9, 9]), mime: 'image/png' } },
      store,
    );
    await store.progress.put({
      projectId: id,
      bits: Uint8Array.from([0b11]),
      done: 2,
      updatedAt: 1,
      daily: {},
    });
    const file = await exportProjectFile(id, store);
    const copy = await importProjectFile(file, store);
    expect((await store.sources.get(copy))?.bytes).toEqual(Uint8Array.from([9, 9]));
    expect((await store.progress.get(copy))?.done).toBe(2);
    const dup = await duplicateProject(id, 'Copia', store);
    expect((await loadProject(dup, store))?.summary.title).toBe('Copia');
  });

  it('refuses to export patterns imported from PDF', async () => {
    const store = new PuntoCroceDb(`test-${Math.random()}`);
    const id = await createProject(pattern('Comprato'), { imported: true }, store);
    await expect(exportProjectFile(id, store)).rejects.toThrow(ImportedPatternError);
    await expect(duplicateProject(id, 'x', store)).rejects.toThrow(ImportedPatternError);
  });
});
