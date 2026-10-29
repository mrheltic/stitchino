import type { Pattern } from '../core/model/pattern.ts';
import { ChartRenderer, type ViewMode } from './chartRenderer.ts';
import { makeCanvas } from './symbolAtlas.ts';
import { Viewport } from './viewport.ts';

const MAX_SIDE = 8000;
const MARGIN = 24;

/** The whole chart as a PNG, at the largest cell size that keeps the image under 8000 px. */
export async function chartPng(pattern: Pattern, mode: ViewMode, fontsReady = true): Promise<Blob> {
  const px = Math.max(
    4,
    Math.min(24, Math.floor((MAX_SIDE - 2 * MARGIN) / Math.max(pattern.width, pattern.height))),
  );
  const width = pattern.width * px + 2 * MARGIN;
  const height = pattern.height * px + 2 * MARGIN;
  const canvas = makeCanvas(width, height);
  const vp = new Viewport();
  vp.setSize(width, height, 1);
  vp.scale = px;
  vp.ox = MARGIN;
  vp.oy = MARGIN;
  const renderer = new ChartRenderer(pattern);
  if (fontsReady) renderer.fontsReady();
  renderer.render(canvas.getContext('2d') as CanvasRenderingContext2D, vp, {
    mode,
    grid: mode !== 'realistic',
    rulers: false,
    highlightId: null,
    hidden: new Set(),
    showIsolated: false,
    background: '#ffffff',
  });
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}
