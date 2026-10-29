import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ARM, HALF_SLASH, createPattern } from '../../src/core/model/index.ts';
import {
  InvalidProjectFileError,
  decodeProject,
  encodeProject,
} from '../../src/core/io/projectFile.ts';

function sample() {
  const p = createPattern(5, 3, { meta: { title: 'Prova', author: 'Me', source: 'photo' } });
  p.palette = [
    { id: 1, threads: [{ brand: 'DMC', code: '310' }], symbol: '●', strands: 2, backStrands: 1 },
    {
      id: 7,
      threads: [
        { brand: 'DMC', code: '321' },
        { brand: 'Anchor', code: '47' },
      ],
      symbol: '■',
      strands: 1,
      backStrands: 1,
    },
  ];
  p.cells.set([1, 1, 7, 0, 1, 0, 7, 7, 7, 1]);
  p.partials.set(3, [
    { mask: HALF_SLASH, id: 7 },
    { mask: ARM.TL, id: 1 },
  ]);
  p.backstitches.push({ x1: 0, y1: 0, x2: 10, y2: 6, id: 1 });
  p.knots.push({ x: 3, y: 3, id: 7 });
  p.fabric = { kind: 'evenweave', count: 28, over: 2, color: '#efe3c8' };
  return p;
}

describe('project file', () => {
  it('round-trips a pattern with partials, backstitch, knots, source and progress', () => {
    const pattern = sample();
    const progress = Uint8Array.from([0b101, 0]);
    const source = {
      bytes: Uint8Array.from([1, 2, 3]),
      mime: 'image/jpeg',
      settings: { width: 5 },
    };
    const back = decodeProject(encodeProject({ pattern, source, progress }));
    expect(back.pattern.width).toBe(5);
    expect([...back.pattern.cells]).toEqual([...pattern.cells]);
    expect(back.pattern.palette).toEqual(pattern.palette);
    expect([...back.pattern.partials.entries()]).toEqual([...pattern.partials.entries()]);
    expect(back.pattern.backstitches).toEqual(pattern.backstitches);
    expect(back.pattern.knots).toEqual(pattern.knots);
    expect(back.pattern.fabric).toEqual(pattern.fabric);
    expect(back.pattern.meta).toMatchObject({ title: 'Prova', author: 'Me', source: 'photo' });
    expect([...back.source!.bytes]).toEqual([1, 2, 3]);
    expect(back.source!.settings).toEqual({ width: 5 });
    expect([...back.progress!]).toEqual([5, 0]);
  });

  it('rejects files that are not projects', () => {
    expect(() => decodeProject(Uint8Array.from([1, 2, 3]))).toThrow(InvalidProjectFileError);
    const noJson = zipSync({ 'cells.bin': new Uint8Array(2) });
    expect(() => decodeProject(noJson)).toThrow(/project.json/);
  });

  it('rejects inconsistent content', () => {
    const json = (extra: object) =>
      strToU8(
        JSON.stringify({
          format: 'puntocroce',
          version: 1,
          width: 2,
          height: 1,
          palette: [
            {
              id: 1,
              threads: [{ brand: 'DMC', code: '310' }],
              symbol: '●',
              strands: 2,
              backStrands: 1,
            },
          ],
          fabric: {},
          meta: {},
          partials: [],
          backstitches: [],
          knots: [],
          ...extra,
        }),
      );
    const ok = zipSync({ 'project.json': json({}), 'cells.bin': Uint8Array.from([1, 0, 0, 0]) });
    expect(decodeProject(ok).pattern.fabric.count).toBe(14);
    const unknownId = zipSync({
      'project.json': json({}),
      'cells.bin': Uint8Array.from([9, 0, 0, 0]),
    });
    expect(() => decodeProject(unknownId)).toThrow(/unknown colour/);
    const shortCells = zipSync({ 'project.json': json({}), 'cells.bin': Uint8Array.from([1, 0]) });
    expect(() => decodeProject(shortCells)).toThrow(/bad cells/);
    const newer = zipSync({
      'project.json': json({ version: 99 }),
      'cells.bin': Uint8Array.from([1, 0, 0, 0]),
    });
    expect(() => decodeProject(newer)).toThrow(/newer/);
    const overlap = zipSync({
      'project.json': json({
        partials: [
          [
            0,
            [
              { mask: 6, id: 1 },
              { mask: 2, id: 1 },
            ],
          ],
        ],
      }),
      'cells.bin': Uint8Array.from([0, 0, 0, 0]),
    });
    expect(() => decodeProject(overlap)).toThrow(/partial/);
  });
});
