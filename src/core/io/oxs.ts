import { APP_NAME } from '../brand.ts';
import { hexToRgb, rgbToHex, rgbToLab } from '../color/index.ts';
import { entryRgb } from '../model/entryColor.ts';
import {
  ARM,
  FULL_MASK,
  HALF_BACKSLASH,
  HALF_SLASH,
  MAX_SIDE,
  createPattern,
  type FabricKind,
  type PaletteEntry,
  type PartialStitch,
  type Pattern,
} from '../model/pattern.ts';
import { assignSymbols, SYMBOLS } from '../model/symbols.ts';
import { ThreadMatcher, getThread, threadsOf } from '../threads/index.ts';
import type { Brand, ThreadRef } from '../threads/types.ts';

/**
 * Open Cross-Stitch (OXS) interchange format, created by Ursa Software and supported by
 * WinStitch/MacStitch, FlossCross, Pixel-Stitch, Embroiderly and others. Coordinates are in cells
 * (0-based); backstitch ends and knots may fall on half cells.
 * Spec: https://github.com/embroidery-space/xsp-specs/blob/main/ursa/oxs.md (MIT).
 */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// Three-quarter stitches: (direction, side) ↔ our arm mask. Direction 2 splits the cell along "/"
// (left = top-left triangle), direction 1 along "\" (left = bottom-left triangle).
const THREE_QUARTER: { mask: number; direction: 1 | 2; side: 1 | 2 }[] = [
  { mask: FULL_MASK & ~ARM.BR, direction: 2, side: 1 }, // top-left
  { mask: FULL_MASK & ~ARM.TL, direction: 2, side: 2 }, // bottom-right
  { mask: FULL_MASK & ~ARM.TR, direction: 1, side: 1 }, // bottom-left
  { mask: FULL_MASK & ~ARM.BL, direction: 1, side: 2 }, // top-right
];
const QUARTER_OFFSET: Record<number, [number, number]> = {
  [ARM.TL]: [0, 0],
  [ARM.TR]: [0.5, 0],
  [ARM.BL]: [0, 0.5],
  [ARM.BR]: [0.5, 0.5],
};

