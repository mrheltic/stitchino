import { resolveCode } from '../../io/inventoryCsv.ts';
import type { Brand, ThreadRef } from '../../threads/types.ts';

/**
 * Reading cross-stitch charts from PDFs whose symbols are text (the kind Pattern Keeper reads):
 * the chart is found as a regular lattice of one-character glyphs, its place in the whole
 * pattern from the row/column numbers along the edges, and the key from lines that start with
 * a chart symbol and contain a thread code. Pure functions over text boxes, so they can be
 * tested without a browser; extracting the boxes is up to the caller (PDF.js).
 */

/** A run of text on a page, in millimetre-free page units with y growing downwards. */
export interface TextBox {
  str: string;
  /** Left of the run and its baseline. */
  x: number;
  y: number;
  /** Advance width of the run and font size. */
  w: number;
  h: number;
  font: string;
}

export interface PageText {
  width: number;
  height: number;
  items: TextBox[];
}

/** PDF.js text item as returned by getTextContent (only the fields used). */
export interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

/** Converts PDF.js text items (PDF space, y up) to text boxes (y down). */
export function pageTextFromPdfJs(
  items: readonly unknown[],
  width: number,
  height: number,
): PageText {
  const out: TextBox[] = [];
  for (const raw of items) {
    const it = raw as Partial<PdfJsTextItem>;
    if (typeof it.str !== 'string' || !it.str.trim() || !Array.isArray(it.transform)) continue;
    const [a, b, , , e, f] = it.transform;
    const size = Math.hypot(a, b) || it.height || 0;
    if (!(size > 0)) continue;
    out.push({
      str: it.str,
      x: e,
      y: height - f,
      w: it.width ?? 0,
      h: size,
      font: it.fontName ?? '',
    });
  }
  return { width, height, items: out };
}

export interface Glyph {
  ch: string;
  cx: number;
  cy: number;
  size: number;
  font: string;
}

/**
 * One entry per glyph. PDF.js joins glyphs drawn close together into one run (adding a space
 * where the gap is wider than a tenth of the font size), so a run's glyphs are taken to sit in
 * consecutive cells: the first starts at the run's left, the last ends at its right, and the
 * glyph advance comes from runs of a single glyph in the same font.
 */
