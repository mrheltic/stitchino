/**
 * Product identity. The name also appears in index.html, the PWA manifest (vite.config.ts) and
 * `app.name` in the translations. Internal identifiers (IndexedDB name, localStorage keys) keep the
 * working name "puntocroce" so data saved by earlier builds stays readable.
 */
export const APP_NAME = 'Stitchino';

/** Where the app is published (GitHub Pages). Static pages and the sitemap use it for full URLs. */
export const SITE_URL = 'https://mrheltic.github.io/stitchino/';

/** The address as people would type it, for print: "mrheltic.github.io/stitchino". */
export const SITE_LABEL = SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '');

/**
 * External links. Leave a link empty until the page exists: the app only shows configured links,
 * and a link to an unclaimed donation page could send money to a stranger.
 */
export const LINKS = {
  /** Public repository */
  source: 'https://github.com/mrheltic/stitchino',
  /** One-off donations */
  kofi: 'https://ko-fi.com/mrheltic',
  /** Monthly sponsorship, e.g. https://github.com/sponsors/<user> */
  githubSponsors: '',
  /** Recurring donations without platform fees */
  liberapay: 'https://liberapay.com/mrheltic',
  /** Bug reports and ideas */
  issues: 'https://github.com/mrheltic/stitchino/issues',
} as const;

export type LinkKey = keyof typeof LINKS;

export const DONATION_LINKS = (['kofi', 'githubSponsors', 'liberapay'] as const).filter(
  (k) => LINKS[k] !== '',
);
