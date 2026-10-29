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
  /** Author and year, short, for pins and cards. */
  byline: { en: string; it: string };
  /** Where the picture comes from. Only own drawings or public-domain (CC0) pictures. */
  credit: { en: string; it: string };
  creditUrl?: string;
  /** Publication date, YYYY-MM-DD (newest first in the index). */
  date: string;
}

export const FREE_PATTERNS: FreePattern[] = [
  {
    slug: 'great-wave',
    slugIt: 'la-grande-onda',
    title: { en: 'The Great Wave', it: 'La grande onda' },
    description: {
      en: "Hokusai's famous wave about to crash over three boats, with Mount Fuji small in the distance.",
      it: 'La celebre onda di Hokusai che sta per abbattersi su tre barche, con il monte Fuji piccolo sullo sfondo.',
    },
    byline: { en: 'Katsushika Hokusai, about 1831', it: 'Katsushika Hokusai, 1831 circa' },
    credit: {
      en: 'Katsushika Hokusai, Under the Wave off Kanagawa (The Great Wave), about 1830–32. Public domain, from Wikimedia Commons.',
      it: 'Katsushika Hokusai, La grande onda di Kanagawa, 1830–32 circa. Pubblico dominio, da Wikimedia Commons.',
    },
    creditUrl: 'https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg',
    date: '2026-10-29',
  },
  {
    slug: 'd20-dice',
    slugIt: 'dado-d20',
    title: { en: 'D20 dice', it: 'Dado D20' },
    description: {
      en: 'A twenty-sided die showing a natural 20, with two sparkles. For tabletop players.',
      it: 'Un dado a venti facce che mostra un 20 naturale, con due stelline. Per chi gioca di ruolo.',
    },
    byline: { en: 'Original design', it: 'Disegno originale' },
    credit: {
      en: 'Original design made for Stitchino.',
      it: 'Disegno originale fatto per Stitchino.',
    },
    date: '2026-10-29',
  },
  {
    slug: 'earthrise',
    slugIt: 'sorgere-della-terra',
    title: { en: 'Earthrise', it: 'Il sorgere della Terra' },
    description: {
      en: "The Earth rising over the Moon's horizon, photographed by the Apollo 8 crew on Christmas Eve 1968.",
      it: "La Terra che sorge sull'orizzonte della Luna, fotografata dall'equipaggio dell'Apollo 8 la vigilia di Natale del 1968.",
    },
    byline: { en: 'Apollo 8, NASA, 1968', it: 'Apollo 8, NASA, 1968' },
    credit: {
      en: 'Earthrise, photographed by Bill Anders on Apollo 8, 24 December 1968. NASA, public domain.',
      it: "Earthrise, fotografia di Bill Anders dall'Apollo 8, 24 dicembre 1968. NASA, pubblico dominio.",
    },
    creditUrl: 'https://images.nasa.gov/details/as08-14-2383',
    date: '2026-10-29',
  },
  {
    slug: 'van-gogh-bedroom',
    slugIt: 'camera-da-letto-van-gogh',
    title: { en: "Van Gogh's Bedroom", it: 'La camera da letto di Van Gogh' },
    description: {
      en: 'The little room in Arles: the yellow bed, two chairs and the window with green shutters.',
      it: 'La piccola stanza di Arles: il letto giallo, due sedie e la finestra con gli scuri verdi.',
    },
    byline: { en: 'Vincent van Gogh, 1888', it: 'Vincent van Gogh, 1888' },
    credit: {
      en: 'Vincent van Gogh, The Bedroom, 1888, Van Gogh Museum. Public domain, from Wikimedia Commons.',
      it: 'Vincent van Gogh, La camera da letto, 1888, Van Gogh Museum. Pubblico dominio, da Wikimedia Commons.',
    },
    creditUrl:
      'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg',
    date: '2026-10-29',
  },
  {
    slug: 'pixel-rocket',
    slugIt: 'piccolo-razzo',
    title: { en: 'Little rocket', it: 'Piccolo razzo' },
    description: {
      en: 'A cartoon rocket taking off past a ringed planet and a few stars.',
      it: 'Un razzo da cartone animato che decolla accanto a un pianeta con gli anelli e qualche stella.',
    },
    byline: { en: 'Original design', it: 'Disegno originale' },
    credit: {
      en: 'Original design made for Stitchino.',
      it: 'Disegno originale fatto per Stitchino.',
    },
    date: '2026-10-29',
  },
  {
    slug: 'monet-water-lilies',
    slugIt: 'ninfee-monet',
    title: { en: "Monet's Water Lilies", it: 'Le ninfee di Monet' },
    description: {
      en: "A corner of Monet's pond at Giverny, with pink water lilies floating among the reflections.",
      it: 'Un angolo dello stagno di Monet a Giverny, con le ninfee rosa tra i riflessi.',
    },
    byline: { en: 'Claude Monet, 1906', it: 'Claude Monet, 1906' },
    credit: {
      en: 'Claude Monet, Water Lilies, 1906, Art Institute of Chicago. Public domain, from Wikimedia Commons.',
      it: 'Claude Monet, Ninfee, 1906, Art Institute of Chicago. Pubblico dominio, da Wikimedia Commons.',
    },
    creditUrl:
      'https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1906,_Ryerson.jpg',
    date: '2026-10-29',
  },
  {
    slug: 'trip-to-the-moon',
    slugIt: 'viaggio-nella-luna',
    title: { en: 'A Trip to the Moon', it: 'Viaggio nella Luna' },
    description: {
      en: "The Man in the Moon with a rocket in his eye, from Georges Méliès' 1902 film, one of the first science-fiction films.",
      it: "L'uomo nella Luna con il razzo nell'occhio, dal film di Georges Méliès del 1902, uno dei primi film di fantascienza.",
    },
    byline: { en: 'Georges Méliès, 1902', it: 'Georges Méliès, 1902' },
    credit: {
      en: 'Georges Méliès, A Trip to the Moon (Le Voyage dans la Lune), 1902. Public domain, from Wikimedia Commons.',
      it: 'Georges Méliès, Viaggio nella Luna (Le Voyage dans la Lune), 1902. Pubblico dominio, da Wikimedia Commons.',
    },
    creditUrl:
      'https://commons.wikimedia.org/wiki/File:A_Trip_to_the_Moon_(Le_Voyage_dans_la_Lune)_(cropped).jpg',
    date: '2026-10-29',
  },
  {
    slug: 'van-gogh-self-portrait',
    slugIt: 'autoritratto-van-gogh',
    title: { en: 'Van Gogh Self-Portrait', it: 'Autoritratto di Van Gogh' },
    description: {
      en: 'Van Gogh painted himself in short strokes of colour, a style that already looks like stitches.',
      it: 'Van Gogh si è dipinto a piccoli tratti di colore, uno stile che sembra già fatto di punti.',
    },
    byline: { en: 'Vincent van Gogh, 1887', it: 'Vincent van Gogh, 1887' },
    credit: {
      en: 'Vincent van Gogh, Self-Portrait, 1887, Art Institute of Chicago. Public domain, from Wikimedia Commons.',
      it: 'Vincent van Gogh, Autoritratto, 1887, Art Institute of Chicago. Pubblico dominio, da Wikimedia Commons.',
    },
    creditUrl:
      'https://commons.wikimedia.org/wiki/File:Vincent_van_Gogh_-_Self-Portrait_-_Google_Art_Project_(454045).jpg',
    date: '2026-10-29',
  },
  {
    slug: 'lighthouse-at-sunset',
    slugIt: 'faro-al-tramonto',
    title: { en: 'Lighthouse at sunset', it: 'Faro al tramonto' },
    description: {
      en: 'A red and white lighthouse on a cliff, with the sun going down over the sea and a small sailing boat.',
      it: 'Un faro bianco e rosso sulla scogliera, il sole che tramonta sul mare e una piccola barca a vela.',
    },
    byline: { en: 'Original design', it: 'Disegno originale' },
    credit: {
      en: 'Original drawing made for Stitchino.',
      it: 'Disegno originale fatto per Stitchino.',
    },
    date: '2026-10-28',
  },
];
