import fontkit from '@pdf-lib/fontkit';
import {
  LineCapStyle,
  PDFDocument,
  beginText,
  endText,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  setFontAndSize,
  setLineCap,
  setLineWidth,
  setStrokingRgbColor,
  setTextMatrix,
  showText,
  stroke,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
} from 'pdf-lib';
import { hexToRgb, relativeLuminance, type Rgb } from '../../color/srgb.ts';
import { entryRgb } from '../../model/entryColor.ts';
import {
  ARM,
  countStitches,
  type PaletteEntry,
  type PartialStitch,
  type Pattern,
} from '../../model/pattern.ts';
import { SYMBOL_GLYPH_CENTER_Y } from '../../model/symbols.ts';
import { fabricToBuy, finishedSize, stitchesPerInch } from '../../size/fabric.ts';
import { stitchingAdvice } from '../../size/needles.ts';
import { estimateColor } from '../../size/threadEstimate.ts';
import { equivalentThread, getThread } from '../../threads/catalog.ts';

export type Paper = 'a4' | 'letter';
export type ChartStyle = 'color' | 'bw' | 'blocks';

export const PAPER_MM: Record<Paper, [number, number]> = { a4: [210, 297], letter: [215.9, 279.4] };
const PT = 72 / 25.4;
const MARGIN = 10;
const HEADER = 12;
const FOOTER = 7;
const BAND = 6; // row/column numbers
const MAX_CELL_MM = 4.5;

export interface ChartLabels {
  locale: string;
  untitled: string;
  coverSubtitle: string;
  by: (author: string) => string;
  page: (n: number, total: number) => string;
  region: (x0: number, x1: number, y0: number, y1: number) => string;
  credit: string;
  info: {
    size: string;
    stitchesValue: (w: number, h: number) => string;
    colors: string;
    stitches: string;
    fabric: string;
    finished: string;
    otherFabrics: string;
    toBuy: string;
    strandsNeedle: (strands: number, needle: string) => string;
    strandsNeedleLabel: string;
  };
  key: {
    title: string;
    symbol: string;
    thread: string;
    name: string;
    equivalent: string;
    strands: string;
    stitches: string;
    skeins: (fabric: string) => string;
    backstitch: string;
    length: string;
    knots: string;
    count: string;
    partialNote: string;
  };
  pageMap: string;
  fabricName: (kind: string, count: number, over: number) => string;
}

export interface ChartPdfOptions {
  paper: Paper;
  style: ChartStyle;
  /** Stitches per page horizontally (40 large, 60 medium, 80 small). */
  columns: number;
  /** Repeated rows/columns from neighbouring pages, drawn in grey. */
  overlap: number;
  cover: boolean;
  pageMap: boolean;
  /**
   * Pattern Keeper preset: no cover or page map, black symbols without fills, no overlap,
   * English key headers, full stitches only.
   */
  patternKeeper: boolean;
  labels: ChartLabels;
  fonts: { symbols: Uint8Array; text: Uint8Array; bold: Uint8Array };
  /** JPEG preview for the cover. */
  coverImage?: Uint8Array;
}

/** English key headers for the Pattern Keeper preset, whatever the interface language. */
export const PATTERN_KEEPER_KEY: Pick<
  ChartLabels['key'],
  'symbol' | 'thread' | 'name' | 'strands' | 'stitches' | 'title'
> = {
  title: 'Key',
  symbol: 'Symbol',
  thread: 'Number',
  name: 'Name',
  strands: 'Strands',
  stitches: 'Stitches',
};

interface Ctx {
  pdf: PDFDocument;
  pattern: Pattern;
  o: ChartPdfOptions;
  sym: PDFFont;
  text: PDFFont;
  bold: PDFFont;
  pw: number;
  ph: number;
  colours: Map<number, Rgb>;
  entries: Map<number, PaletteEntry>;
}

export interface ChartGrid {
  cell: number;
  cellsX: number;
  cellsY: number;
  cols: number;
  rows: number;
}

/** Page grid: page sizes are multiples of 10 stitches, so a 10×10 block is never split. */
export function chartGrid(pattern: Pattern, paper: Paper, columns: number): ChartGrid {
  const [pw, ph] = PAPER_MM[paper];
  const availW = pw - 2 * MARGIN - BAND;
  const availH = ph - 2 * MARGIN - HEADER - FOOTER - BAND;
  let cellsX = Math.max(10, Math.round(columns / 10) * 10);
  const cell = Math.min(MAX_CELL_MM, availW / cellsX);
  cellsX = Math.min(cellsX, Math.ceil(pattern.width / 10) * 10);
  const cellsY = Math.max(10, Math.floor(availH / cell / 10) * 10);
  return {
    cell,
    cellsX,
    cellsY,
    cols: Math.ceil(pattern.width / cellsX),
    rows: Math.ceil(pattern.height / cellsY),
  };
}

