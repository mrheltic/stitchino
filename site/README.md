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

1. Pick a picture you have the rights to: your own drawing or photo, or a public-domain image
   (Wikimedia Commons marks them; NASA photos are public domain). Skip images of works held by
   Italian state museums, which have their own rules on reproductions, and anything with
   characters or logos from films, games or comics.
2. Build once (`npm run build`), then let the app make the pattern:
   ```sh
   npm run pattern -- picture.jpg my-slug --width 100 --colors 24
   ```
   Add `--background` to leave the background unstitched. The project file (with the picture and
   the settings) and the stitched preview land in `site/patterns/my-slug/`.
3. Add an entry to `FREE_PATTERNS` in `patterns.ts`: slugs, titles, a one-line description, the
   byline and the credit, in English and Italian.
4. Run `npm test`: it checks that the pages, the PDFs and the links are there.

For every pattern the build makes four PDFs: English on A4 and US Letter, one for Pattern Keeper,
and Italian on A4.

## Pinterest pins

`npm run build && npm run pins -- --start 2026-11-02` draws a 1000 × 1500 pin in English and one
in Italian for every pattern into `site/pins/`, with `pinterest.csv` for Pinterest's bulk upload
(one pattern a day from the start date; Pinterest takes dates up to two weeks ahead). The pins are
published with the site, so push before uploading the CSV: its image links point there. The boards
must be called "Free cross stitch patterns" and "Schemi punto croce gratis".
