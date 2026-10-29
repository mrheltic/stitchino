import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { resizeCrop, type CropHandle } from './cropMath.ts';
import { drawOriented, orientedSize, FULL_CROP, type Crop, type Orientation } from './image.ts';

/** The whole (rotated) photo with a draggable crop box; the crop is committed on release. */
export function CropEditor({
  bitmap,
  orientation,
  crop,
  ratio,
  onChange,
}: {
  bitmap: ImageBitmap;
  orientation: Orientation;
  crop: Crop;
  /** Pixel aspect ratio to keep, or null for a free crop. */
  ratio: number | null;
  onChange: (c: Crop) => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Crop | null>(null);
  const drag = useRef<{ handle: CropHandle; startX: number; startY: number; start: Crop } | null>(
    null,
  );
  const [Wo, Ho] = orientedSize(bitmap, orientation.rotation);
  const shown = draft ?? crop;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const src = drawOriented(bitmap, orientation, FULL_CROP, 1000);
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')?.drawImage(src, 0, 0);
  }, [bitmap, orientation]);

  const onDown = (e: ReactPointerEvent<HTMLElement>) => {
    const handle = (e.target as HTMLElement).dataset.handle as CropHandle | undefined;
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, start: shown };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const area = canvasRef.current?.getBoundingClientRect();
    if (!d || !area) return;
    const dx = (e.clientX - d.startX) / area.width;
    const dy = (e.clientY - d.startY) / area.height;
    setDraft(resizeCrop(d.start, d.handle, dx, dy, ratio === null ? null : (ratio * Ho) / Wo));
  };

  const onUp = () => {
    if (drag.current && draft) onChange(draft);
    drag.current = null;
    setDraft(null);
  };

  const handleClass = 'absolute size-5 rounded-full border-2 border-white bg-accent shadow';
  return (
    <div
      className="relative mx-auto touch-none select-none overflow-hidden rounded-lg"
      style={{ width: `min(100%, calc(var(--preview-h) * ${Wo / Ho}))` }}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <canvas
        ref={canvasRef}
        className="block h-auto w-full"
        aria-label={t('wizard.crop.area')}
        role="img"
      />
      <div
        ref={boxRef}
        className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={{
          left: `${shown.x * 100}%`,
          top: `${shown.y * 100}%`,
          width: `${shown.w * 100}%`,
          height: `${shown.h * 100}%`,
        }}
        data-handle="move"
        onPointerDown={onDown}
      >
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/30" />
          ))}
        </div>
        <span className={`${handleClass} -left-2.5 -top-2.5 cursor-nwse-resize`} data-handle="nw" />
        <span
          className={`${handleClass} -right-2.5 -top-2.5 cursor-nesw-resize`}
          data-handle="ne"
        />
        <span
          className={`${handleClass} -bottom-2.5 -left-2.5 cursor-nesw-resize`}
          data-handle="sw"
        />
        <span
          className={`${handleClass} -bottom-2.5 -right-2.5 cursor-nwse-resize`}
          data-handle="se"
        />
      </div>
    </div>
  );
}