export async function chartPdf(pattern: Pattern, o: ChartPdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const title = pattern.meta.title || o.labels.untitled;
  pdf.setTitle(title);
  if (pattern.meta.author) pdf.setAuthor(pattern.meta.author);
  pdf.setCreator('PuntoCroce');
  pdf.setProducer('PuntoCroce');
  // The symbol font is embedded whole so every glyph keeps its character mapping (Pattern Keeper
  // reads symbols as text).
  const sym = await pdf.embedFont(o.fonts.symbols, { subset: false });
  const text = await pdf.embedFont(o.fonts.text, { subset: true });
  const bold = await pdf.embedFont(o.fonts.bold, { subset: true });
  const [pw, ph] = PAPER_MM[o.paper];
  const ctx: Ctx = {
    pdf,
    pattern,
    o,
    sym,
    text,
    bold,
    pw,
    ph,
    colours: new Map(pattern.palette.map((e) => [e.id, entryRgb(e)])),
    entries: new Map(pattern.palette.map((e) => [e.id, e])),
  };
  const pk = o.patternKeeper;
  const grid = chartGrid(pattern, o.paper, pk ? Math.min(o.columns, 60) : o.columns);
  if (o.cover && !pk) await coverPage(ctx);
  keyPages(ctx);
  if (o.pageMap && !pk && grid.cols * grid.rows > 1) pageMapPage(ctx, grid);
  const total = grid.cols * grid.rows;
  let n = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) chartPage(ctx, grid, c, r, ++n, total);
  }
  return pdf.save();
}

// --- Helpers -----------------------------------------------------------------------------------

const X = (mm: number) => mm * PT;
const Y = (ctx: Ctx, mmFromTop: number) => (ctx.ph - mmFromTop) * PT;

function newPage(ctx: Ctx): PDFPage {
  return ctx.pdf.addPage([ctx.pw * PT, ctx.ph * PT]);
}

function label(
  ctx: Ctx,
  page: PDFPage,
  s: string,
  x: number,
  y: number,
  size: number,
  font = ctx.text,
  color = rgb(0.15, 0.12, 0.1),
  maxWidth?: number,
): void {
  page.drawText(s, {
    x: X(x),
    y: Y(ctx, y),
    size,
    font,
    color,
    maxWidth: maxWidth ? X(maxWidth) : undefined,
    lineHeight: size * 1.25,
  });
}

function footer(ctx: Ctx, page: PDFPage): void {
  const parts = [ctx.pattern.meta.copyright, ctx.o.labels.credit].filter(Boolean).join(' · ');
  label(ctx, page, parts, MARGIN, ctx.ph - MARGIN + 1, 7, ctx.text, rgb(0.45, 0.42, 0.4));
}

function inkFor(c: Rgb): Rgb {
  return relativeLuminance(c) > 0.3 ? [17, 17, 17] : [255, 255, 255];
}

function lighten(c: Rgb, amount: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(c[i] + (255 - c[i]) * amount)) as unknown as Rgb;
}

function setFill(c: Rgb): PDFOperator {
  return setFillingRgbColor(c[0] / 255, c[1] / 255, c[2] / 255);
}

function setStroke(c: Rgb): PDFOperator {
  return setStrokingRgbColor(c[0] / 255, c[1] / 255, c[2] / 255);
}

