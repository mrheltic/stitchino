import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CleanupLevel } from '../../core/convert/cleanup.ts';
import { MetaCommand, type EditorDocument } from '../../core/model/document.ts';
import { cleanupCommand, isolatedCount, resizeCommand, type Clip } from '../../core/model/ops.ts';
import { outlineCommand, type OutlineTarget } from '../../core/model/outline.ts';
import { MAX_SIDE, type Fabric, type FabricKind } from '../../core/model/pattern.ts';
import { FABRIC_COLORS, FABRIC_PRESETS, finishedSize } from '../../core/size/fabric.ts';
import { Choice, Field, NumberInput, SliderField, Toggle } from '../components/controls.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Button } from '../components/ui.tsx';
import { getThread } from '../../core/threads/catalog.ts';
import { formatInt, formatSize, threadLabel } from '../format.ts';
import { useSettings } from '../state/settings.ts';
import { textClip } from './text.ts';

const ANCHORS: [number, number][] = [
  [0, 0],
  [0.5, 0],
  [1, 0],
  [0, 0.5],
  [0.5, 0.5],
  [1, 0.5],
  [0, 1],
  [0.5, 1],
  [1, 1],
];

export function ResizeDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: EditorDocument;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const units = useSettings((s) => s.units);
  const p = doc.pattern;
  const [w, setW] = useState(p.width);
  const [h, setH] = useState(p.height);
  const [anchor, setAnchor] = useState(4);
  const size = finishedSize(w, h, p.fabric);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.resize.title')}
      description={t('editor.resize.hint')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={w === p.width && h === p.height}
            onClick={() => {
              const [ax, ay] = ANCHORS[anchor];
              doc.execute(resizeCommand(p, w, h, ax, ay));
              onOpenChange(false);
            }}
          >
            {t('editor.resize.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={t('blank.size')}
          hint={formatSize(size.widthMm, size.heightMm, units, i18n.resolvedLanguage)}
        >
          <div className="flex items-center gap-3">
            <NumberInput
              label={t('blank.width')}
              value={w}
              min={1}
              max={MAX_SIDE}
              onChange={setW}
              suffix="×"
            />
            <NumberInput
              label={t('blank.height')}
              value={h}
              min={1}
              max={MAX_SIDE}
              onChange={setH}
              suffix={t('wizard.size.stitchesShort')}
            />
          </div>
        </Field>
        <Field label={t('editor.resize.anchor')}>
          <div className="grid w-28 grid-cols-3 gap-1">
            {ANCHORS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('editor.resize.anchorCell', { n: i + 1 })}
                aria-pressed={anchor === i}
                onClick={() => setAnchor(i)}
                className={`aspect-square rounded border ${anchor === i ? 'border-accent bg-accent' : 'border-line bg-surface-2'}`}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

export function PropertiesDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: EditorDocument;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const p = doc.pattern;
  const [meta, setMeta] = useState(p.meta);
  const [fabric, setFabric] = useState<Fabric>(p.fabric);
  const preset = FABRIC_PRESETS.find((x) => x.kind === fabric.kind)!;
  const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.properties.title')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              doc.execute(new MetaCommand({ meta: p.meta, fabric: p.fabric }, { meta, fabric }));
              onOpenChange(false);
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('wizard.create.name')} htmlFor="meta-title">
          <input
            id="meta-title"
            className={field}
            value={meta.title}
            maxLength={200}
            onChange={(e) => setMeta({ ...meta, title: e.target.value })}
          />
        </Field>
        <Field label={t('editor.properties.author')} htmlFor="meta-author">
          <input
            id="meta-author"
            className={field}
            value={meta.author ?? ''}
            maxLength={200}
            onChange={(e) => setMeta({ ...meta, author: e.target.value })}
          />
        </Field>
        <Field label={t('editor.properties.copyright')} htmlFor="meta-copyright">
          <input
            id="meta-copyright"
            className={field}
            value={meta.copyright ?? ''}
            maxLength={500}
            onChange={(e) => setMeta({ ...meta, copyright: e.target.value })}
          />
        </Field>
        <Field label={t('editor.properties.notes')} htmlFor="meta-notes">
          <textarea
            id="meta-notes"
            className={`${field} min-h-20`}
            value={meta.notes ?? ''}
            maxLength={10000}
            onChange={(e) => setMeta({ ...meta, notes: e.target.value })}
          />
        </Field>
        <Field label={t('wizard.size.fabric')}>
          <Choice<FabricKind>
            name="props-fabric-kind"
            size="sm"
            value={fabric.kind}
            onChange={(kind) => {
              const pr = FABRIC_PRESETS.find((x) => x.kind === kind)!;
              setFabric({
                ...fabric,
                kind,
                count: pr.counts[Math.min(1, pr.counts.length - 1)],
                over: pr.defaultOver,
              });
            }}
            options={FABRIC_PRESETS.map((x) => ({
              value: x.kind,
              label: t(`fabric.kinds.${x.kind}`),
            }))}
          />
          <Choice<number>
            name="props-fabric-count"
            size="sm"
            value={fabric.count}
            onChange={(count) => setFabric({ ...fabric, count })}
            options={preset.counts.map((c) => ({ value: c, label: `${c} ct` }))}
          />
          {fabric.kind !== 'aida' && (
            <Toggle
              checked={fabric.over === 2}
              onChange={(v) => setFabric({ ...fabric, over: v ? 2 : 1 })}
            >
              {t('wizard.size.overTwo')}
            </Toggle>
          )}
        </Field>
        <Field label={t('wizard.size.fabricColor')}>
          <div className="flex flex-wrap gap-2">
            {FABRIC_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                title={t(`fabric.colors.${c.id}`)}
                aria-label={t(`fabric.colors.${c.id}`)}
                aria-pressed={fabric.color === c.hex}
                onClick={() => setFabric({ ...fabric, color: c.hex })}
                className={`size-8 rounded-full border-2 ${fabric.color === c.hex ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

const FONTS = [
  { id: 'sans', css: 'system-ui, sans-serif' },
  { id: 'serif', css: 'Georgia, "Times New Roman", serif' },
  { id: 'script', css: '"Brush Script MT", "Segoe Script", cursive' },
  { id: 'mono', css: 'ui-monospace, "Courier New", monospace' },
] as const;

export function TextDialog({
  open,
  onOpenChange,
  activeId,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  activeId: number | null;
  onInsert: (clip: Clip) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [font, setFont] = useState<(typeof FONTS)[number]['id']>('sans');
  const [height, setHeight] = useState(9);
  const [bold, setBold] = useState(true);
  const clip = useMemo(
    () =>
      text.trim() && activeId
        ? textClip(text, FONTS.find((f) => f.id === font)!.css, height, bold, activeId)
        : null,
    [text, font, height, bold, activeId],
  );
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const w = clip?.width ?? 1;
    const h = clip?.height ?? 1;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#9e2f45';
    for (const i of clip?.cells.keys() ?? []) ctx.fillRect(i % w, Math.floor(i / w), 1, 1);
  }, [clip]);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.text.title')}
      description={activeId ? t('editor.text.hint') : t('editor.text.needColor')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={!clip || clip.cells.size === 0}
            onClick={() => {
              if (clip) onInsert(clip);
              onOpenChange(false);
            }}
          >
            {t('editor.text.insert')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('editor.text.text')} htmlFor="stitch-text">
          <textarea
            id="stitch-text"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            rows={2}
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Field label={t('editor.text.font')}>
          <Choice
            name="text-font"
            size="sm"
            value={font}
            onChange={setFont}
            options={FONTS.map((f) => ({ value: f.id, label: t(`editor.text.fonts.${f.id}`) }))}
          />
        </Field>
        <SliderField
          label={t('editor.text.height')}
          value={height}
          min={5}
          max={60}
          onChange={setHeight}
          format={(v) => t('wizard.size.stitches', { count: v })}
        />
        <Toggle checked={bold} onChange={setBold}>
          {t('editor.text.bold')}
        </Toggle>
        {clip && (
          <div className="rounded-lg border border-line bg-white p-2">
            <canvas
              ref={preview}
              className="mx-auto block h-auto max-h-40 max-w-full"
              style={{ imageRendering: 'pixelated', width: `${Math.min(100, clip.width * 4)}%` }}
            />
            <p className="mt-1 text-center text-xs text-muted">
              {clip.width} × {clip.height}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function CleanupDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: EditorDocument;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [level, setLevel] = useState<CleanupLevel>(1);
  const [protect, setProtect] = useState(true);
  const count = open ? isolatedCount(doc.pattern) : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.cleanup.title')}
      description={t('editor.cleanup.count', {
        count,
        formatted: formatInt(count, i18n.resolvedLanguage),
      })}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              const cmd = cleanupCommand(doc.pattern, level, protect);
              if (cmd.size) doc.execute(cmd);
              onOpenChange(false);
            }}
          >
            {t('editor.cleanup.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('wizard.colors.cleanup')}>
          <Choice<CleanupLevel>
            name="cleanup-level"
            size="sm"
            value={level}
            onChange={setLevel}
            options={([1, 2, 3] as const).map((v) => ({
              value: v,
              label: t(`wizard.colors.cleanupLevels.${v}`),
            }))}
          />
        </Field>
        <Toggle checked={protect} onChange={setProtect}>
          {t('wizard.colors.protectDetails')}
        </Toggle>
      </div>
    </Dialog>
  );
}

export function OutlineDialog({
  doc,
  open,
  onOpenChange,
}: {
  doc: EditorDocument;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<OutlineTarget>('design');
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.outline.title')}
      description={t('editor.outline.description')}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={() => {
              const cmd = outlineCommand(doc.pattern, target);
              if (cmd) doc.execute(cmd);
              onOpenChange(false);
            }}
          >
            {t('editor.outline.apply')}
          </Button>
        </>
      }
    >
      <Field label={t('editor.outline.around')}>
        <select
          value={String(target)}
          onChange={(e) =>
            setTarget(e.target.value === 'design' ? 'design' : Number(e.target.value))
          }
          className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
        >
          <option value="design">{t('editor.outline.design')}</option>
          {doc.pattern.palette.map((e) => (
            <option key={e.id} value={e.id}>
              {e.threads
                .map((r) => `${threadLabel(r.brand, r.code)} ${getThread(r)?.name ?? ''}`.trim())
                .join(' + ')}
            </option>
          ))}
        </select>
      </Field>
    </Dialog>
  );
}
