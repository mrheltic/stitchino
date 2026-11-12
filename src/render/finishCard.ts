import type { Pattern } from '../core/model/pattern.ts';
import { stitchedImage } from './mockups.ts';
import { makeCanvas } from './symbolAtlas.ts';

type AnyCanvas = ReturnType<typeof makeCanvas>;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FinishCardText {
  title: string;
  /** One line under the title, e.g. "12,340 stitches · 24 colours · 61 days". */
  stats: string;
  /** Small print at the bottom: who made the chart. */
  credit: string;
}

const WIDTH = 1200;
const MARGIN = 72;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Cuts a line to `max` pixels, ending it with an ellipsis. */
function fit(ctx: Ctx, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** The finished piece as a picture to share: the stitched design with its name and numbers. */
export function finishCard(pattern: Pattern, text: FinishCardText): AnyCanvas {
  const box = WIDTH - 2 * MARGIN;
  const { canvas: art } = stitchedImage(pattern, { fabric: pattern.fabric }, box);
  const k = Math.min(box / art.width, box / art.height);
  const artW = Math.round(art.width * k);
  const artH = Math.round(art.height * k);
  // Three lines of text under the picture: title, numbers, credit.
  const height = MARGIN + artH + 212 + 48;
  const canvas = makeCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d') as Ctx;

  ctx.fillStyle = '#faf7f2';
  ctx.fillRect(0, 0, WIDTH, height);
  const x = Math.round((WIDTH - artW) / 2);
  ctx.save();
  ctx.shadowColor = 'rgba(43,36,32,0.28)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = pattern.fabric.color;
  ctx.fillRect(x, MARGIN, artW, artH);
  ctx.restore();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(art as CanvasImageSource, x, MARGIN, artW, artH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  let y = MARGIN + artH + 64 + 40;
  ctx.fillStyle = '#2b2420';
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText(fit(ctx, text.title, box), WIDTH / 2, y);
  y += 52;
  ctx.fillStyle = '#6b625b';
  ctx.font = `30px ${FONT}`;
  ctx.fillText(fit(ctx, text.stats, box), WIDTH / 2, y);
  y += 56;
  ctx.fillStyle = '#9e2f45';
  ctx.font = `26px ${FONT}`;
  ctx.fillText(fit(ctx, text.credit, box), WIDTH / 2, y);
  return canvas;
}
