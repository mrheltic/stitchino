/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };
import { staticSite } from './site/plugin.ts';

export default defineConfig({
  // Relative base: the app works from any sub-path (GitHub Pages project sites).
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'fonts/*.ttf'],
      manifest: {
        name: 'Stitchino',
        short_name: 'Stitchino',
        description:
          'Turn photos into cross-stitch patterns, print them and track your stitching. Free, open source, works offline.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#faf7f2',
        theme_color: '#9e2f45',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ttf,woff2,json}'],
        // The static pages and free patterns are ordinary web pages: not part of the offline app.
        globIgnores: [
          'patterns/**',
          'it/**',
          'photo-to-cross-stitch-pattern/**',
          'site/**',
          'pins/**',
        ],
        navigateFallbackDenylist: [/\/(patterns|it|photo-to-cross-stitch-pattern)\//],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
    staticSite(process.cwd()),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Local tuning experiments (git-ignored) run only on request: EXP=1 npx vitest run tests/tmp-…
    exclude: process.env.EXP ? [] : ['tests/tmp-*', 'node_modules/**'],
    environment: 'node',
  },
});
