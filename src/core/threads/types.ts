import type { Rgb } from '../color/srgb.ts';

export const BRANDS = ['DMC', 'Anchor'] as const;
export type Brand = (typeof BRANDS)[number];

export interface ThreadRef {
  brand: Brand;
  code: string;
}

export interface Thread extends ThreadRef {
  name: string;
  /** Approximate on-screen colour: manufacturers publish no official RGB values. */
  rgb: Rgb;
}

/** Shape of the generated files in `data/`. */
export interface ThreadDataFile {
  brand: Brand;
  source: string;
  threads: [code: string, name: string, hex: string][];
}

export interface EquivalenceDataFile {
  method: string;
  /** from brand → to brand → code → [equivalent code, ΔE2000] */
  map: Record<string, Record<string, Record<string, [string, number]>>>;
}

export function threadKey(ref: ThreadRef): string {
  return `${ref.brand}:${ref.code}`;
}

export function parseThreadKey(key: string): ThreadRef {
  const i = key.indexOf(':');
  const brand = key.slice(0, i);
  if (i < 0 || !(BRANDS as readonly string[]).includes(brand)) {
    throw new Error(`Invalid thread key: ${key}`);
  }
  return { brand: brand as Brand, code: key.slice(i + 1) };
}

export function sameThread(a: ThreadRef, b: ThreadRef): boolean {
  return a.brand === b.brand && a.code === b.code;
}
