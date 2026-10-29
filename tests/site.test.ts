import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../src/core/brand.ts';
import { isPicturePath, linkSettings } from '../src/ui/wizard/samples.ts';
import { buildSite, sitePaths } from '../site/build.ts';
import { FREE_PATTERNS } from '../site/patterns.ts';

describe('static site', async () => {
  const files = new Map((await buildSite(process.cwd(), '2026-10-29')).map((f) => [f.fileName, f]));
  const html = (name: string) => String(files.get(name)?.source ?? '');

  it('has a page for every path, in English and Italian', () => {
    for (const path of sitePaths()) expect(files.has(`${path}index.html`), path).toBe(true);
    expect(html('photo-to-cross-stitch-pattern/index.html')).toContain('<html lang="en">');
    expect(html('it/schema-punto-croce-da-foto/index.html')).toContain('<html lang="it">');
  });

  it('links each page to its other language and lists all of them in the sitemap', () => {
    const page = html('patterns/lighthouse-at-sunset/index.html');
    expect(page).toContain(`hreflang="it" href="${SITE_URL}it/schemi/faro-al-tramonto/"`);
    expect(page).toContain(`rel="canonical" href="${SITE_URL}patterns/lighthouse-at-sunset/"`);
    const sitemap = html('sitemap.xml');
    for (const path of ['', ...sitePaths()])
      expect(sitemap).toContain(`<loc>${SITE_URL}${path}</loc>`);
  });

  it('makes the PDFs and an "Open in Stitchino" link the app accepts', () => {
    for (const p of FREE_PATTERNS) {
      const pdfs = [...files.keys()].filter(
        (f) => f.startsWith(`patterns/${p.slug}/`) && f.endsWith('.pdf'),
      );
      expect(pdfs).toHaveLength(4);
      for (const f of pdfs) {
        const bytes = files.get(f)!.source as Uint8Array;
        expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      }
      const link = html(`patterns/${p.slug}/index.html`).match(
        /href="\.\.\/\.\.\/#\/new\?([^"]+)"/,
      );
      expect(link).not.toBeNull();
      const query = link![1].replace(/&amp;/g, '&');
      const src = new URLSearchParams(query).get('src')!;
      expect(isPicturePath(src)).toBe(true);
      expect(files.has(src)).toBe(true);
      expect(linkSettings(query)).toMatchObject({ width: 100, maxColors: 30, title: p.title.en });
    }
  });

  it('accepts only pictures from this site', () => {
    expect(isPicturePath('samples/lighthouse.png')).toBe(true);
    expect(isPicturePath('patterns/a-b/source.jpg')).toBe(true);
    for (const bad of [
      'https://example.com/x.png',
      '//example.com/x.png',
      '../secret.png',
      'patterns/../x.png',
      'patterns/a/b/c.png',
      'samples/x.svg',
    ])
      expect(isPicturePath(bad), bad).toBe(false);
    expect(linkSettings('w=abc&colors=-3')).toEqual({
      width: undefined,
      maxColors: undefined,
      title: '',
      autoSubject: true,
    });
  });
});