/** Symbol glyphs as text, centred at (cx, cy) in mm from the top-left of the page. */
function symbolOps(
  ctx: Ctx,
  page: PDFPage,
  items: { cx: number; cy: number; size: number; s: string; ink: Rgb }[],
): void {
  if (!items.length) return;
  const key = page.node.newFontDictionary(ctx.sym.name, ctx.sym.ref);
  const ops: PDFOperator[] = [pushGraphicsState(), beginText()];
  let size = -1;
  let ink = '';
  for (const it of items) {
    const pt = it.size * PT;
    if (pt !== size) {
      ops.push(setFontAndSize(key, pt));
      size = pt;
    }
    const inkKey = it.ink.join(',');
    if (inkKey !== ink) {
      ops.push(setFill(it.ink));
      ink = inkKey;
    }
    ops.push(
      setTextMatrix(1, 0, 0, 1, X(it.cx) - pt / 2, Y(ctx, it.cy) - SYMBOL_GLYPH_CENTER_Y * pt),
    );
    ops.push(showText(ctx.sym.encodeText(it.s)));
  }
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

const QUAD: Record<number, [number, number]> = {
  [ARM.TL]: [0, 0],
  [ARM.TR]: [1, 0],
  [ARM.BL]: [0, 1],
  [ARM.BR]: [1, 1],
};
const ARMS = [ARM.TL, ARM.TR, ARM.BL, ARM.BR];

function centroid(s: PartialStitch): [number, number] {
  const q = ARMS.filter((a) => s.mask & a).map((a) => QUAD[a]);
  return [
    q.reduce((t, v) => t + v[0] * 0.5 + 0.25, 0) / q.length,
    q.reduce((t, v) => t + v[1] * 0.5 + 0.25, 0) / q.length,
  ];
}

// --- Cover -------------------------------------------------------------------------------------

async function coverPage(ctx: Ctx): Promise<void> {
  const { pattern: p, o } = ctx;
  const L = o.labels;
  const page = newPage(ctx);
  const title = p.meta.title || L.untitled;
  const tw = ctx.bold.widthOfTextAtSize(title, 24) / PT;
  label(ctx, page, title, Math.max(MARGIN, (ctx.pw - tw) / 2), MARGIN + 18, 24, ctx.bold);
  const sub = p.meta.author ? `${L.coverSubtitle} · ${L.by(p.meta.author)}` : L.coverSubtitle;
  const sw = ctx.text.widthOfTextAtSize(sub, 11) / PT;
  label(ctx, page, sub, (ctx.pw - sw) / 2, MARGIN + 26, 11, ctx.text, rgb(0.4, 0.37, 0.35));

  let y = MARGIN + 34;
  const boxW = ctx.pw - 2 * MARGIN - 20;
  const boxH = 135;
  const ratio = p.width / p.height;
  const iw = Math.min(boxW, boxH * ratio);
  const ih = iw / ratio;
  const ix = (ctx.pw - iw) / 2;
  if (o.coverImage) {
    const img = await ctx.pdf.embedJpg(o.coverImage);
    page.drawImage(img, { x: X(ix), y: Y(ctx, y + ih), width: X(iw), height: X(ih) });
  } else {
    blocksPreview(ctx, page, ix, y, iw, ih);
  }
  y += ih + 12;

  const size = finishedSize(p.width, p.height, p.fabric);
  const counts = countStitches(p);
  const stitches = [...counts.values()].reduce(
    (s, c) => s + c.full + c.half + c.quarter + c.threeQuarter,
    0,
  );
  const advice = stitchingAdvice(p.fabric);
  const toBuy = fabricToBuy(size);
  const cm = (mm: number) =>
    (mm / 10).toLocaleString(L.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const others = [11, 14, 16, 18]
    .filter((c) => !(p.fabric.kind === 'aida' && p.fabric.count === c))
    .map((c) => {
      const s = finishedSize(p.width, p.height, { count: c, over: 1 });
      return `${c} ct ${cm(s.widthMm)} × ${cm(s.heightMm)} cm`;
    });
  const e28 = finishedSize(p.width, p.height, { count: 28, over: 2 });
  others.push(`28/2 ${cm(e28.widthMm)} × ${cm(e28.heightMm)} cm`);
  const rows: [string, string][] = [
    [L.info.size, L.info.stitchesValue(p.width, p.height)],
    [L.info.colors, String(p.palette.length)],
    [L.info.stitches, stitches.toLocaleString(L.locale)],
    [L.info.fabric, L.fabricName(p.fabric.kind, p.fabric.count, p.fabric.over)],
    [L.info.finished, `${cm(size.widthMm)} × ${cm(size.heightMm)} cm`],
    [L.info.otherFabrics, others.join(' · ')],
    [L.info.toBuy, `${cm(toBuy.widthMm)} × ${cm(toBuy.heightMm)} cm`],
    [
      L.info.strandsNeedleLabel,
      L.info.strandsNeedle(p.palette[0]?.strands ?? advice.strands, advice.needles.join('/')),
    ],
  ];
  for (const [k, v] of rows) {
    label(ctx, page, k, MARGIN + 10, y, 9.5, ctx.bold);
    label(
      ctx,
      page,
      v,
      MARGIN + 58,
      y,
      9.5,
      ctx.text,
      rgb(0.15, 0.12, 0.1),
      ctx.pw - 2 * MARGIN - 70,
    );
    y += k === L.info.otherFabrics && v.length > 70 ? 11 : 6.5;
  }
  if (p.meta.notes)
    label(
      ctx,
      page,
      p.meta.notes,
      MARGIN + 10,
      y + 4,
      9,
      ctx.text,
      rgb(0.3, 0.28, 0.26),
      ctx.pw - 2 * MARGIN - 20,
    );
  footer(ctx, page);
}

/** Colour blocks of the whole pattern (cover without an image). */
function blocksPreview(ctx: Ctx, page: PDFPage, x: number, y: number, w: number, h: number): void {
  const p = ctx.pattern;
  const cw = w / p.width;
  const ch = h / p.height;
  const byColour = new Map<number, number[]>();
  for (let i = 0; i < p.cells.length; i++) {
    const id = p.cells[i] || p.partials.get(i)?.[0]?.id;
    if (!id) continue;
    let list = byColour.get(id);
    if (!list) byColour.set(id, (list = []));
    list.push(i);
  }
  const ops: PDFOperator[] = [pushGraphicsState(), setFill(hexToRgb(p.fabric.color))];
  ops.push(rectangle(X(x), Y(ctx, y + h), X(w), X(h)), fill());
  for (const [id, cells] of byColour) {
    ops.push(setFill(ctx.colours.get(id) ?? [128, 128, 128]));
    for (const i of cells) {
      const cx = i % p.width;
      const cy = (i - cx) / p.width;
      ops.push(rectangle(X(x + cx * cw), Y(ctx, y + (cy + 1) * ch), X(cw) + 0.05, X(ch) + 0.05));
    }
    ops.push(fill());
  }
  ops.push(popGraphicsState());
  page.pushOperators(...ops);
}

// --- Key ---------------------------------------------------------------------------------------

function keyPages(ctx: Ctx): void {
  const { pattern: p, o } = ctx;
  const pk = o.patternKeeper;
  const L = { ...o.labels.key, ...(pk ? PATTERN_KEEPER_KEY : {}) };
  const counts = countStitches(p);
  const alt = {
    count: p.fabric.kind === 'aida' && p.fabric.count === 14 ? 18 : 14,
    over: 1 as const,
  };
  const fabricLabel = (f: { count: number; over: number }) => `${f.count / f.over} ct`;
  const entries = [...p.palette].sort((a, b) => {
    const ca = counts.get(a.id)!;
    const cb = counts.get(b.id)!;
    return (
      cb.full +
      cb.half +
      cb.quarter +
      cb.threeQuarter -
      (ca.full + ca.half + ca.quarter + ca.threeQuarter)
    );
  });
  const crossEntries = entries.filter((e) => {
    const c = counts.get(e.id)!;
    return c.full + (pk ? 0 : c.half + c.quarter + c.threeQuarter) > 0;
  });
  const rowH = 6.4;
  const cols = pk
    ? [
        { key: 'symbol', title: L.symbol, x: 0 },
        { key: 'thread', title: L.thread, x: 18 },
        { key: 'name', title: L.name, x: 48 },
        { key: 'strands', title: L.strands, x: 120 },
        { key: 'stitches', title: L.stitches, x: 145 },
      ]
    : [
        { key: 'symbol', title: L.symbol, x: 0 },
        { key: 'thread', title: L.thread, x: 18 },
        { key: 'name', title: L.name, x: 46 },
        { key: 'equivalent', title: L.equivalent, x: 98 },
        { key: 'strands', title: L.strands, x: 120 },
        { key: 'stitches', title: L.stitches, x: 134 },
        { key: 'skeins', title: L.skeins(fabricLabel(p.fabric)), x: 152 },
        { key: 'skeinsAlt', title: L.skeins(fabricLabel(alt)), x: 172 },
      ];
  let page = newPage(ctx);
  let y = MARGIN + 8;
  const header = () => {
    label(
      ctx,
      page,
      pk ? L.title : `${L.title} · ${p.meta.title || o.labels.untitled}`,
      MARGIN,
      y,
      13,
      ctx.bold,
    );
    y += 9;
    for (const c of cols)
      label(ctx, page, c.title, MARGIN + c.x, y, 8, ctx.bold, rgb(0.3, 0.28, 0.26));
    y += 2.5;
    page.drawLine({
      start: { x: X(MARGIN), y: Y(ctx, y) },
      end: { x: X(ctx.pw - MARGIN), y: Y(ctx, y) },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5),
    });
    y += 1;
  };
  header();
  const symbols: { cx: number; cy: number; size: number; s: string; ink: Rgb }[] = [];
  const flush = () => {
    symbolOps(ctx, page, symbols.splice(0));
    footer(ctx, page);
  };
  for (const e of crossEntries) {
    if (y + rowH > ctx.ph - MARGIN - FOOTER) {
      flush();
      page = newPage(ctx);
      y = MARGIN + 8;
      header();
    }
    const c = counts.get(e.id)!;
    const colour = ctx.colours.get(e.id) ?? [128, 128, 128];
    const boxX = MARGIN + 1;
    const boxY = y + 0.6;
    const box = rowH - 1.2;
    if (!pk && o.style !== 'bw') {
      page.drawRectangle({
        x: X(boxX),
        y: Y(ctx, boxY + box),
        width: X(box),
        height: X(box),
        color: rgb(colour[0] / 255, colour[1] / 255, colour[2] / 255),
        borderColor: rgb(0.6, 0.6, 0.6),
        borderWidth: 0.3,
      });
    } else {
      page.drawRectangle({
        x: X(boxX),
        y: Y(ctx, boxY + box),
        width: X(box),
        height: X(box),
        borderColor: rgb(0.4, 0.4, 0.4),
        borderWidth: 0.4,
      });
    }
    if (o.style !== 'blocks' || pk) {
      symbols.push({
        cx: boxX + box / 2,
        cy: boxY + box / 2,
        size: box * 0.82,
        s: e.symbol,
        ink: !pk && o.style !== 'bw' ? inkFor(colour) : [17, 17, 17],
      });
    }
    if (!pk && o.style !== 'bw') {
      // A small swatch beside the symbol, for colour-blind readers and B/W copies.
      page.drawRectangle({
        x: X(boxX + box + 1.5),
        y: Y(ctx, boxY + box),
        width: X(box * 0.5),
        height: X(box),
        color: rgb(colour[0] / 255, colour[1] / 255, colour[2] / 255),
      });
    }
    const thread = getThread(e.threads[0]);
    const code = e.threads.map((t) => (pk ? t.code : `${t.brand} ${t.code}`)).join(' + ');
    const ty = y + rowH / 2 + 1.3;
    const cell = (key: string, s: string) => {
      const col = cols.find((x) => x.key === key);
      if (col) label(ctx, page, s, MARGIN + col.x, ty, 8.5, key === 'thread' ? ctx.bold : ctx.text);
    };
    cell(
      'thread',
      pk ? `${e.threads[0].brand === 'DMC' ? '' : e.threads[0].brand + ' '}${code}`.trim() : code,
    );
    cell(
      'name',
      truncate(
        ctx,
        e.threads.map((t) => getThread(t)?.name ?? '').join(' + ') || (thread?.name ?? ''),
        pk ? 70 : 50,
        8.5,
      ),
    );
    if (!pk) {
      const other = e.threads[0].brand === 'DMC' ? 'Anchor' : 'DMC';
      const eq = e.threads.length === 1 ? equivalentThread(e.threads[0], other) : undefined;
      cell('equivalent', eq ? `≈ ${other} ${eq.thread.code}` : '');
    }
    cell('strands', String(e.strands));
    cell(
      'stitches',
      (pk ? c.full : c.full + c.half + c.quarter + c.threeQuarter).toLocaleString(o.labels.locale),
    );
    if (!pk) {
      cell('skeins', String(estimateColor(c, e.strands, e.backStrands, p.fabric).skeins));
      cell('skeinsAlt', String(estimateColor(c, e.strands, e.backStrands, alt).skeins));
    }
    y += rowH;
  }

  if (!pk) {
    const back = entries.filter((e) => (counts.get(e.id)?.backstitchCells ?? 0) > 0);
    const knots = entries.filter((e) => (counts.get(e.id)?.knots ?? 0) > 0);
    const section = (
      titleText: string,
      list: PaletteEntry[],
      value: (e: PaletteEntry) => string,
      sample: (x: number, yy: number, c: Rgb) => void,
    ) => {
      if (!list.length) return;
      if (y + 12 + rowH > ctx.ph - MARGIN - FOOTER) {
        flush();
        page = newPage(ctx);
        y = MARGIN + 8;
      }
      y += 6;
      label(ctx, page, titleText, MARGIN, y, 10.5, ctx.bold);
      y += 3;
      for (const e of list) {
        if (y + rowH > ctx.ph - MARGIN - FOOTER) {
          flush();
          page = newPage(ctx);
          y = MARGIN + 8;
        }
        const colour = ctx.colours.get(e.id) ?? [0, 0, 0];
        sample(MARGIN + 1, y + rowH / 2, o.style === 'bw' ? [0, 0, 0] : colour);
        const ty = y + rowH / 2 + 1.3;
        label(
          ctx,
          page,
          e.threads.map((t) => `${t.brand} ${t.code}`).join(' + '),
          MARGIN + 18,
          ty,
          8.5,
          ctx.bold,
        );
        label(
          ctx,
          page,
          truncate(ctx, getThread(e.threads[0])?.name ?? '', 50, 8.5),
          MARGIN + 46,
          ty,
          8.5,
        );
        label(ctx, page, value(e), MARGIN + 120, ty, 8.5);
        y += rowH;
      }
    };
    const cellMm = 25.4 / stitchesPerInch(p.fabric);
    section(
      `${L.backstitch} · ${L.length}`,
      back,
      (e) =>
        `${e.backStrands} · ${((counts.get(e.id)!.backstitchCells * cellMm) / 10).toLocaleString(o.labels.locale, { maximumFractionDigits: 1 })} cm`,
      (x, yy, c) =>
        page.drawLine({
          start: { x: X(x), y: Y(ctx, yy) },
          end: { x: X(x + 12), y: Y(ctx, yy) },
          thickness: 1.6,
          color: rgb(c[0] / 255, c[1] / 255, c[2] / 255),
          lineCap: LineCapStyle.Round,
        }),
    );
    section(
      `${L.knots} · ${L.count}`,
      knots,
      (e) => `${e.strands} · ${counts.get(e.id)!.knots}`,
      (x, yy, c) =>
        page.drawCircle({
          x: X(x + 5),
          y: Y(ctx, yy),
          size: X(1.6),
          color: rgb(c[0] / 255, c[1] / 255, c[2] / 255),
          borderColor: rgb(0.2, 0.2, 0.2),
          borderWidth: 0.4,
        }),
    );
  } else if (p.partials.size || p.backstitches.length || p.knots.length) {
    y += 6;
    label(
      ctx,
      page,
      o.labels.key.partialNote,
      MARGIN,
      y,
      8.5,
      ctx.text,
      rgb(0.35, 0.32, 0.3),
      ctx.pw - 2 * MARGIN,
    );
  }
  flush();
}

function truncate(ctx: Ctx, s: string, maxMm: number, size: number): string {
  if (ctx.text.widthOfTextAtSize(s, size) / PT <= maxMm) return s;
  let t = s;
  while (t.length > 1 && ctx.text.widthOfTextAtSize(t + '…', size) / PT > maxMm) t = t.slice(0, -1);
  return t + '…';
}

// --- Page map ----------------------------------------------------------------------------------

function pageMapPage(ctx: Ctx, g: ChartGrid): void {
  const p = ctx.pattern;
  const page = newPage(ctx);
  label(ctx, page, ctx.o.labels.pageMap, MARGIN, MARGIN + 8, 13, ctx.bold);
  const boxW = ctx.pw - 2 * MARGIN;
  const boxH = ctx.ph - 2 * MARGIN - 30;
  const k = Math.min(boxW / p.width, boxH / p.height);
  const ox = MARGIN + (boxW - p.width * k) / 2;
  const oy = MARGIN + 18;
  blocksPreview(ctx, page, ox, oy, p.width * k, p.height * k);
  page.drawRectangle({
    x: X(ox),
    y: Y(ctx, oy + p.height * k),
    width: X(p.width * k),
    height: X(p.height * k),
    color: rgb(1, 1, 1),
    opacity: 0.45,
  });
  let pageNo = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      pageNo++;
      const x0 = c * g.cellsX;
      const y0 = r * g.cellsY;
      const x1 = Math.min(p.width, x0 + g.cellsX);
      const y1 = Math.min(p.height, y0 + g.cellsY);
      page.drawRectangle({
        x: X(ox + x0 * k),
        y: Y(ctx, oy + y1 * k),
        width: X((x1 - x0) * k),
        height: X((y1 - y0) * k),
        borderColor: rgb(0.62, 0.18, 0.27),
        borderWidth: 1,
      });
      const s = String(pageNo);
      const size = Math.min(28, Math.max(9, ((x1 - x0) * k) / 3));
      const w = ctx.bold.widthOfTextAtSize(s, size) / PT;
      label(
        ctx,
        page,
        s,
        ox + ((x0 + x1) / 2) * k - w / 2,
        oy + ((y0 + y1) / 2) * k + size / PT / 3,
        size,
        ctx.bold,
        rgb(0.62, 0.18, 0.27),
      );
    }
  }
  // Centre lines.
  const cx = ox + (p.width / 2) * k;
  const cy = oy + (p.height / 2) * k;
  page.drawLine({
    start: { x: X(cx), y: Y(ctx, oy - 3) },
    end: { x: X(cx), y: Y(ctx, oy + p.height * k + 3) },
    thickness: 0.6,
    color: rgb(0.2, 0.2, 0.2),
    dashArray: [3, 2],
  });
  page.drawLine({
    start: { x: X(ox - 3), y: Y(ctx, cy) },
    end: { x: X(ox + p.width * k + 3), y: Y(ctx, cy) },
    thickness: 0.6,
    color: rgb(0.2, 0.2, 0.2),
    dashArray: [3, 2],
  });
  footer(ctx, page);
}

