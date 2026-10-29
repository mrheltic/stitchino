/**
 * Product identity. The name also appears in index.html, the PWA manifest (vite.config.ts) and
 * `app.name` in the translations. Internal identifiers (IndexedDB name, localStorage keys) keep the
 * working name "puntocroce" so data saved by earlier builds stays readable.
 */
export const APP_NAME = 'Stitchino';

/**
 * External links. Leave a link empty until the page exists: the app only shows configured links,
 * and a link to an unclaimed donation page could send money to a stranger.
 */
export const LINKS = {
  /** Public repository, e.g. https://github.com/<user>/stitchino */
  source: '',
  /** One-off donations, e.g. https://ko-fi.com/<name> */
  kofi: '',
  /** Monthly sponsorship, e.g. https://github.com/sponsors/<user> */
  githubSponsors: '',
  /** Recurring donations without platform fees, e.g. https://liberapay.com/<name> */
  liberapay: '',
  /** Bug reports and ideas, e.g. https://github.com/<user>/stitchino/issues */
  issues: '',
} as const;

export type LinkKey = keyof typeof LINKS;

export const DONATION_LINKS = (['kofi', 'githubSponsors', 'liberapay'] as const).filter(
  (k) => LINKS[k] !== '',
);
