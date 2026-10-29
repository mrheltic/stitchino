import { getThread, threadsOf } from '../threads/catalog.ts';
import { BRANDS, type Brand, type ThreadRef } from '../threads/types.ts';

export interface InventoryItem {
  ref: ThreadRef;
  skeins: number;
}

const BRAND_ALIASES: Record<string, Brand> = { dmc: 'DMC', anchor: 'Anchor', anc: 'Anchor' };

/** The catalog spelling of a code typed by hand ("blanc" → "Blanc", "0310" → "310"). */
export function resolveCode(brand: Brand, raw: string): ThreadRef | undefined {
  const code = raw.trim();
  if (!code) return undefined;
  if (getThread({ brand, code })) return { brand, code };
  const lower = code.toLowerCase();
  const hit = threadsOf(brand).find((t) => t.code.toLowerCase() === lower);
  if (hit) return { brand, code: hit.code };
  // Leading zeros: "0310" is 310, but DMC's "01"…"35" keep theirs.
  const trimmed = code.replace(/^0+(?=\d)/, '');
  if (trimmed !== code) return resolveCode(brand, trimmed);
  return undefined;
}

/**
 * Codes typed in a list: separated by commas, spaces or semicolons, with ranges such as
 * "150-168" (only codes that exist are kept). Returns what was found and what wasn't.
 */
export function parseCodeList(
  text: string,
  brand: Brand,
): { refs: ThreadRef[]; unknown: string[] } {
  const refs: ThreadRef[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  const add = (ref: ThreadRef) => {
    if (seen.has(ref.code)) return;
    seen.add(ref.code);
    refs.push(ref);
  };
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(token);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      if (b - a > 1000) {
        unknown.push(token);
        continue;
      }
      let found = 0;
      for (const t of threadsOf(brand)) {
        if (!/^\d+$/.test(t.code)) continue;
        const n = Number(t.code);
        if (n >= a && n <= b) {
          add({ brand, code: t.code });
          found++;
        }
      }
      if (!found) unknown.push(token);
      continue;
    }
    const ref = resolveCode(brand, token);
    if (ref) add(ref);
    else unknown.push(token);
  }
  return { refs, unknown };
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Reads an inventory CSV: "brand,code,skeins" per line (header optional, ";" also accepted);
 * lines with only a code (and a quantity) use `defaultBrand`. Unknown codes are reported.
 */
export function parseInventoryCsv(
  text: string,
  defaultBrand: Brand = 'DMC',
): { items: InventoryItem[]; unknown: string[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim());
  // The separator most used in the first line: "," or ";" (spreadsheets in Italian) or tab.
  const count = (c: string) => lines[0]?.split(c).length ?? 0;
  const sep = [';', '\t'].find((c) => count(c) > count(',')) ?? ',';
  const items = new Map<string, InventoryItem>();
  const unknown: string[] = [];
  // With a header, columns are found by name; otherwise "brand, code, skeins" or "code, skeins".
  const header = splitCsvLine(lines[0] ?? '', sep).map((h) => h.toLowerCase());
  const column = (re: RegExp) => header.findIndex((h) => re.test(h));
  const named = {
    brand: column(/^(brand|marca)$/),
    code: column(/^(code|codice|number|numero|n\.?|colou?r|colore)$/),
    qty: column(/^(skeins|matasse|quantity|quantit[àa]|qty|q\.?t[àa]|count)$/),
  };
  const hasHeader = named.code >= 0;
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitCsvLine(line, sep);
    // Positional reading, or by header name when the row has those columns.
    let brand: Brand | undefined = BRAND_ALIASES[cells[0]?.toLowerCase()];
    let [code, qty]: (string | undefined)[] = brand ? [cells[1], cells[2]] : [cells[0], cells[1]];
    if (hasHeader && cells.length > named.code) {
      brand = named.brand >= 0 ? BRAND_ALIASES[cells[named.brand]?.toLowerCase()] : undefined;
      code = cells[named.code];
      qty = named.qty >= 0 ? cells[named.qty] : undefined;
    }
    if (!code) continue;
    const ref = resolveCode(brand ?? defaultBrand, code);
    if (!ref) {
      unknown.push(line.trim());
      continue;
    }
    const n = qty === undefined || qty === '' ? 1 : Number(qty.replace(',', '.'));
    const skeins = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 1;
    const key = `${ref.brand}:${ref.code}`;
    const prev = items.get(key);
    items.set(key, { ref, skeins: (prev?.skeins ?? 0) + skeins });
  }
  return { items: [...items.values()], unknown };
}

/** CSV with a header, sorted by brand and code. */
export function inventoryCsv(items: readonly InventoryItem[]): string {
  const order = (b: Brand) => BRANDS.indexOf(b);
  const sorted = [...items].sort(
    (a, b) =>
      order(a.ref.brand) - order(b.ref.brand) ||
      a.ref.code.localeCompare(b.ref.code, 'en', { numeric: true }),
  );
  const esc = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ['brand,code,name,skeins'];
  for (const { ref, skeins } of sorted)
    lines.push(
      [ref.brand, ref.code, getThread(ref)?.name ?? '', String(skeins)].map(esc).join(','),
    );
  return lines.join('\n') + '\n';
}