export function glyphsOf(items: readonly TextBox[]): Glyph[] {
  const advances = new Map<string, number[]>();
  for (const it of items) {
    if (it.str.trim().length !== 1 || [...it.str.trim()].length !== 1) continue;
    let list = advances.get(it.font);
    if (!list) advances.set(it.font, (list = []));
    list.push(it.w);
  }
  const advanceOf = new Map([...advances].map(([font, ws]) => [font, median(ws)]));
  const out: Glyph[] = [];
  for (const it of items) {
    const chars = [...it.str].filter((ch) => ch.trim());
    const n = chars.length;
    if (!n) continue;
    // Centre of a glyph: a third of the font size above the baseline is close for most fonts,
    // and the offset is the same for every glyph of a font, so the lattice doesn't depend on it.
    const cy = it.y - it.h * 0.35;
    const a = n === 1 ? it.w : Math.min(it.w / n, advanceOf.get(it.font) ?? it.h);
    const step = n > 1 ? (it.w - a) / (n - 1) : 0;
    chars.forEach((ch, i) =>
      out.push({ ch, cx: it.x + a / 2 + i * step, cy, size: it.h, font: it.font }),
    );
  }
  return out;
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Centres of groups of nearby values (sorted). */
function clusters(values: number[], tol: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  let sum = 0;
  let n = 0;
  let last = -Infinity;
  for (const v of s) {
    if (v - last > tol && n) {
      out.push(sum / n);
      sum = 0;
      n = 0;
    }
    sum += v;
    n++;
    last = v;
  }
  if (n) out.push(sum / n);
  return out;
}

/** Spacing of a lattice from its occupied positions: gaps are whole multiples of the pitch. */
function pitch(centres: number[]): number | null {
  const gaps: number[] = [];
  for (let i = 1; i < centres.length; i++) gaps.push(centres[i] - centres[i - 1]);
  if (gaps.length < 2) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  const guess = sorted[Math.floor(sorted.length * 0.1)];
  if (!(guess > 0)) return null;
  const parts: number[] = [];
  for (const g of gaps) {
    const k = Math.round(g / guess);
    if (k >= 1 && k <= 40 && Math.abs(g - k * guess) < 0.15 * guess) parts.push(g / k);
  }
  return parts.length >= gaps.length * 0.6 ? median(parts) : null;
}

export interface LatticeCell {
  col: number;
  row: number;
  ch: string;
}

export interface Lattice {
  /** Centre of cell (0, 0) and the cell pitch, in page units. */
  x0: number;
  y0: number;
  sx: number;
  sy: number;
  cols: number;
  rows: number;
  cells: LatticeCell[];
  font: string;
}

/** A regular, square-celled lattice formed by the glyphs, or null. */
export function detectLattice(all: readonly Glyph[]): Lattice | null {
  if (all.length < 24) return null;
  // Chart symbols share one size; smaller ones (partial stitches) and titles are left out.
  const typical = median(all.map((g) => g.size));
  const glyphs = all.filter((g) => g.size > typical * 0.8 && g.size < typical * 1.25);
  if (glyphs.length < 24) return null;
  const size = median(glyphs.map((g) => g.size));
  const tol = size * 0.3;
  const xs = clusters(
    glyphs.map((g) => g.cx),
    tol,
  );
  const ys = clusters(
    glyphs.map((g) => g.cy),
    tol,
  );
  const sx = pitch(xs);
  const sy = pitch(ys);
  if (!sx || !sy || Math.abs(sx - sy) > 0.15 * Math.max(sx, sy)) return null;
  // Least-squares fit of each axis on the integer positions, then assignment.
  const fit = (pos: number[], start: number, step: number) => {
    const idx = pos.map((p) => Math.round((p - start) / step));
    const mi = idx.reduce((a, b) => a + b, 0) / idx.length;
    const mp = pos.reduce((a, b) => a + b, 0) / pos.length;
    let num = 0;
    let den = 0;
    idx.forEach((k, i) => {
      num += (k - mi) * (pos[i] - mp);
      den += (k - mi) ** 2;
    });
    const s = den > 0 ? num / den : step;
    return { s, o: mp - s * mi };
  };
  const fx = fit(
    glyphs.map((g) => g.cx),
    xs[0],
    sx,
  );
  const fy = fit(
    glyphs.map((g) => g.cy),
    ys[0],
    sy,
  );
  const cells: LatticeCell[] = [];
  const seen = new Set<string>();
  for (const g of glyphs) {
    const u = (g.cx - fx.o) / fx.s;
    const v = (g.cy - fy.o) / fy.s;
    const col = Math.round(u);
    const row = Math.round(v);
    if (Math.abs(u - col) > 0.3 || Math.abs(v - row) > 0.3) continue;
    const key = `${col},${row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ col, row, ch: g.ch });
  }
  if (cells.length < glyphs.length * 0.8) return null;
  const minCol = Math.min(...cells.map((c) => c.col));
  const minRow = Math.min(...cells.map((c) => c.row));
  for (const c of cells) {
    c.col -= minCol;
    c.row -= minRow;
  }
  const cols = Math.max(...cells.map((c) => c.col)) + 1;
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  if (cols < 3 || rows < 3 || cells.length < 0.05 * cols * rows) return null;
  return {
    x0: fx.o + minCol * fx.s,
    y0: fy.o + minRow * fy.s,
    sx: fx.s,
    sy: fy.s,
    cols,
    rows,
    cells,
    font: glyphs[0].font,
  };
}

/**
 * Where the page's first cell sits in the whole chart, from the numbers along the edges.
 * Numbers may label grid lines (10 on the line after the tenth column) or cells (10 centred on
 * the tenth); both are tried and the offset most numbers agree on wins.
 */
export function latticeOffset(
  lattice: Lattice,
  items: readonly TextBox[],
): { x: number | null; y: number | null } {
  const { x0, y0, sx, sy, cols, rows } = lattice;
  const top = y0 - sy / 2;
  const bottom = y0 + (rows - 0.5) * sy;
  const left = x0 - sx / 2;
  const right = x0 + (cols - 0.5) * sx;
  const votesX = new Map<number, number>();
  const votesY = new Map<number, number>();
  const vote = (m: Map<number, number>, edge: number, value: number) => {
    const frac = edge - Math.floor(edge);
    // On a grid line: the value is the edge index. On a cell: it is the 1-based cell.
    const off =
      frac < 0.25 || frac > 0.75 ? value - Math.round(edge) : value - 1 - Math.floor(edge);
    m.set(off, (m.get(off) ?? 0) + 1);
  };
  for (const it of items) {
    const s = it.str.trim();
    if (!/^\d{1,4}$/.test(s)) continue;
    const value = Number(s);
    const cx = it.x + it.w / 2;
    const cy = it.y - it.h * 0.35;
    const band = 4 * Math.max(sx, it.h);
    const besideX = cx >= left - sx && cx <= right + sx;
    const besideY = cy >= top - sy && cy <= bottom + sy;
    if (besideX && ((cy < top && cy > top - band) || (cy > bottom && cy < bottom + band)))
      vote(votesX, (cx - left) / sx, value);
    else if (besideY && ((cx < left && cx > left - band) || (cx > right && cx < right + band)))
      vote(votesY, (cy - top) / sy, value);
  }
  const best = (m: Map<number, number>) => {
    let off: number | null = null;
    let n = 0;
    let total = 0;
    for (const [k, v] of m) {
      total += v;
      if (v > n) {
        n = v;
        off = k;
      }
    }
    return off !== null && n >= Math.max(1, total * 0.5) && off >= 0 ? off : null;
  };
  return { x: best(votesX), y: best(votesY) };
}

// --- Key ---------------------------------------------------------------------------------------

export interface KeyEntry {
  ch: string;
  threads: ThreadRef[];
  /** The text of the key line, for checking by eye. */
  line: string;
}

const BRAND_WORDS: [RegExp, Brand][] = [
  [/^dmc$/i, 'DMC'],
  [/^(anchor|anc\.?)$/i, 'Anchor'],
];

function brandOf(token: string): Brand | undefined {
  return BRAND_WORDS.find(([re]) => re.test(token))?.[1];
}

/** Codes that name a colour rather than a number. */
const NAMED: Record<string, string> = {
  white: 'Blanc',
  bianco: 'Blanc',
  blanc: 'Blanc',
  ecru: 'Ecru',
};

function codeOf(token: string, brand: Brand): ThreadRef | undefined {
  const t = token.replace(/[(),.:;]+$/g, '').replace(/^[(#]+/, '');
  if (!t) return undefined;
  const named = NAMED[t.toLowerCase()];
  if (named) return resolveCode(brand, named) ?? resolveCode('DMC', named);
  if (!/^[A-Za-z]?\d{1,4}[A-Za-z]?$/.test(t)) return undefined;
  return resolveCode(brand, t);
}

/**
 * Threads named in a key line: the first "brand code" pair (or bare code, with the document's
 * brand), and a second one joined by "+" or "/" for blends. Later codes (equivalents in other
 * brands, strands, stitch counts) are ignored.
 */
export function parseKeyLine(line: string, brandHint: Brand): ThreadRef[] {
  const tokens = line
    .replace(/([+/])/g, ' $1 ')
    .split(/\s+/)
    .filter(Boolean);
  const readRef = (i: number): { ref: ThreadRef; next: number } | undefined => {
    const brand = brandOf(tokens[i]);
    if (brand && i + 1 < tokens.length) {
      const ref = codeOf(tokens[i + 1], brand);
      if (ref) return { ref, next: i + 2 };
    }
    const ref = codeOf(tokens[i], brandHint);
    return ref ? { ref, next: i + 1 } : undefined;
  };
  for (let i = 0; i < tokens.length; i++) {
    const first = readRef(i);
    if (!first) continue;
    const refs = [first.ref];
    if (tokens[first.next] === '+' || tokens[first.next] === '/') {
      const second = readRef(first.next + 1);
      if (second) refs.push(second.ref);
    }
    return refs;
  }
  return [];
}

/** The brand the document talks about most (DMC unless Anchor dominates). */
export function brandHintOf(pages: readonly PageText[]): Brand {
  let dmc = 0;
  let anchor = 0;
  for (const p of pages)
    for (const it of p.items) {
      dmc += (it.str.match(/\bdmc\b/gi) ?? []).length;
      anchor += (it.str.match(/\b(anchor|anc\.)/gi) ?? []).length;
    }
  return anchor > dmc ? 'Anchor' : 'DMC';
}

/** Fabric count mentioned in the text ("14 ct", "Aida 16", "28 count"), if any. */
export function fabricCountOf(pages: readonly PageText[]): number | undefined {
  for (const p of pages)
    for (const it of p.items) {
      const m = /\b(1[1-8]|2[0-9]|3[0-9]|40)\s*(?:ct\b|count\b|fili\b)|aida\s*(1[1-8])\b/i.exec(
        it.str,
      );
      if (m) return Number(m[1] ?? m[2]);
    }
  return undefined;
}

// --- Whole document ----------------------------------------------------------------------------

export interface ChartPage {
  /** Page index in the document (0-based). */
  page: number;
  lattice: Lattice;
  /** Position of the page's first cell in the chart; null where no numbers were found. */
  offset: { x: number | null; y: number | null };
}

export interface PdfAnalysis {
  pages: ChartPage[];
  key: Map<string, KeyEntry>;
  /** Chart symbols without a key line. */
  unmatched: string[];
  brand: Brand;
  fabricCount?: number;
}

export function analyzeDocument(pages: readonly PageText[]): PdfAnalysis {
  const charts: ChartPage[] = [];
  const lattices = new Set<Glyph>();
  const glyphsByPage: Glyph[][] = [];
  pages.forEach((p, index) => {
    const glyphs = glyphsOf(p.items);
    glyphsByPage.push(glyphs);
    // A glyph with words right after it on its line is a key entry, not a chart cell (row
    // numbers beside a chart are digits only).
    const words = p.items.filter((it) => /\p{L}{2,}/u.test(it.str));
    const keyLike = (g: Glyph) =>
      words.some(
        (w) =>
          w.font !== g.font &&
          w.x > g.cx &&
          w.x < g.cx + 4 * g.size &&
          Math.abs(w.y - w.h * 0.35 - g.cy) < Math.max(w.h, g.size) * 0.6,
      );
    const byFont = new Map<string, Glyph[]>();
    for (const g of glyphs) {
      if (keyLike(g)) continue;
      let list = byFont.get(g.font);
      if (!list) byFont.set(g.font, (list = []));
      list.push(g);
    }
    // Several charts can share a page only in odd layouts; the largest lattice is the chart.
    let best: { lattice: Lattice; glyphs: Glyph[] } | null = null;
    for (const list of byFont.values()) {
      const lattice = detectLattice(list);
      if (lattice && (!best || lattice.cells.length > best.lattice.cells.length))
        best = { lattice, glyphs: list };
    }
    if (!best) return;
    for (const g of best.glyphs) lattices.add(g);
    charts.push({
      page: index,
      lattice: best.lattice,
      offset: latticeOffset(best.lattice, p.items),
    });
  });

  const chartChars = new Set<string>();
  for (const c of charts) for (const cell of c.lattice.cells) chartChars.add(cell.ch);
  const brand = brandHintOf(pages);
  const key = new Map<string, KeyEntry>();
  pages.forEach((p, index) => {
    // Key symbols: chart characters away from any chart on the page.
    const chart = charts.find((c) => c.page === index)?.lattice;
    const nearChart = (g: Glyph) =>
      !!chart &&
      g.cx > chart.x0 - 3 * chart.sx &&
      g.cx < chart.x0 + (chart.cols + 2) * chart.sx &&
      g.cy > chart.y0 - 3 * chart.sy &&
      g.cy < chart.y0 + (chart.rows + 2) * chart.sy;
    const candidates = glyphsByPage[index].filter(
      (g) => !lattices.has(g) && chartChars.has(g.ch) && !nearChart(g),
    );
    for (const g of candidates) {
      if (key.has(g.ch)) continue;
      // Text on the same line to the right, up to the next symbol of another key column.
      const nextSymbol = Math.min(
        ...candidates
          .filter((o) => o !== g && o.cx > g.cx + g.size && Math.abs(o.cy - g.cy) < g.size * 0.6)
          .map((o) => o.cx),
      );
      const words = p.items
        .filter((it) => {
          const cy = it.y - it.h * 0.35;
          return (
            it.x > g.cx && it.x < nextSymbol && Math.abs(cy - g.cy) < Math.max(g.size, it.h) * 0.6
          );
        })
        .filter(
          (it) => !(it.str.trim().length === 1 && it.str.trim() === g.ch && it.font === g.font),
        )
        .sort((a, b) => a.x - b.x)
        .map((it) => it.str.trim());
      const line = words.join(' ');
      const threads = parseKeyLine(line, brand);
      if (threads.length) key.set(g.ch, { ch: g.ch, threads, line });
    }
  });
  const unmatched = [...chartChars].filter((ch) => !key.has(ch));
  return { pages: charts, key, unmatched, brand, fabricCount: fabricCountOf(pages) };
}

export interface Placement {
  x: number;
  y: number;
}

/**
 * Page positions: from the numbers where found; pages without numbers go to the right of the
 * previous page (to be checked by the user).
 */
export function placePages(pages: readonly ChartPage[]): Placement[] {
  const out: Placement[] = [];
  let cursor = { x: 0, y: 0 };
  for (const p of pages) {
    const x = p.offset.x ?? cursor.x;
    const y = p.offset.y ?? cursor.y;
    out.push({ x, y });
    cursor = { x: x + p.lattice.cols, y };
  }
  const minX = Math.min(...out.map((o) => o.x));
  const minY = Math.min(...out.map((o) => o.y));
  return out.map((o) => ({ x: o.x - minX, y: o.y - minY }));
}

export interface AssembledChart {
  width: number;
  height: number;
  /** Symbol per cell ('' for empty). */
  cells: string[];
  /** Cells where overlapping pages disagree. */
  conflicts: number;
}

export function assembleChart(
  pages: readonly ChartPage[],
  placements: readonly Placement[],
): AssembledChart {
  let width = 0;
  let height = 0;
  pages.forEach((p, i) => {
    width = Math.max(width, placements[i].x + p.lattice.cols);
    height = Math.max(height, placements[i].y + p.lattice.rows);
  });
  const cells: string[] = new Array(width * height).fill('');
  let conflicts = 0;
  pages.forEach((p, i) => {
    const { x, y } = placements[i];
    for (const c of p.lattice.cells) {
      const k = (y + c.row) * width + x + c.col;
      if (cells[k] && cells[k] !== c.ch) conflicts++;
      else cells[k] = c.ch;
    }
  });
  return { width, height, cells, conflicts };
}
