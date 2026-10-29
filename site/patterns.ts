/**
 * The free pattern library. Each pattern has a folder in site/patterns/<slug>/ with:
 * - `pattern.stitchino`: the project file exported from Stitchino (it holds the picture and the
 *   settings used, so the page can offer "Change it in Stitchino");
 * - `preview.jpg` (or `.png`): the stitched preview (Real size → From afar → Download the image).
 * Pages, PDFs and the sitemap are generated at build time (see build.ts).
 */
export interface FreePattern {
  /** English slug: folder name, asset path and English page. */
  slug: string;
  /** Italian slug, for the Italian page. */
  slugIt: string;
  title: { en: string; it: string };
  description: { en: string; it: string };
  /** Where the picture comes from. Only own drawings or public-domain (CC0) pictures. */
  credit: { en: string; it: string };
  creditUrl?: string;
  /** Publication date, YYYY-MM-DD (newest first in the index). */
  date: string;
}

export const FREE_PATTERNS: FreePattern[] = [
  {
    slug: 'lighthouse-at-sunset',
    slugIt: 'faro-al-tramonto',
    title: { en: 'Lighthouse at sunset', it: 'Faro al tramonto' },
    description: {
      en: 'A red and white lighthouse on a cliff, with the sun going down over the sea and a small sailing boat.',
      it: 'Un faro bianco e rosso sulla scogliera, il sole che tramonta sul mare e una piccola barca a vela.',
    },
    credit: {
      en: 'Original drawing made for Stitchino.',
      it: 'Disegno originale fatto per Stitchino.',
    },
    date: '2026-10-29',
  },
];
