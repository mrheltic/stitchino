import Dexie, { type EntityTable } from 'dexie';
import type { PatternSource } from '../core/model/pattern.ts';
import type { Brand } from '../core/threads/types.ts';

export interface ProjectRow {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  colors: number;
  stitches: number;
  source: PatternSource;
  /** Imported from another designer's PDF: personal use only, never exported or shared. */
  imported: boolean;
  /** PNG preview. */
  thumbnail?: Blob;
  /** The pattern as a project file (without source photo and progress). */
  data: Uint8Array;
}

export interface SourceRow {
  projectId: string;
  bytes: Uint8Array;
  mime: string;
  /** Wizard settings, to regenerate the pattern from the photo. */
  settings?: unknown;
}

export interface ProgressRow {
  projectId: string;
  /** One bit per cell: full stitch done. */
  bits: Uint8Array;
  done: number;
  updatedAt: number;
  /** Stitches marked per local day (YYYY-MM-DD). */
  daily: Record<string, number>;
  /** Partial stitches, backstitch, parking marks and bookmarks (stitching mode). */
  extras?: unknown;
}

export interface InventoryRow {
  /** Thread key, e.g. "DMC:310". */
  key: string;
  brand: Brand;
  code: string;
  skeins: number;
  updatedAt: number;
}

export class StitchinoDb extends Dexie {
  projects!: EntityTable<ProjectRow, 'id'>;
  sources!: EntityTable<SourceRow, 'projectId'>;
  progress!: EntityTable<ProgressRow, 'projectId'>;
  inventory!: EntityTable<InventoryRow, 'key'>;

  // Database name from the working title, kept so data from earlier builds stays.
  constructor(name = 'puntocroce') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      sources: 'projectId',
      progress: 'projectId',
      inventory: 'key, brand',
    });
  }
}

export const db = new StitchinoDb();

/** Asks the browser not to evict our data under storage pressure (Safari is aggressive). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
