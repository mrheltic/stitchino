import dmcFile from './data/dmc.json';
import anchorFile from './data/anchor.json';
import equivalenceFile from './data/equivalences.json';
import { hexToRgb, rgbToLab, rgbToOklab, type Lab, type OkLab } from '../color/index.ts';
import {
  threadKey,
  type Brand,
  type EquivalenceDataFile,
  type Thread,
  type ThreadDataFile,
  type ThreadRef,
} from './types.ts';

export interface CatalogThread extends Thread {
  key: string;
  lab: Lab;
  oklab: OkLab;
}

function load(file: ThreadDataFile): CatalogThread[] {
  return file.threads.map(([code, name, hex]) => {
    const rgb = hexToRgb(hex);
    return {
      brand: file.brand,
      code,
      name,
      rgb,
      key: threadKey({ brand: file.brand, code }),
      lab: rgbToLab(rgb),
      oklab: rgbToOklab(rgb),
    };
  });
}

const catalog: Record<Brand, readonly CatalogThread[]> = {
  DMC: load(dmcFile as ThreadDataFile),
  Anchor: load(anchorFile as ThreadDataFile),
};

const byKey = new Map<string, CatalogThread>();
for (const list of Object.values(catalog)) for (const t of list) byKey.set(t.key, t);

const equivalences = (equivalenceFile as unknown as EquivalenceDataFile).map;

export function threadsOf(brand: Brand): readonly CatalogThread[] {
  return catalog[brand];
}

export function getThread(ref: ThreadRef | string): CatalogThread | undefined {
  return byKey.get(typeof ref === 'string' ? ref : threadKey(ref));
}

export function requireThread(ref: ThreadRef | string): CatalogThread {
  const t = getThread(ref);
  if (!t) throw new Error(`Unknown thread ${typeof ref === 'string' ? ref : threadKey(ref)}`);
  return t;
}

/** Closest thread of another brand, with the ΔE2000 between the two (approximate, not official). */
export function equivalentThread(
  ref: ThreadRef,
  to: Brand,
): { thread: CatalogThread; deltaE: number } | undefined {
  if (ref.brand === to) {
    const t = getThread(ref);
    return t && { thread: t, deltaE: 0 };
  }
  const entry = equivalences[ref.brand]?.[to]?.[ref.code];
  const thread = entry && getThread({ brand: to, code: entry[0] });
  return thread ? { thread, deltaE: entry[1] } : undefined;
}

/** Threads whose code starts with the query or whose name contains it (case-insensitive). */
export function searchThreads(query: string, brand?: Brand, limit = 50): CatalogThread[] {
  const q = query.trim().toLowerCase();
  const lists = brand ? [catalog[brand]] : Object.values(catalog);
  const codeHits: CatalogThread[] = [];
  const nameHits: CatalogThread[] = [];
  for (const list of lists) {
    for (const t of list) {
      if (!q) codeHits.push(t);
      else if (t.code.toLowerCase().startsWith(q)) codeHits.push(t);
      else if (t.name.toLowerCase().includes(q)) nameHits.push(t);
    }
  }
  codeHits.sort((a, b) => a.code.length - b.code.length);
  return codeHits.concat(nameHits).slice(0, limit);
}
