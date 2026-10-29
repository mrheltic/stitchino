/**
 * Builds src/core/threads/data/*.json from the vendored KXStitch schemes and computes
 * approximate DMC↔Anchor equivalences (nearest colour by CIEDE2000).
 * Usage: npm run build:threads
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deltaE2000, rgbToHex, rgbToLab, type Lab, type Rgb } from '../src/core/color/index.ts';
import type { Brand, EquivalenceDataFile, ThreadDataFile } from '../src/core/threads/types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'src/core/threads/data');

const SOURCES: Record<Brand, string> = {
  DMC: 'scripts/thread-sources/kxstitch/dmc.xml',
  Anchor: 'scripts/thread-sources/kxstitch/anchor.xml',
};

const FLOSS_RE =
  /<floss><name>(.*?)<\/name><description>(.*?)<\/description><color><red>(\d+)<\/red><green>(\d+)<\/green><blue>(\d+)<\/blue><\/color><\/floss>/g;

interface Parsed {
  code: string;
  name: string;
  rgb: Rgb;
  lab: Lab;
}

function parseScheme(brand: Brand): Parsed[] {
  const xml = readFileSync(join(root, SOURCES[brand]), 'utf8');
  const out: Parsed[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(FLOSS_RE)) {
    const code = m[1].trim();
    if (seen.has(code)) throw new Error(`${brand}: duplicate code ${code}`);
    seen.add(code);
    const rgb: Rgb = [Number(m[3]), Number(m[4]), Number(m[5])];
    if (rgb.some((v) => v > 255)) throw new Error(`${brand} ${code}: bad colour`);
    out.push({ code, name: m[2].trim(), rgb, lab: rgbToLab(rgb) });
  }
  const declared = (xml.match(/<floss>/g) ?? []).length;
  if (declared !== out.length) throw new Error(`${brand}: parsed ${out.length} of ${declared}`);
  return out;
}

function nearestMap(from: Parsed[], to: Parsed[]): Record<string, [string, number]> {
  const map: Record<string, [string, number]> = {};
  for (const f of from) {
    let best = to[0];
    let bestDe = Infinity;
    for (const t of to) {
      const de = deltaE2000(f.lab, t.lab);
      if (de < bestDe) {
        bestDe = de;
        best = t;
      }
    }
    map[f.code] = [best.code, Math.round(bestDe * 100) / 100];
  }
  return map;
}

function writeJson(file: string, data: unknown): void {
  // One thread (or one equivalence) per line keeps diffs readable.
  const text = JSON.stringify(data, null, 2)
    .replace(/\[\n\s+"([^"]*)",\n\s+"([^"]*)",\n\s+"([^"]*)"\n\s+\]/g, '["$1", "$2", "$3"]')
    .replace(/\[\n\s+"([^"]*)",\n\s+([\d.]+)\n\s+\]/g, '["$1", $2]');
  writeFileSync(join(outDir, file), text + '\n');
}

const parsed: Record<Brand, Parsed[]> = { DMC: parseScheme('DMC'), Anchor: parseScheme('Anchor') };

for (const brand of Object.keys(parsed) as Brand[]) {
  const file: ThreadDataFile = {
    brand,
    source: `KXStitch ${SOURCES[brand].split('/').pop()} (GPL-2.0-or-later), see scripts/thread-sources/kxstitch/README.md`,
    threads: parsed[brand].map((t) => [t.code, t.name, rgbToHex(t.rgb).slice(1)]),
  };
  writeJson(`${brand.toLowerCase()}.json`, file);
  console.log(`${brand}: ${file.threads.length} threads`);
}

const equivalences: EquivalenceDataFile = {
  method:
    'Nearest colour by CIEDE2000 on approximate sRGB values; not an official conversion chart.',
  map: {
    DMC: { Anchor: nearestMap(parsed.DMC, parsed.Anchor) },
    Anchor: { DMC: nearestMap(parsed.Anchor, parsed.DMC) },
  },
};
writeJson('equivalences.json', equivalences);
const des = Object.values(equivalences.map.DMC.Anchor).map(([, de]) => de);
console.log(
  `DMC→Anchor: median ΔE ${des.sort((a, b) => a - b)[Math.floor(des.length / 2)]}, max ${des[des.length - 1]}`,
);
