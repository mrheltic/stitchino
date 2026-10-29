import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import {
  MAX_SIDE,
  createPattern,
  isValidPartialMask,
  type Backstitch,
  type Fabric,
  type Knot,
  type PaletteEntry,
  type PartialStitch,
  type Pattern,
  type PatternMeta,
} from '../model/pattern.ts';
import { BRANDS, type ThreadRef } from '../threads/types.ts';

/**
 * `.puntocroce` project file: a zip with
 * - project.json: format marker, version and everything but the cells;
 * - cells.bin: full stitches as little-endian uint16 palette ids, row-major;
 * - progress.bin (optional): stitched-cell bitset; source.* (optional): the original photo.
 */
export const PROJECT_FORMAT = 'puntocroce';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.puntocroce';

export interface ProjectSource {
  bytes: Uint8Array;
  mime: string;
  /** Wizard settings used to create the pattern, to regenerate it later. */
  settings?: unknown;
}

export interface ProjectBundle {
  pattern: Pattern;
  source?: ProjectSource;
  /** One bit per cell, set when the full stitch has been stitched. */
  progress?: Uint8Array;
}

interface ProjectJson {
  format: typeof PROJECT_FORMAT;
  version: number;
  width: number;
  height: number;
  palette: PaletteEntry[];
  fabric: Fabric;
  meta: PatternMeta;
  partials: [number, PartialStitch[]][];
  backstitches: Backstitch[];
  knots: Knot[];
  source?: { file: string; mime: string; settings?: unknown };
}

export class InvalidProjectFileError extends Error {
  constructor(reason: string) {
    super(`Invalid project file: ${reason}`);
    this.name = 'InvalidProjectFileError';
  }
}

export function encodeProject(bundle: ProjectBundle): Uint8Array {
  const p = bundle.pattern;
  const json: ProjectJson = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    width: p.width,
    height: p.height,
    palette: p.palette,
    fabric: p.fabric,
    meta: p.meta,
    partials: [...p.partials.entries()],
    backstitches: p.backstitches,
    knots: p.knots,
  };
  const files: Record<string, Uint8Array> = { 'cells.bin': u16ToBytes(p.cells) };
  if (bundle.source) {
    const file = `source.${extensionFor(bundle.source.mime)}`;
    json.source = { file, mime: bundle.source.mime, settings: bundle.source.settings };
    files[file] = bundle.source.bytes;
  }
  if (bundle.progress) files['progress.bin'] = bundle.progress;
  files['project.json'] = strToU8(JSON.stringify(json));
  // Photos are already compressed; storing them avoids wasting time on deflate.
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, data]) => [
        name,
        [data, { level: name.startsWith('source.') ? 0 : 6 }],
      ]),
    ),
  );
}

