# Third-party components and data

## Data

| What                                                                                                            | Source                                                                                                                                               | Licence              |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| DMC and Anchor thread codes, names and approximate RGB values (`src/core/threads/data/dmc.json`, `anchor.json`) | [KXStitch](https://invent.kde.org/graphics/kxstitch) `schemes/` by Stephen Allewell and contributors, vendored in `scripts/thread-sources/kxstitch/` | GPL-2.0-or-later     |
| DMC↔Anchor equivalences (`equivalences.json`)                                                                   | Computed by `scripts/build-threads.ts` (nearest CIEDE2000), not an official chart                                                                    | Part of this project |
| CIEDE2000 reference values in the tests                                                                         | G. Sharma, W. Wu, E. N. Dalal, _Color Research & Application_ 30(1), 2005                                                                            | Published test data  |

## Fonts

`public/fonts/pc-symbols.ttf` ("PuntoCroce Symbols") is a modified subset of the fonts below, built by
`scripts/build_symbol_font.py`; licence texts are in `public/fonts/OFL.txt`.

| Font                       | Copyright                                 | Licence     |
| -------------------------- | ----------------------------------------- | ----------- |
| Atkinson Hyperlegible Bold | © 2020 Braille Institute of America, Inc. | SIL OFL 1.1 |
| Noto Sans Symbols 2        | © 2022 The Noto Project Authors           | SIL OFL 1.1 |

## Libraries bundled in the app

| Library                                                  | Licence    |
| -------------------------------------------------------- | ---------- |
| React, React DOM, React Router                           | MIT        |
| Zustand                                                  | MIT        |
| i18next, react-i18next, i18next-browser-languagedetector | MIT        |
| Dexie.js                                                 | Apache-2.0 |
| Comlink                                                  | Apache-2.0 |
| pdf-lib, @pdf-lib/fontkit                                | MIT        |
| PDF.js (pdfjs-dist)                                      | Apache-2.0 |
| fflate                                                   | MIT        |
| Radix UI                                                 | MIT        |
| Lucide icons                                             | ISC        |
| Workbox (via vite-plugin-pwa)                            | MIT        |
| Tailwind CSS                                             | MIT        |

## Trademarks

DMC and Anchor are trademarks of their respective owners. They are mentioned only to identify thread
colours; PuntoCroce is not affiliated with or endorsed by them.
