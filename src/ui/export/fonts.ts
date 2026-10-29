import { SYMBOL_FONT_FAMILY } from '../../core/model/symbols.ts';

export interface PdfFonts {
  symbols: Uint8Array;
  text: Uint8Array;
  bold: Uint8Array;
}

const FILES = {
  symbols: 'fonts/pc-symbols.ttf',
  text: 'fonts/AtkinsonHyperlegible-Regular.ttf',
  bold: 'fonts/AtkinsonHyperlegible-Bold.ttf',
};

let cache: Promise<PdfFonts> | undefined;

async function fetchFont(path: string): Promise<Uint8Array> {
  const res = await fetch(new URL(path, document.baseURI));
  if (!res.ok) throw new Error(`Font ${path}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Fonts embedded in PDFs, fetched once (the service worker keeps them for offline use). */
export function loadPdfFonts(): Promise<PdfFonts> {
  cache ??= Promise.all([
    fetchFont(FILES.symbols),
    fetchFont(FILES.text),
    fetchFont(FILES.bold),
  ]).then(([symbols, text, bold]) => ({ symbols, text, bold }));
  cache.catch(() => (cache = undefined));
  return cache;
}

/** Waits for the on-screen symbol font, so canvas exports draw real symbols. */
export async function symbolFontReady(): Promise<boolean> {
  try {
    await document.fonts.load(`16px "${SYMBOL_FONT_FAMILY}"`);
    return true;
  } catch {
    return false;
  }
}
