import { describe, expect, it } from 'vitest';
import { deltaE2000, rgbToLab } from '../../src/core/color/index.ts';
import {
  ThreadMatcher,
  equivalentThread,
  getThread,
  parseThreadKey,
  searchThreads,
  threadKey,
  threadsOf,
} from '../../src/core/threads/index.ts';

describe('thread catalog', () => {
  it('loads both brands, including the DMC 2017 colours and specials', () => {
    expect(threadsOf('DMC')).toHaveLength(489);
    expect(threadsOf('Anchor')).toHaveLength(445);
    for (const code of ['B5200', 'Blanc', 'Ecru', '01', '35', '310', '3865']) {
      expect(getThread({ brand: 'DMC', code }), code).toBeDefined();
    }
    expect(getThread('DMC:310')?.rgb).toEqual([0, 0, 0]);
    expect(getThread('DMC:309')?.rgb).toEqual([186, 74, 74]);
  });

  it('has unique codes per brand', () => {
    for (const brand of ['DMC', 'Anchor'] as const) {
      const codes = threadsOf(brand).map((t) => t.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('round-trips thread keys', () => {
    expect(parseThreadKey(threadKey({ brand: 'Anchor', code: '403' }))).toEqual({
      brand: 'Anchor',
      code: '403',
    });
    expect(() => parseThreadKey('Foo:1')).toThrow();
  });

  it('maps DMC 310 and Anchor 403 to each other', () => {
    expect(equivalentThread({ brand: 'DMC', code: '310' }, 'Anchor')?.thread.code).toBe('403');
    expect(equivalentThread({ brand: 'Anchor', code: '403' }, 'DMC')?.thread.code).toBe('310');
    expect(equivalentThread({ brand: 'DMC', code: '310' }, 'DMC')?.deltaE).toBe(0);
  });

  it('searches by code prefix first, then by name', () => {
    const hits = searchThreads('31', 'DMC');
    expect(hits[0].code).toBe('31');
    expect(hits.map((t) => t.code)).toContain('310');
    expect(searchThreads('salmon', 'DMC').every((t) => /salmon/i.test(t.name))).toBe(true);
  });
});

describe('ThreadMatcher', () => {
  const dmc = threadsOf('DMC');
  const matcher = new ThreadMatcher(dmc);

  it('finds an exact colour with ΔE 0', () => {
    for (const t of dmc) {
      const m = matcher.nearest(t.lab);
      expect(m.deltaE, t.code).toBeCloseTo(0, 6);
    }
  });

  it('agrees with a brute-force CIEDE2000 search', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255;
    for (let n = 0; n < 3000; n++) {
      const rgb = [Math.round(rand()), Math.round(rand()), Math.round(rand())] as const;
      const lab = rgbToLab(rgb);
      const all = dmc.map((t) => deltaE2000(lab, t.lab)).sort((a, b) => a - b);
      const top3 = matcher.nearestK(lab, 3).map((m) => m.deltaE);
      expect(top3[0]).toBeCloseTo(all[0], 9);
      expect(top3[1]).toBeCloseTo(all[1], 9);
      expect(top3[2]).toBeCloseTo(all[2], 9);
    }
  });

  it('prefers unpenalised threads when a penalty is set', () => {
    const owned = new Set(['DMC:321', 'DMC:310', 'DMC:Blanc']);
    const prefer = new ThreadMatcher(dmc, (t) => (owned.has(t.key) ? 0 : 50));
    const m = prefer.nearest(rgbToLab([200, 20, 40]));
    expect(dmc[m.index].key).toBe('DMC:321');
  });
});