// --- Chart pages -------------------------------------------------------------------------------

function chartPage(
  ctx: Ctx,
  g: ChartGrid,
  col: number,
  row: number,
  n: number,
  total: number,
): void {
  const { pattern: p, o } = ctx;
  const pk = o.patternKeeper;
  const style: ChartStyle = pk ? 'bw' : o.style;
  const ov = pk ? 0 : Math.max(0, Math.min(3, o.overlap));
  const page = newPage(ctx);
  const x0 = col * g.cellsX;
  const y0 = row * g.cellsY;
  const x1 = Math.min(p.width, x0 + g.cellsX);
  const y1 = Math.min(p.height, y0 + g.cellsY);
  // Drawn range including grey overlap from neighbours.
  const dx0 = Math.max(0, x0 - (col > 0 ? ov : 0));
  const dy0 = Math.max(0, y0 - (row > 0 ? ov : 0));
  const dx1 = Math.min(p.width, x1 + (x1 < p.width ? ov : 0));
  const dy1 = Math.min(p.height, y1 + (y1 < p.height ? ov : 0));
  const c = g.cell;
  const left = MARGIN + BAND;
  const top = MARGIN + HEADER + BAND;
  const gx = (x: number) => left + (x - dx0) * c;
  const gy = (y: number) => top + (y - dy0) * c;
  const inMain = (x: number, y: number) => x >= x0 && x < x1 && y >= y0 && y < y1;

  label(ctx, page, p.meta.title || o.labels.untitled, MARGIN, MARGIN + 4, 10, ctx.bold);
  label(
    ctx,
    page,
    `${o.labels.page(n, total)} · ${o.labels.region(x0 + 1, x1, y0 + 1, y1)}`,
    MARGIN,
    MARGIN + 8.5,
    8,
    ctx.text,
    rgb(0.4, 0.37, 0.35),
  );

  // Colour fills.
  if (style !== 'bw') {
    const groups = new Map<string, [number, number, number, number][]>();
    const add = (rgbc: Rgb, r: [number, number, number, number]) => {
      const key = rgbc.join(',');
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(r);
    };
    for (let y = dy0; y < dy1; y++) {
      for (let x = dx0; x < dx1; x++) {
        const i = y * p.width + x;
        const main = inMain(x, y);
        const full = p.cells[i];
        if (full) {
          const colour = ctx.colours.get(full) ?? [128, 128, 128];
          add(main ? colour : lighten(colour, 0.6), [gx(x), gy(y), c, c]);
          continue;
        }
        for (const s of p.partials.get(i) ?? []) {
          if (pk) continue;
          const colour = ctx.colours.get(s.id) ?? [128, 128, 128];
          for (const a of ARMS) {
            if (s.mask & a)
              add(main ? colour : lighten(colour, 0.6), [
                gx(x) + QUAD[a][0] * c * 0.5,
                gy(y) + QUAD[a][1] * c * 0.5,
                c / 2,
                c / 2,
              ]);
          }
        }
      }
    }
    const ops: PDFOperator[] = [pushGraphicsState()];
    for (const [key, rects] of groups) {
      ops.push(setFill(key.split(',').map(Number) as unknown as Rgb));
      for (const [rx, ry, rw, rh] of rects)
        ops.push(rectangle(X(rx), Y(ctx, ry + rh), X(rw) + 0.02, X(rh) + 0.02));
      ops.push(fill());
    }
    ops.push(popGraphicsState());
    page.pushOperators(...ops);
  }

  // Symbols.
  if (style !== 'blocks') {
    const items: { cx: number; cy: number; size: number; s: string; ink: Rgb }[] = [];
    for (let y = dy0; y < dy1; y++) {
      for (let x = dx0; x < dx1; x++) {
        const i = y * p.width + x;
        const main = inMain(x, y);
        const full = p.cells[i];
        const inkOf = (id: number): Rgb => {
          if (!main) return [150, 150, 150];
          if (style === 'bw') return [17, 17, 17];
          return inkFor(ctx.colours.get(id) ?? [255, 255, 255]);
        };
        if (full) {
          const e = ctx.entries.get(full);
          if (e?.symbol)
            items.push({
              cx: gx(x) + c / 2,
              cy: gy(y) + c / 2,
              size: c * 0.8,
              s: e.symbol,
              ink: inkOf(full),
            });
          continue;
        }
        if (pk) continue;
        for (const s of p.partials.get(i) ?? []) {
          const e = ctx.entries.get(s.id);
          if (!e?.symbol) continue;
          const [qx, qy] = centroid(s);
          items.push({
            cx: gx(x) + qx * c,
            cy: gy(y) + qy * c,
            size: c * 0.44,
            s: e.symbol,
            ink: inkOf(s.id),
          });
        }
      }
    }
    symbolOps(ctx, page, items);
  }

  // Partial stitch geometry (thin arms) so B/W copies stay unambiguous.
  if (!pk) {
    const ops: PDFOperator[] = [pushGraphicsState(), setStroke([90, 90, 90]), setLineWidth(0.3)];
    let any = false;
    for (const [i, list] of p.partials) {
      const x = i % p.width;
      const y = (i - x) / p.width;
      if (x < dx0 || x >= dx1 || y < dy0 || y >= dy1) continue;
      for (const s of list) {
        for (const a of ARMS) {
          if (!(s.mask & a)) continue;
          any = true;
          ops.push(
            moveTo(X(gx(x) + c / 2), Y(ctx, gy(y) + c / 2)),
            lineTo(X(gx(x) + QUAD[a][0] * c), Y(ctx, gy(y) + QUAD[a][1] * c)),
            stroke(),
          );
        }
      }
    }
    ops.push(popGraphicsState());
    if (any) page.pushOperators(...ops);
  }

  // Grid: thin lines for every cell, heavy every 10, nothing else (Pattern Keeper friendly).
  const ops: PDFOperator[] = [pushGraphicsState(), setLineCap(LineCapStyle.Butt)];
  const line = (ax: number, ay: number, bx: number, by: number) => {
    ops.push(moveTo(X(ax), Y(ctx, ay)), lineTo(X(bx), Y(ctx, by)));
  };
  ops.push(setStroke([110, 110, 110]), setLineWidth(0.25));
  for (let x = dx0; x <= dx1; x++) if (x % 10) line(gx(x), gy(dy0), gx(x), gy(dy1));
  for (let y = dy0; y <= dy1; y++) if (y % 10) line(gx(dx0), gy(y), gx(dx1), gy(y));
  ops.push(stroke(), setStroke([20, 20, 20]), setLineWidth(0.9));
  for (let x = dx0; x <= dx1; x++)
    if (x % 10 === 0 || x === dx0 || x === dx1) line(gx(x), gy(dy0), gx(x), gy(dy1));
  for (let y = dy0; y <= dy1; y++)
    if (y % 10 === 0 || y === dy0 || y === dy1) line(gx(dx0), gy(y), gx(dx1), gy(y));
  ops.push(stroke(), popGraphicsState());
  page.pushOperators(...ops);

  // Row and column numbers every 10, and centre arrows.
  for (let x = Math.ceil(dx0 / 10) * 10; x <= dx1; x += 10) {
    const s = String(x);
    const w = ctx.text.widthOfTextAtSize(s, 6.5) / PT;
    label(ctx, page, s, gx(x) - w / 2, top - 1.5, 6.5, ctx.text, rgb(0.3, 0.3, 0.3));
  }
  for (let y = Math.ceil(dy0 / 10) * 10; y <= dy1; y += 10) {
    const s = String(y);
    const w = ctx.text.widthOfTextAtSize(s, 6.5) / PT;
    label(ctx, page, s, left - 1.2 - w, gy(y) + 1.1, 6.5, ctx.text, rgb(0.3, 0.3, 0.3));
  }
  const cxp = p.width / 2;
  const cyp = p.height / 2;
  const arrow = (ax: number, ay: number, dir: 'down' | 'right') => {
    const a = 1.6;
    const pts =
      dir === 'down'
        ? [
            [ax - a, ay - a * 1.6],
            [ax + a, ay - a * 1.6],
            [ax, ay],
          ]
        : [
            [ax - a * 1.6, ay - a],
            [ax - a * 1.6, ay + a],
            [ax, ay],
          ];
    page.drawSvgPath(`M ${pts.map(([px, py]) => `${X(px)} ${-Y(ctx, py)}`).join(' L ')} Z`, {
      x: 0,
      y: 0,
      color: rgb(0.62, 0.18, 0.27),
      borderWidth: 0,
    });
  };
  if (cxp >= dx0 && cxp <= dx1) arrow(gx(cxp), top - 3.5, 'down');
  if (cyp >= dy0 && cyp <= dy1) arrow(left - 0.2, gy(cyp), 'right');

  // Backstitch and knots on top (not in the Pattern Keeper file).
  if (!pk) {
    const bs: PDFOperator[] = [
      pushGraphicsState(),
      setLineCap(LineCapStyle.Round),
      setLineWidth(Math.max(0.9, c * PT * 0.12)),
    ];
    let any = false;
    for (const b of p.backstitches) {
      const bx0 = Math.min(b.x1, b.x2) / 2;
      const bx1 = Math.max(b.x1, b.x2) / 2;
      const by0 = Math.min(b.y1, b.y2) / 2;
      const by1 = Math.max(b.y1, b.y2) / 2;
      if (bx1 < dx0 || bx0 > dx1 || by1 < dy0 || by0 > dy1) continue;
      any = true;
      const colour = style === 'bw' ? ([0, 0, 0] as Rgb) : (ctx.colours.get(b.id) ?? [0, 0, 0]);
      bs.push(
        setStroke(colour),
        moveTo(X(gx(b.x1 / 2)), Y(ctx, gy(b.y1 / 2))),
        lineTo(X(gx(b.x2 / 2)), Y(ctx, gy(b.y2 / 2))),
        stroke(),
      );
    }
    bs.push(popGraphicsState());
    if (any) page.pushOperators(...bs);
    for (const k of p.knots) {
      const kx = k.x / 2;
      const ky = k.y / 2;
      if (kx < dx0 || kx > dx1 || ky < dy0 || ky > dy1) continue;
      const colour = style === 'bw' ? ([0, 0, 0] as Rgb) : (ctx.colours.get(k.id) ?? [0, 0, 0]);
      page.drawCircle({
        x: X(gx(kx)),
        y: Y(ctx, gy(ky)),
        size: X(c * 0.28),
        color: rgb(colour[0] / 255, colour[1] / 255, colour[2] / 255),
        borderColor: rgb(0.1, 0.1, 0.1),
        borderWidth: 0.4,
      });
    }
  }
  footer(ctx, page);
}