export function exportOxs(p: Pattern, software = APP_NAME, version = '1'): string {
  const index = new Map(p.palette.map((e, i) => [e.id, i + 1]));
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<chart>'];
  out.push(
    `<properties oxsversion="1.0" software="${esc(software)}" software_version="${esc(version)}" chartwidth="${p.width}" chartheight="${p.height}" charttitle="${esc(p.meta.title)}" author="${esc(p.meta.author ?? '')}" copyright="${esc(p.meta.copyright ?? '')}" instructions="${esc(p.meta.notes ?? '')}" stitchesperinch="${num(p.fabric.count / p.fabric.over)}" palettecount="${p.palette.length}"/>`,
  );
  const kind = { aida: 'Aida', evenweave: 'Evenweave', linen: 'Linen' }[p.fabric.kind];
  out.push('<palette>');
  out.push(
    `<palette_item index="0" number="cloth" name="cloth" color="${p.fabric.color.slice(1).toUpperCase()}" kind="${kind}"/>`,
  );
  p.palette.forEach((e, i) => {
    const colour = rgbToHex(entryRgb(e)).slice(1).toUpperCase();
    const names = e.threads.map((t) => getThread(t)?.name ?? '').join(' + ');
    const number =
      e.threads.length > 1
        ? `${e.threads[0].brand} ${e.threads[0].code} [+]`
        : `${e.threads[0].brand} ${e.threads[0].code}`;
    const attrs = `index="${i + 1}" number="${esc(number)}" name="${esc(names)}" color="${colour}" printcolor="${colour}" strands="${e.strands}" bsstrands="${e.backStrands}" bscolor="${colour}" symbol="${esc(e.symbol)}"`;
    if (e.threads.length > 1) {
      out.push(`<palette_item ${attrs}>`);
      for (const t of e.threads) {
        const th = getThread(t);
        out.push(
          `<blend number="${esc(`${t.brand} ${t.code}`)}" name="${esc(th?.name ?? '')}" color="${th ? rgbToHex(th.rgb).slice(1).toUpperCase() : 'FF00FF'}" strands="1"/>`,
        );
      }
      out.push('</palette_item>');
    } else {
      out.push(`<palette_item ${attrs}/>`);
    }
  });
  out.push('</palette>');

  out.push('<fullstitches>');
  for (let i = 0; i < p.cells.length; i++) {
    const id = p.cells[i];
    if (id)
      out.push(
        `<stitch x="${i % p.width}" y="${Math.floor(i / p.width)}" palindex="${index.get(id)}"/>`,
      );
  }
  out.push('</fullstitches>');

  const objects: string[] = [];
  out.push('<partstitches>');
  for (const [i, list] of p.partials) {
    const x = i % p.width;
    const y = Math.floor(i / p.width);
    for (const s of list) {
      const pal = index.get(s.id);
      if (s.mask === HALF_SLASH || s.mask === HALF_BACKSLASH) {
        out.push(
          `<partstitch x="${x}" y="${y}" palindex1="${pal}" palindex2="0" direction="${s.mask === HALF_SLASH ? 3 : 4}"/>`,
        );
        continue;
      }
      const tq = THREE_QUARTER.find((q) => q.mask === s.mask);
      if (tq) {
        out.push(
          `<partstitch x="${x}" y="${y}" palindex1="${tq.side === 1 ? pal : 0}" palindex2="${tq.side === 2 ? pal : 0}" direction="${tq.direction}"/>`,
        );
        continue;
      }
      const off = QUARTER_OFFSET[s.mask];
      if (off)
        objects.push(
          `<object x1="${num(x + off[0])}" y1="${num(y + off[1])}" palindex="${pal}" objecttype="quarter"/>`,
        );
    }
  }
  out.push('</partstitches>');

  out.push('<backstitches>');
  for (const b of p.backstitches) {
    out.push(
      `<backstitch x1="${num(b.x1 / 2)}" y1="${num(b.y1 / 2)}" x2="${num(b.x2 / 2)}" y2="${num(b.y2 / 2)}" palindex="${index.get(b.id)}" objecttype="backstitch" sequence="0"/>`,
    );
  }
  out.push('</backstitches>');
  for (const k of p.knots)
    objects.push(
      `<object x1="${num(k.x / 2)}" y1="${num(k.y / 2)}" palindex="${index.get(k.id)}" objecttype="knot"/>`,
    );
  out.push('<ornaments_inc_knots_and_beads>', ...objects, '</ornaments_inc_knots_and_beads>');
  out.push('</chart>');
  return out.join('\n') + '\n';
}

export interface OxsImportReport {
  /** Colours whose brand or code we don't know, replaced by the nearest DMC thread. */
  substituted: { original: string; replacement: string }[];
  /** Stitch objects we can't represent (beads, special stitches) and skipped. */
  skipped: number;
}

export class InvalidOxsError extends Error {
  constructor(reason: string) {
    super(`Invalid OXS file: ${reason}`);
    this.name = 'InvalidOxsError';
  }
}

const BRAND_ALIASES: Record<string, Brand> = {
  dmc: 'DMC',
  anchor: 'Anchor',
  anc: 'Anchor',
  'anc.': 'Anchor',
};

