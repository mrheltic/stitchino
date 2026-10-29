import { describe, expect, it } from 'vitest';
import {
  inventoryCsv,
  parseCodeList,
  parseInventoryCsv,
  resolveCode,
} from '../../src/core/io/inventoryCsv.ts';

describe('thread codes typed by hand', () => {
  it('finds the catalog spelling', () => {
    expect(resolveCode('DMC', 'blanc')).toEqual({ brand: 'DMC', code: 'Blanc' });
    expect(resolveCode('DMC', '0310')).toEqual({ brand: 'DMC', code: '310' });
    expect(resolveCode('DMC', '01')).toEqual({ brand: 'DMC', code: '01' });
    expect(resolveCode('DMC', '99999')).toBeUndefined();
  });

  it('expands ranges and reports what is missing', () => {
    const { refs, unknown } = parseCodeList('310, 321; 150-153 99999', 'DMC');
    expect(refs.map((r) => r.code)).toEqual(['310', '321', '150', '151', '152', '153']);
    expect(unknown).toEqual(['99999']);
  });
});

describe('inventory CSV', () => {
  it('reads brand, code and quantity, with or without header and brand', () => {
    const csv = 'brand,code,skeins\nDMC,310,2\nAnchor,403,1\n"DMC","Blanc",3\n321\n310;x\n';
    const { items, unknown } = parseInventoryCsv(csv);
    expect(items).toEqual([
      { ref: { brand: 'DMC', code: '310' }, skeins: 2 },
      { ref: { brand: 'Anchor', code: '403' }, skeins: 1 },
      { ref: { brand: 'DMC', code: 'Blanc' }, skeins: 3 },
      { ref: { brand: 'DMC', code: '321' }, skeins: 1 },
    ]);
    expect(unknown).toEqual(['310;x']);
  });

  it('accepts semicolons, as spreadsheets in Italian write them', () => {
    const { items } = parseInventoryCsv('marca;codice;matasse\nDMC;310;2\nDMC;666;1,6\n');
    expect(items.map((i) => [i.ref.code, i.skeins])).toEqual([
      ['310', 2],
      ['666', 2],
    ]);
  });

  it('writes a file it can read back', () => {
    const items = [
      { ref: { brand: 'DMC' as const, code: '3865' }, skeins: 1 },
      { ref: { brand: 'DMC' as const, code: '310' }, skeins: 4 },
      { ref: { brand: 'Anchor' as const, code: '2' }, skeins: 2 },
    ];
    const csv = inventoryCsv(items);
    expect(csv.split('\n')[1]).toBe('DMC,310,Black,4');
    expect(parseInventoryCsv(csv).items).toHaveLength(3);
  });
});
