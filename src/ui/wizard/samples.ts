/**
 * Pictures the wizard can open by path, from this same site: the example on the photo step and
 * the originals of the free patterns ("Open in Stitchino" links). Nothing is fetched from elsewhere.
 */
export const EXAMPLE_PICTURE = 'samples/lighthouse.png';

const PICTURE_PATH = /^(?:samples|patterns\/[a-z0-9-]+)\/[a-z0-9-]+\.(?:png|jpe?g|webp)$/;

export function isPicturePath(path: string): boolean {
  return PICTURE_PATH.test(path);
}

export async function fetchPicture(path: string): Promise<File | null> {
  if (!isPicturePath(path)) return null;
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new File([blob], path.slice(path.lastIndexOf('/') + 1), { type: blob.type });
  } catch {
    return null;
  }
}

/** Wizard settings carried by an "Open in Stitchino" link: `w`, `colors` and `title`. */
export function linkSettings(query: string): Record<string, unknown> {
  const search = new URLSearchParams(query);
  const int = (key: string) => {
    const v = Number(search.get(key));
    return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
  };
  return { width: int('w'), maxColors: int('colors'), title: search.get('title') ?? '' };
}