export function importOxs(xml: string): { pattern: Pattern; report: OxsImportReport } {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new InvalidOxsError('not well-formed XML');
  const chart = doc.getElementsByTagName('chart')[0];
  if (!chart) throw new InvalidOxsError('no <chart> element');
  const report: OxsImportReport = { substituted: [], skipped: 0 };
  const attr = (el: Element, name: string) => el.getAttribute(name) ?? '';
  const number = (v: string) => Number(v.replace(',', '.'));

  const props = chart.getElementsByTagName('properties')[0];
  // Size: declared, or large enough for the stitches when missing.
  const all = (tag: string) => [...chart.getElementsByTagName(tag)];
  const coords = [...all('stitch'), ...all('partstitch')].map((s) => [
    number(attr(s, 'x')),
    number(attr(s, 'y')),
  ]);
  let width = props ? Math.round(number(attr(props, 'chartwidth'))) : 0;
  let height = props ? Math.round(number(attr(props, 'chartheight'))) : 0;
  if (!(width > 0)) width = Math.max(1, ...coords.map(([x]) => (Number.isFinite(x) ? x + 1 : 1)));
  if (!(height > 0))
    height = Math.max(1, ...coords.map(([, y]) => (Number.isFinite(y) ? y + 1 : 1)));
  if (width > MAX_SIDE || height > MAX_SIDE) throw new InvalidOxsError('pattern too large');

  const spi = props ? number(attr(props, 'stitchesperinch')) : NaN;
  const items = all('palette_item');
  const cloth = items.find((i) => attr(i, 'index') === '0') ?? items[0];
  const clothColour =
    cloth && /^[0-9a-f]{6}$/i.test(attr(cloth, 'color'))
      ? `#${attr(cloth, 'color').toLowerCase()}`
      : '#ffffff';
  const kindAttr = cloth ? attr(cloth, 'kind').toLowerCase() : '';
  const kind: FabricKind =
    kindAttr === 'evenweave' ? 'evenweave' : kindAttr === 'linen' ? 'linen' : 'aida';
  const over = kind === 'aida' ? 1 : 2;
  const count = Number.isFinite(spi) && spi > 0 ? Math.round(spi * over) : 14;

  const p = createPattern(width, height, {
    fabric: { kind, count: Math.min(60, Math.max(6, count)), over, color: clothColour },
    meta: {
      title: props ? attr(props, 'charttitle').slice(0, 200) : '',
      author: props ? attr(props, 'author').slice(0, 200) || undefined : undefined,
      copyright: props ? attr(props, 'copyright').slice(0, 500) || undefined : undefined,
      notes: props ? attr(props, 'instructions').slice(0, 10000) || undefined : undefined,
      source: 'file',
    },
  });

  // Palette: OXS index → our palette id.
  const matcher = new ThreadMatcher(threadsOf('DMC'));
  const idOf = new Map<number, number>();
  const entries: PaletteEntry[] = [];
  for (const item of items) {
    if (item === cloth) continue;
    const index = Number(attr(item, 'index') || entries.length + 1);
    const colour = /^[0-9a-f]{6}$/i.test(attr(item, 'color'))
      ? hexToRgb(attr(item, 'color'))
      : ([255, 0, 255] as const);
    const blends = [...item.getElementsByTagName('blend')];
    const refs = (blends.length ? blends.map((b) => attr(b, 'number')) : [attr(item, 'number')])
      .slice(0, 2)
      .map((n) => resolveThread(n, colour, matcher, report));
    const id = entries.length + 1;
    const strands = Math.round(number(attr(item, 'strands')));
    const backStrands = Math.round(number(attr(item, 'bsstrands')));
    const rawSymbol = attr(item, 'symbol');
    const symbol =
      /^\d+$/.test(rawSymbol) && Number(rawSymbol) > 32
        ? String.fromCodePoint(Number(rawSymbol))
        : rawSymbol;
    entries.push({
      id,
      threads: refs,
      symbol: SYMBOLS.includes(symbol) ? symbol : '',
      strands: strands >= 1 && strands <= 6 ? strands : 2,
      backStrands: backStrands >= 1 && backStrands <= 6 ? backStrands : 1,
    });
    idOf.set(index, id);
  }
  assignSymbols(entries);
  p.palette = entries;

  const inside = (x: number, y: number) =>
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
  const addPartial = (i: number, s: PartialStitch) => {
    const list = p.partials.get(i) ?? [];
    if (list.some((q) => q.mask & s.mask)) return;
    list.push(s);
    p.partials.set(i, list);
  };

  for (const s of all('stitch')) {
    const x = number(attr(s, 'x'));
    const y = number(attr(s, 'y'));
    const id = idOf.get(Number(attr(s, 'palindex')));
    if (!id || !inside(x, y)) continue;
    p.cells[y * width + x] = id;
  }
  for (const s of all('partstitch')) {
    const x = number(attr(s, 'x'));
    const y = number(attr(s, 'y'));
    if (!inside(x, y)) continue;
    const i = y * width + x;
    if (p.cells[i]) continue;
    const dir = Number(attr(s, 'direction'));
    const id1 = idOf.get(Number(attr(s, 'palindex1')));
    const id2 = idOf.get(Number(attr(s, 'palindex2')));
    if (dir === 3 || dir === 4) {
      if (id1) addPartial(i, { mask: dir === 3 ? HALF_SLASH : HALF_BACKSLASH, id: id1 });
    } else if (dir === 1 || dir === 2) {
      // Both sides set: the first keeps the long leg, the second becomes a quarter.
      const left = THREE_QUARTER.find((q) => q.direction === dir && q.side === 1)!;
      const right = THREE_QUARTER.find((q) => q.direction === dir && q.side === 2)!;
      if (id1) addPartial(i, { mask: left.mask, id: id1 });
      if (id2) addPartial(i, { mask: id1 ? FULL_MASK & ~left.mask : right.mask, id: id2 });
    } else report.skipped++;
  }
  for (const b of all('backstitch')) {
    const id = idOf.get(Number(attr(b, 'palindex')));
    const hx = [attr(b, 'x1'), attr(b, 'y1'), attr(b, 'x2'), attr(b, 'y2')].map((v) =>
      Math.round(number(v) * 2),
    );
    if (!id || hx.some((v) => !Number.isFinite(v) || v < 0)) continue;
    const [x1, y1, x2, y2] = hx;
    if (
      x1 > 2 * width ||
      x2 > 2 * width ||
      y1 > 2 * height ||
      y2 > 2 * height ||
      (x1 === x2 && y1 === y2)
    )
      continue;
    p.backstitches.push({ x1, y1, x2, y2, id });
  }
  for (const o of all('object')) {
    const id = idOf.get(Number(attr(o, 'palindex')));
    const type = attr(o, 'objecttype');
    const x = number(attr(o, 'x1'));
    const y = number(attr(o, 'y1'));
    if (!id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (type === 'knot') {
      const k = { x: Math.round(x * 2), y: Math.round(y * 2), id };
      if (k.x >= 0 && k.y >= 0 && k.x <= 2 * width && k.y <= 2 * height) p.knots.push(k);
    } else if (type === 'quarter') {
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (!inside(cx, cy) || p.cells[cy * width + cx]) continue;
      const fx = x - cx >= 0.5 ? 1 : 0;
      const fy = y - cy >= 0.5 ? 1 : 0;
      addPartial(cy * width + cx, { mask: fy ? (fx ? ARM.BR : ARM.BL) : fx ? ARM.TR : ARM.TL, id });
    } else report.skipped++;
  }
  return { pattern: p, report };
}

/** "DMC 310", "DMC    310", "Anchor 403 [+]" → a thread we know, or the nearest DMC by colour. */
function resolveThread(
  raw: string,
  colour: readonly [number, number, number],
  matcher: ThreadMatcher,
  report: OxsImportReport,
): ThreadRef {
  const norm = raw.replace('[+]', '').trim().replace(/\s+/g, ' ');
  const cut = norm.lastIndexOf(' ');
  const brandRaw = cut > 0 ? norm.slice(0, cut) : '';
  const code = cut > 0 ? norm.slice(cut + 1) : norm;
  const brand = BRAND_ALIASES[brandRaw.toLowerCase()];
  if (brand) {
    const t = getThread({ brand, code }) ?? getThread({ brand, code: normaliseCode(brand, code) });
    if (t) return { brand: t.brand, code: t.code };
  }
  const nearest = matcher.threads[matcher.nearest(rgbToLab(colour)).index];
  report.substituted.push({ original: norm || '?', replacement: `DMC ${nearest.code}` });
  return { brand: 'DMC', code: nearest.code };
}

/** DMC writes its 2017 colours as 01–35; files may say "1", "0001", "BLANC" or "White". */
function normaliseCode(brand: Brand, code: string): string {
  const lower = code.toLowerCase();
  if (brand === 'DMC') {
    if (lower === 'blanc' || lower === 'white') return 'Blanc';
    if (lower === 'ecru') return 'Ecru';
    if (lower === 'b5200') return 'B5200';
    if (/^\d+$/.test(code)) {
      const n = Number(code);
      return n <= 35 ? String(n).padStart(2, '0') : String(n);
    }
  }
  return /^\d+$/.test(code) ? String(Number(code)) : code;
}
