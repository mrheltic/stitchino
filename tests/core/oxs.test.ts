// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { exportOxs, importOxs, InvalidOxsError } from '../../src/core/io/oxs.ts';
import {
  ARM,
  FULL_MASK,
  HALF_BACKSLASH,
  HALF_SLASH,
  createPattern,
} from '../../src/core/model/pattern.ts';

function sample() {
  const p = createPattern(6, 4, {
    meta: { title: 'Cuore & fiori', author: 'Anna', source: 'blank' },
  });
  p.fabric = { kind: 'evenweave', count: 28, over: 2, color: '#efe3c8' };
  p.palette = [
    { id: 1, threads: [{ brand: 'DMC', code: '310' }], symbol: '●', strands: 2, backStrands: 1 },
    { id: 4, threads: [{ brand: 'Anchor', code: '403' }], symbol: '■', strands: 1, backStrands: 2 },
    {
      id: 7,
      threads: [
        { brand: 'DMC', code: '321' },
        { brand: 'DMC', code: '666' },
      ],
      symbol: '▲',
      strands: 2,
      backStrands: 1,
    },
    { id: 9, threads: [{ brand: 'DMC', code: '01' }], symbol: '◆', strands: 2, backStrands: 1 },
  ];
  p.cells.set([1, 4, 7, 9, 0, 1]);
  p.partials.set(6, [{ mask: HALF_SLASH, id: 4 }]);
  p.partials.set(7, [{ mask: HALF_BACKSLASH, id: 1 }]);
  p.partials.set(8, [
    { mask: FULL_MASK & ~ARM.BR, id: 1 },
    { mask: ARM.BR, id: 7 },
  ]);
  p.partials.set(9, [{ mask: FULL_MASK & ~ARM.BL, id: 4 }]);
  p.partials.set(10, [{ mask: ARM.TR, id: 9 }]);
  p.backstitches.push({ x1: 0, y1: 0, x2: 3, y2: 4, id: 7 });
  p.knots.push({ x: 5, y: 5, id: 4 });
  return p;
}

describe('OXS', () => {
  it('round-trips stitches, palette, fabric and metadata', () => {
    const p = sample();
    const xml = exportOxs(p);
    expect(xml).toContain('<chart>');
    expect(xml).toContain('number="DMC 310"');
    expect(xml).toContain('charttitle="Cuore &amp; fiori"');
    const { pattern: q, report } = importOxs(xml);
    expect(report.substituted).toEqual([]);
    expect(report.skipped).toBe(0);
    expect(q.width).toBe(6);
    expect(q.fabric).toEqual(p.fabric);
    expect(q.meta).toMatchObject({ title: 'Cuore & fiori', author: 'Anna' });
    expect(q.palette.map((e) => e.threads)).toEqual(p.palette.map((e) => e.threads));
    expect(q.palette.map((e) => e.symbol)).toEqual(p.palette.map((e) => e.symbol));
    expect(q.palette[1]).toMatchObject({ strands: 1, backStrands: 2 });
    // Ids are renumbered 1..n in palette order.
    const remap = new Map(p.palette.map((e, i) => [e.id, i + 1]));
    expect([...q.cells]).toEqual([...p.cells].map((c) => (c ? remap.get(c) : 0)));
    for (const [i, list] of p.partials) {
      expect(q.partials.get(i), `cell ${i}`).toEqual(
        list.map((s) => ({ mask: s.mask, id: remap.get(s.id) })),
      );
    }
    expect(q.backstitches).toEqual([{ x1: 0, y1: 0, x2: 3, y2: 4, id: 3 }]);
    expect(q.knots).toEqual([{ x: 5, y: 5, id: 2 }]);
  });

  it('reads files from other programs: brands, codes, missing size, unknown objects', () => {
    const xml = `<?xml version="1.0"?>
<chart>
  <properties charttitle="Altro" stitchesperinch="14"/>
  <palette>
    <palette_item index="0" number="cloth" name="cloth" color="FFFFFF"/>
    <palette_item index="1" number="DMC    310" name="Black" color="000000" strands="2" symbol="100"/>
    <palette_item index="2" number="Madeira 2400" name="White" color="FEFEFE"/>
    <palette_item index="3" number="DMC 1" name="White Tin" color="E3E3E6"/>
    <palette_item index="4" number="DMC BLANC" name="White" color="FFFFFF"/>
  </palette>
  <fullstitches>
    <stitch x="0" y="0" palindex="1"/>
    <stitch x="4" y="2" palindex="2"/>
    <stitch x="1" y="1" palindex="0"/>
    <stitch x="2" y="2" palindex="9"/>
  </fullstitches>
  <partstitches><partstitch x="1" y="0" palindex1="3" palindex2="4" direction="1"/></partstitches>
  <ornaments_inc_knots_and_beads>
    <object x1="2.5" y1="0.5" palindex="1" objecttype="quarter"/>
    <object x1="1" y1="1" palindex="1" objecttype="bead"/>
  </ornaments_inc_knots_and_beads>
</chart>`;
    const { pattern: q, report } = importOxs(xml);
    expect(q.width).toBe(5);
    expect(q.height).toBe(3);
    expect(q.palette.map((e) => e.threads[0].code)).toEqual([
      '310',
      expect.any(String),
      '01',
      'Blanc',
    ]);
    expect(report.substituted).toEqual([
      { original: 'Madeira 2400', replacement: expect.stringMatching(/^DMC /) },
    ]);
    expect(report.skipped).toBe(1);
    expect(q.cells[0]).toBe(1);
    expect(q.cells[2 * 5 + 4]).toBe(2);
    expect(q.partials.get(1)).toEqual([
      { mask: FULL_MASK & ~ARM.TR, id: 3 },
      { mask: ARM.TR, id: 4 },
    ]);
    expect(q.partials.get(2)).toEqual([{ mask: ARM.BR, id: 1 }]);
  });

  it('rejects broken files', () => {
    expect(() => importOxs('<not-xml')).toThrow(InvalidOxsError);
    expect(() => importOxs('<?xml version="1.0"?><foo/>')).toThrow(/chart/);
  });
});
