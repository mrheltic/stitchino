# Static pages and free patterns

`npm run build` adds plain HTML pages next to the app, so search engines can read them without
running JavaScript:

- `photo-to-cross-stitch-pattern/` and `it/schema-punto-croce-da-foto/`: landing pages (texts in
  `text.ts`);
- `patterns/` and `it/schemi/`: the free pattern library, one page per pattern in each language;
- `sitemap.xml`: every page, to submit in Google Search Console.

`plugin.ts` hooks `build.ts` into Vite and `pages.ts` holds the HTML. The pages aren't served by
`npm run dev`; use `npm run build && npm run preview` to look at them.

## Adding a free pattern

1. Make the pattern in Stitchino from a picture you have the rights to: your own drawing or photo,
   or a public-domain image with a CC0 licence (the open access collections of the Met, the
   Rijksmuseum and the Art Institute of Chicago have plenty). Skip images of works held by Italian
   state museums, which have their own rules on reproductions, and anything with characters or
   logos.
2. Export the project file (Export → Project file) and save it as
   `site/patterns/<slug>/pattern.stitchino`. It carries the picture and the settings used, which the
   page's "Change it in Stitchino" button reuses.
3. In Real size choose "From afar", download the image and save it as
   `site/patterns/<slug>/preview.png`, or as `preview.jpg` (about 1000 px wide), which is lighter and
   also goes on the PDF cover.
4. Add an entry to `FREE_PATTERNS` in `patterns.ts`: slugs, titles, a one-line description and the
   credit, in English and Italian.
5. Run `npm test`: it checks that the pages, the PDFs and the links are there.

For every pattern the build makes four PDFs: English on A4 and US Letter, one for Pattern Keeper,
and Italian on A4.