export function decodeProject(bytes: Uint8Array): ProjectBundle {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new InvalidProjectFileError('not a zip archive');
  }
  const jsonBytes = files['project.json'];
  if (!jsonBytes) throw new InvalidProjectFileError('project.json missing');
  let json: ProjectJson;
  try {
    json = JSON.parse(strFromU8(jsonBytes));
  } catch {
    throw new InvalidProjectFileError('project.json is not valid JSON');
  }
  if (json?.format !== PROJECT_FORMAT) throw new InvalidProjectFileError('unknown format');
  if (json.version > PROJECT_VERSION)
    throw new InvalidProjectFileError('made by a newer version of PuntoCroce');

  const { width, height } = json;
  if (!isInt(width, 1, MAX_SIDE) || !isInt(height, 1, MAX_SIDE))
    throw new InvalidProjectFileError('bad size');
  const cellBytes = files['cells.bin'];
  if (!cellBytes || cellBytes.length !== width * height * 2)
    throw new InvalidProjectFileError('bad cells');

  const palette = validatePalette(json.palette);
  const ids = new Set(palette.map((e) => e.id));
  const cells = bytesToU16(cellBytes);
  for (const c of cells)
    if (c !== 0 && !ids.has(c)) throw new InvalidProjectFileError(`unknown colour id ${c}`);

  const partials = new Map<number, PartialStitch[]>();
  for (const entry of arrayOr(json.partials)) {
    const [index, list] = entry as [unknown, unknown];
    if (!isInt(index, 0, width * height - 1) || !Array.isArray(list))
      throw new InvalidProjectFileError('bad partial');
    let used = 0;
    const stitches: PartialStitch[] = [];
    for (const s of list as PartialStitch[]) {
      if (!isValidPartialMask(s?.mask) || !ids.has(s.id) || used & s.mask)
        throw new InvalidProjectFileError('bad partial');
      used |= s.mask;
      stitches.push({ mask: s.mask, id: s.id });
    }
    if (stitches.length) partials.set(index as number, stitches);
  }
  const backstitches = arrayOr(json.backstitches).map((b) => {
    const s = b as Backstitch;
    if (
      ![s.x1, s.x2].every((v) => isInt(v, 0, 2 * width)) ||
      ![s.y1, s.y2].every((v) => isInt(v, 0, 2 * height)) ||
      !ids.has(s.id)
    ) {
      throw new InvalidProjectFileError('bad backstitch');
    }
    return { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, id: s.id };
  });
  const knots = arrayOr(json.knots).map((k) => {
    const s = k as Knot;
    if (!isInt(s.x, 0, 2 * width) || !isInt(s.y, 0, 2 * height) || !ids.has(s.id)) {
      throw new InvalidProjectFileError('bad knot');
    }
    return { x: s.x, y: s.y, id: s.id };
  });

  const pattern = createPattern(width, height, {
    cells,
    partials,
    backstitches,
    knots,
    palette,
    fabric: validateFabric(json.fabric),
    meta: validateMeta(json.meta),
  });
  const bundle: ProjectBundle = { pattern };
  if (json.source && files[json.source.file]) {
    bundle.source = {
      bytes: files[json.source.file],
      mime: String(json.source.mime),
      settings: json.source.settings,
    };
  }
  const progress = files['progress.bin'];
  if (progress) {
    if (progress.length !== Math.ceil((width * height) / 8))
      throw new InvalidProjectFileError('bad progress');
    bundle.progress = progress;
  }
  return bundle;
}

function validatePalette(value: unknown): PaletteEntry[] {
  const seen = new Set<number>();
  return arrayOr(value).map((v) => {
    const e = v as PaletteEntry;
    if (!isInt(e?.id, 1, 0xffff) || seen.has(e.id))
      throw new InvalidProjectFileError('bad palette id');
    seen.add(e.id);
    const threads = arrayOr(e.threads).map((t) => {
      const r = t as ThreadRef;
      if (
        !(BRANDS as readonly string[]).includes(r?.brand) ||
        typeof r.code !== 'string' ||
        !r.code
      ) {
        throw new InvalidProjectFileError('bad thread');
      }
      return { brand: r.brand, code: r.code };
    });
    if (threads.length < 1 || threads.length > 2)
      throw new InvalidProjectFileError('bad thread list');
    return {
      id: e.id,
      threads,
      symbol: typeof e.symbol === 'string' ? e.symbol.slice(0, 2) : '',
      strands: isInt(e.strands, 1, 6) ? e.strands : 2,
      backStrands: isInt(e.backStrands, 1, 6) ? e.backStrands : 1,
    };
  });
}

function validateFabric(value: unknown): Fabric {
  const f = value as Fabric;
  const kind = (['aida', 'evenweave', 'linen'] as const).find((k) => k === f?.kind) ?? 'aida';
  return {
    kind,
    count: isInt(f?.count, 6, 60) ? f.count : 14,
    over: f?.over === 2 ? 2 : 1,
    color: typeof f?.color === 'string' && /^#[0-9a-f]{6}$/i.test(f.color) ? f.color : '#ffffff',
  };
}

function validateMeta(value: unknown): PatternMeta {
  const m = (value ?? {}) as PatternMeta;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
  const source =
    (['photo', 'blank', 'file', 'pdf-import'] as const).find((s) => s === m.source) ?? 'file';
  return {
    title: text(m.title, 200) ?? '',
    author: text(m.author, 200),
    copyright: text(m.copyright, 500),
    notes: text(m.notes, 10000),
    source,
  };
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function arrayOr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function u16ToBytes(a: Uint16Array): Uint8Array {
  const out = new Uint8Array(a.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < a.length; i++) view.setUint16(i * 2, a[i], true);
  return out;
}

function bytesToU16(b: Uint8Array): Uint16Array {
  const out = new Uint16Array(b.length / 2);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

function extensionFor(mime: string): string {
  return (
    { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] ??
    'bin'
  );
}
