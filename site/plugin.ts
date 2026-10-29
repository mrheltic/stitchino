import type { Plugin } from 'vite';
import { buildSite } from './build.ts';

/**
 * Adds the static pages (landing pages, free patterns, sitemap) to the production build, next to
 * the app. They are plain HTML, so search engines can read them without running the app.
 */
export function staticSite(root: string): Plugin {
  return {
    name: 'stitchino-static-site',
    apply: 'build',
    async generateBundle() {
      for (const file of await buildSite(root)) {
        this.emitFile({ type: 'asset', fileName: file.fileName, source: file.source });
      }
    },
  };
}
