import symbolSet from './symbolSet.json';

/** Chart symbols, most legible first. All are glyphs of the bundled "PuntoCroce Symbols" font. */
export const SYMBOLS: readonly string[] = symbolSet.symbols;
export const SYMBOL_FONT_FAMILY = symbolSet.font;
/** Height of the glyph centre above the baseline, in em. */
export const SYMBOL_GLYPH_CENTER_Y = symbolSet.glyphCenterY;

/**
 * Gives every entry a symbol. Entries are visited in order (callers sort by stitch count, so the
 * most used colours get the clearest symbols); a valid symbol already set is kept unless an
 * earlier entry has it. Beyond the symbol set's size symbols repeat and colour must tell them apart.
 */
export function assignSymbols(entries: { symbol: string }[]): void {
  const kept = new Set<string>();
  const needing: { symbol: string }[] = [];
  for (const e of entries) {
    if (e.symbol && SYMBOLS.includes(e.symbol) && !kept.has(e.symbol)) kept.add(e.symbol);
    else needing.push(e);
  }
  let next = 0;
  needing.forEach((e, i) => {
    while (next < SYMBOLS.length && kept.has(SYMBOLS[next])) next++;
    if (next < SYMBOLS.length) {
      e.symbol = SYMBOLS[next];
      kept.add(e.symbol);
    } else {
      e.symbol = SYMBOLS[i % SYMBOLS.length];
    }
  });
}
