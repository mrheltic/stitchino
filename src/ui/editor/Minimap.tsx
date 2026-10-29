import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from 'react';
import type { EditorDocument } from '../../core/model/document.ts';
import { makeCanvas } from '../../render/symbolAtlas.ts';
import type { Viewport } from '../../render/viewport.ts';
import { paintCells } from '../patternPaint.ts';

export interface MinimapHandle {
  update(vp: Viewport): void;
}

const SIZE = 160;

/** Overview of the whole pattern with the visible area; drag on it to move the view. */
export function Minimap({
  doc,
  version,
  label,
  onNavigate,
  ref,
}: {
  doc: EditorDocument;
  version: number;
  label: string;
  onNavigate: (cx: number, cy: number) => void;
  ref?: Ref<MinimapHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useRef<ReturnType<typeof makeCanvas> | null>(null);
  const view = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [shown, setShown] = useState(false);
  const p = doc.pattern;
  const scale = Math.min(SIZE / p.width, SIZE / p.height);
  const w = Math.max(1, Math.round(p.width * scale));
  const h = Math.max(1, Math.round(p.height * scale));

  const draw = useRef(() => {});
  useEffect(() => {
    draw.current = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx || !base.current) return;
      const pat = doc.pattern;
      const k = Math.min(SIZE / pat.width, SIZE / pat.height);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(base.current as CanvasImageSource, 0, 0, pat.width * k, pat.height * k);
      const v = view.current;
      if (v) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#1d4ed8';
        ctx.fillStyle = 'rgba(29, 78, 216, 0.12)';
        const rx = Math.max(0, v.x0 * k);
        const ry = Math.max(0, v.y0 * k);
        const rw = Math.min(pat.width * k, v.x1 * k) - rx;
        const rh = Math.min(pat.height * k, v.y1 * k) - ry;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx + 1, ry + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
      }
    };
  }, [doc]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const pat = doc.pattern;
      base.current = makeCanvas(pat.width, pat.height);
      const ctx = base.current.getContext('2d') as CanvasRenderingContext2D;
      paintCells(ctx, pat.width, pat.height, pat.cells, pat.palette, pat.fabric.color);
      draw.current();
    }, 250);
    return () => clearTimeout(timer);
  }, [doc, version]);

  useImperativeHandle(ref, () => ({
    update(vp) {
      const [x0, y0] = vp.toCell(0, 0);
      const [x1, y1] = vp.toCell(vp.width, vp.height);
      view.current = { x0, y0, x1, y1 };
      const all = x0 <= 0 && y0 <= 0 && x1 >= doc.pattern.width && y1 >= doc.pattern.height;
      setShown(!all);
      draw.current();
    },
  }));

  const navigate = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const r = e.currentTarget.getBoundingClientRect();
    onNavigate(
      ((e.clientX - r.left) / r.width) * p.width,
      ((e.clientY - r.top) / r.height) * p.height,
    );
  };

  return (
    <canvas
      ref={canvasRef}
      width={w}
      height={h}
      aria-label={label}
      role="img"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        navigate(e);
      }}
      onPointerMove={navigate}
      className={`absolute bottom-3 right-3 z-10 cursor-pointer touch-none rounded-md border border-line bg-surface shadow-lg ${shown ? '' : 'hidden'}`}
      style={{ width: w, height: h, imageRendering: 'pixelated' }}
    />
  );
}
