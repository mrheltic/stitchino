import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { EditorDocument } from '../../core/model/document.ts';
import { SYMBOL_FONT_FAMILY } from '../../core/model/symbols.ts';
import { ChartRenderer, type Overlay, type RenderOptions } from '../../render/chartRenderer.ts';
import { Viewport } from '../../render/viewport.ts';
import type { PointerCell } from './toolController.ts';

/** What the view needs from a tool: pointer input in cells, and an overlay to draw. */
export interface PointerTool {
  overlay: Overlay;
  /** Registers a callback for overlay changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  down(p: PointerCell): void;
  move(p: PointerCell): void;
  up(p: PointerCell): void;
  hover(p: PointerCell): void;
  leave(): void;
  cancel(): void;
}

export interface ChartViewHandle {
  zoom(factor: number): void;
  fit(): void;
  redraw(): void;
  /** Centres the view on a cell, zooming in if needed. */
  focus(x: number, y: number, minScale?: number): void;
  viewport(): Viewport;
}

/**
 * Interactive canvas showing a pattern. Pan with the middle button, space+drag, the hand tool
 * or two fingers; zoom with ctrl/⌘+wheel, the mouse wheel or a pinch. Other input goes to `tool`.
 */
export function ChartView({
  doc,
  options,
  tool,
  panOnly = false,
  className = '',
  label,
  ref,
  onViewChange,
  initialView,
}: {
  doc: EditorDocument;
  options: Omit<RenderOptions, 'overlay'>;
  tool?: PointerTool;
  /** Single-pointer drags pan instead of going to the tool. */
  panOnly?: boolean;
  className?: string;
  label: string;
  ref?: Ref<ChartViewHandle>;
  onViewChange?: (vp: Viewport) => void;
  /** Centre (in cells) and zoom to open at, instead of fitting the pattern. */
  initialView?: { cx: number; cy: number; scale: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vp = useRef(new Viewport());
  const renderer = useRef<ChartRenderer | null>(null);
  const frame = useRef(0);
  /** Until the user pans or zooms, the view keeps fitting the pattern as the canvas resizes. */
  const userMoved = useRef(false);
  const optionsRef = useRef(options);
  const toolRef = useRef(tool);
  const panOnlyRef = useRef(panOnly);
  const onViewRef = useRef(onViewChange);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const space = useRef(false);
  const initialViewRef = useRef(initialView);

  // One render per animation frame at most; reads the latest props through refs.
  const redraw = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const canvas = canvasRef.current;
      const r = renderer.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !r || !ctx || vp.current.width === 0) return;
      r.render(ctx, vp.current, { ...optionsRef.current, overlay: toolRef.current?.overlay });
      onViewRef.current?.(vp.current);
    });
  }, []);
  const schedule = useRef(redraw);

  useEffect(() => {
    optionsRef.current = options;
    toolRef.current = tool;
    panOnlyRef.current = panOnly;
    onViewRef.current = onViewChange;
    redraw();
  });

  useEffect(() => tool?.subscribe(redraw), [tool, redraw]);

  useEffect(() => {
    renderer.current = new ChartRenderer(doc.pattern);
    userMoved.current = false;
    const unsubscribe = doc.subscribe((info) => {
      renderer.current?.invalidate(info);
      if (info.resized) vp.current.clamp(doc.pattern.width, doc.pattern.height);
      schedule.current();
    });
    document.fonts?.load(`16px "${SYMBOL_FONT_FAMILY}"`).then(() => {
      renderer.current?.fontsReady();
      schedule.current();
    });
    schedule.current();
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [doc]);

  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      vp.current.setSize(rect.width, rect.height, dpr);
      const start = initialViewRef.current;
      if (!userMoved.current && rect.width > 0 && start) {
        initialViewRef.current = undefined;
        userMoved.current = true;
        const v = vp.current;
        v.scale = Math.min(v.maxScale, Math.max(v.minScale, start.scale));
        v.ox = v.width / 2 - start.cx * v.scale;
        v.oy = v.height / 2 - start.cy * v.scale;
        v.clamp(doc.pattern.width, doc.pattern.height);
      } else if (!userMoved.current && rect.width > 0)
        vp.current.fit(doc.pattern.width, doc.pattern.height);
      schedule.current();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  useImperativeHandle(ref, () => ({
    zoom(factor) {
      userMoved.current = true;
      vp.current.zoomAt(vp.current.width / 2, vp.current.height / 2, factor);
      schedule.current();
    },
    fit() {
      vp.current.fit(doc.pattern.width, doc.pattern.height);
      schedule.current();
    },
    redraw() {
      schedule.current();
    },
    focus(x, y, minScale = 16) {
      userMoved.current = true;
      const v = vp.current;
      v.scale = Math.max(v.scale, minScale);
      v.ox = v.width / 2 - (x + 0.5) * v.scale;
      v.oy = v.height / 2 - (y + 0.5) * v.scale;
      schedule.current();
    },
    viewport: () => vp.current,
  }));

  // Wheel needs a non-passive listener to prevent page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userMoved.current = true;
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // Pinch on trackpads arrives as ctrl+wheel; small pixel deltas are two-finger scrolling.
      const trackpadScroll =
        !e.ctrlKey &&
        !e.metaKey &&
        e.deltaMode === 0 &&
        (Math.abs(e.deltaY) < 40 || e.deltaX !== 0);
      if (trackpadScroll) vp.current.pan(-e.deltaX, -e.deltaY);
      else vp.current.zoomAt(x, y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)));
      vp.current.clamp(doc.pattern.width, doc.pattern.height);
      schedule.current();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [doc]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        space.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const cellOf = (e: React.PointerEvent): PointerCell => {
    const r = canvasRef.current!.getBoundingClientRect();
    const [cx, cy] = vp.current.toCell(e.clientX - r.left, e.clientY - r.top);
    return { cx, cy, alt: e.altKey, shift: e.shiftKey };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (pointers.current.size === 2) {
      toolRef.current?.cancel();
      panning.current = null;
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      return;
    }
    if (pointers.current.size > 2) return;
    if (e.button === 1 || space.current || panOnlyRef.current || !toolRef.current) {
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    toolRef.current.down(cellOf(e));
    schedule.current();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (pointers.current.has(e.pointerId))
      pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (pinch.current && pointers.current.size >= 2) {
      userMoved.current = true;
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      vp.current.pan(mx - pinch.current.mx, my - pinch.current.my);
      if (pinch.current.dist > 0) vp.current.zoomAt(mx, my, dist / pinch.current.dist);
      vp.current.clamp(doc.pattern.width, doc.pattern.height);
      pinch.current = { dist, mx, my };
      schedule.current();
      return;
    }
    if (panning.current) {
      userMoved.current = true;
      vp.current.pan(e.clientX - panning.current.x, e.clientY - panning.current.y);
      vp.current.clamp(doc.pattern.width, doc.pattern.height);
      panning.current = { x: e.clientX, y: e.clientY };
      schedule.current();
      return;
    }
    if (e.pointerType === 'touch' && !pointers.current.has(e.pointerId)) return;
    toolRef.current?.move(cellOf(e));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasTracked = pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    if (panning.current) {
      panning.current = null;
      return;
    }
    if (wasTracked) toolRef.current?.up(cellOf(e));
    schedule.current();
  };

  return (
    <div ref={containerRef} className={`relative min-h-0 overflow-hidden ${className}`}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => toolRef.current?.leave()}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
