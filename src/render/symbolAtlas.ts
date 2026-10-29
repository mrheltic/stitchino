import { SYMBOL_FONT_FAMILY, SYMBOL_GLYPH_CENTER_Y } from '../core/model/symbols.ts';

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export type Ink = 'black' | 'white';

/**
 * Symbols pre-rendered at one size, in black and white ink: drawing a sprite is much faster than
 * fillText for thousands of cells. Rebuilt when the size changes.
 */
export class SymbolAtlas {
  private canvas: AnyCanvas | null = null;
  private slots = new Map<string, number>();
  private size = 0;
  private symbols: string[] = [];

  /** Forgets the sprites, e.g. after the symbol font has loaded. */
  reset(): void {
    this.canvas = null;
  }

  /** Ensures the atlas holds `symbols` at `size` device pixels; returns true if rebuilt. */
  prepare(symbols: string[], size: number): boolean {
    size = Math.max(4, Math.round(size));
    const key = symbols.join('');
    if (this.canvas && size === this.size && key === this.symbols.join('')) return false;
    this.size = size;
    this.symbols = [...symbols];
    this.slots.clear();
    const n = symbols.length * 2;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    this.canvas = makeCanvas(cols * size, rows * size);
    const ctx = this.canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const fontPx = size * 0.82;
    ctx.font = `${fontPx}px "${SYMBOL_FONT_FAMILY}"`;
    let k = 0;
    for (const s of symbols) {
      for (const ink of ['black', 'white'] as const) {
        const x = (k % cols) * size;
        const y = Math.floor(k / cols) * size;
        ctx.fillStyle = ink === 'black' ? '#111' : '#fff';
        ctx.fillText(s, x + size / 2, y + size / 2 + SYMBOL_GLYPH_CENTER_Y * fontPx);
        this.slots.set(`${s}|${ink}`, k);
        k++;
      }
    }
    return true;
  }

  /** Draws a symbol centred at (cx, cy) with the given side, in the caller's coordinates. */
  draw(
    ctx: CanvasRenderingContext2D,
    symbol: string,
    ink: Ink,
    cx: number,
    cy: number,
    side: number,
  ): void {
    const slot = this.slots.get(`${symbol}|${ink}`);
    if (slot === undefined || !this.canvas) return;
    const cols = Math.max(1, Math.round(this.canvas.width / this.size));
    const sx = (slot % cols) * this.size;
    const sy = Math.floor(slot / cols) * this.size;
    ctx.drawImage(
      this.canvas as CanvasImageSource,
      sx,
      sy,
      this.size,
      this.size,
      cx - side / 2,
      cy - side / 2,
      side,
      side,
    );
  }
}
