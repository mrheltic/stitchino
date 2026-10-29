/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

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
        name: 'PuntoCroce',
        short_name: 'PuntoCroce',
        description:
          'Schemi a punto croce dalle tue foto: crea, stampa e ricama. Gratis, open source, offline.',
        lang: 'it',
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
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Local tuning experiments (git-ignored) run only on request: EXP=1 npx vitest run tests/tmp-…
    exclude: process.env.EXP ? [] : ['tests/tmp-*', 'node_modules/**'],
    environment: 'node',
  },
});
