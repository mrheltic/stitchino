import {
  Camera,
  FlipHorizontal2,
  ImageUp,
  Loader2,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { NO_ADJUSTMENTS } from '../../core/convert/adjust.ts';
import type { CleanupLevel } from '../../core/convert/cleanup.ts';
import type { DitherMethod } from '../../core/convert/dither.ts';
import type { ConvertOutput, ConvertParams } from '../../core/convert/pipeline.ts';
import { DEFAULT_CONVERT_PARAMS } from '../../core/convert/pipeline.ts';
import type { RasterImage } from '../../core/convert/raster.ts';
import { createPattern, type FabricKind } from '../../core/model/pattern.ts';
import {
  FABRIC_COLORS,
  FABRIC_PRESETS,
  fabricToBuy,
  finishedSize,
} from '../../core/size/fabric.ts';
import { suggestFrame, suggestHoop } from '../../core/size/frames.ts';
import { stitchingAdvice } from '../../core/size/needles.ts';
import { getThread } from '../../core/threads/catalog.ts';
import { BRANDS, type Brand } from '../../core/threads/types.ts';
import { createProject } from '../../storage/projects.ts';
import { createConvertWorker, type ConvertWorker } from '../../workers/convertClient.ts';
import { Choice, Field, NumberInput, SliderField, Toggle } from '../components/controls.tsx';
import { PatternCanvas } from '../components/PatternCanvas.tsx';
import { entryRgb, patternThumbnail } from '../patternPaint.ts';
import { Button, Card, Page, PageHeader } from '../components/ui.tsx';
import { formatDecimal, formatInt, formatLength, formatSize } from '../format.ts';
import { useSettings } from '../state/settings.ts';
import { BlankPattern } from '../wizard/BlankPattern.tsx';
import { CropEditor } from '../wizard/CropEditor.tsx';
import {
  WORKING_MAX_SIDE,
  canvasToBlob,
  cropPixels,
  decodeImage,
  drawOriented,
  orientedSize,
  renderRaster,
  FULL_CROP,
  type Rotation,
} from '../wizard/image.ts';
import { floodSelect } from '../wizard/magicWand.ts';
import { RasterView } from '../wizard/RasterView.tsx';
import { StepCard } from '../wizard/StepCard.tsx';
import {
  ASPECTS,
  cropForAspect,
  pickSettings,
  sanitizeSettings,
  useWizard,
  type AspectPreset,
} from '../wizard/store.ts';
import { db } from '../../storage/db.ts';

const STEPS = ['photo', 'crop', 'adjust', 'size', 'colors', 'create'] as const;
type Step = (typeof STEPS)[number];

/** Photos up to this size are stored as they are; larger ones are re-encoded. */
const MAX_STORED_SOURCE = 8 * 1024 * 1024;

export default function Wizard() {
  const [search] = useSearchParams();
  return search.get('blank') ? <BlankPattern /> : <PhotoWizard />;
}

function PhotoWizard() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const navigate = useNavigate();
  const units = useSettings((st) => st.units);
  const s = useWizard();
  const set = s.set;

  const [file, setFile] = useState<File | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [step, setStep] = useState<Step>('photo');
  const [view, setView] = useState<'photo' | 'pattern'>('photo');
  const [error, setError] = useState<string | null>(null);
  const [conv, setConv] = useState<{
    key: string;
    out: ConvertOutput | null;
    error?: string;
  } | null>(null);
  const [variantState, setVariantState] = useState<{ key: string; outs: ConvertOutput[] } | null>(
    null,
  );
  const [adjusted, setAdjusted] = useState<RasterImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const worker = useRef<ConvertWorker | null>(null);

  useEffect(() => {
    const w = createConvertWorker();
    worker.current = w;
    useWizard.getState().reset();
    return () => w.terminate();
  }, []);

  // --- Derived image data -------------------------------------------------------------------
  const working = useMemo(
    () => (bitmap ? renderRaster(bitmap, s.orientation, s.crop, WORKING_MAX_SIDE) : null),
    [bitmap, s.orientation, s.crop],
  );
  const mask = useMemo(() => {
    if (!working || !s.removeBackground || s.wandSeeds.length === 0) return undefined;
    const m = new Uint8Array(working.width * working.height);
    for (const [fx, fy] of s.wandSeeds)
      floodSelect(working, fx * working.width, fy * working.height, s.wandTolerance, m);
    return m;
  }, [working, s.removeBackground, s.wandSeeds, s.wandTolerance]);

  const [cropW, cropH] = bitmap ? cropPixels(bitmap, s.orientation, s.crop) : [1, 1];
  const height = Math.max(1, Math.round((s.width * cropH) / cropW));
  const advice = stitchingAdvice(s.fabric);
  const params: ConvertParams = useMemo(
    () => ({
      ...DEFAULT_CONVERT_PARAMS,
      width: s.width,
      height,
      brand: s.brand,
      maxColors: s.maxColors,
      dither: s.dither,
      ditherStrength: s.ditherStrength,
      cleanup: s.cleanup,
      protectDetails: s.protectDetails,
      minStitches: s.minStitches,
      strands: advice.strands,
      backStrands: advice.backStrands,
      adjustments: s.adjustments,
    }),
    [
      s.width,
      height,
      s.brand,
      s.maxColors,
      s.dither,
      s.ditherStrength,
      s.cleanup,
      s.protectDetails,
      s.minStitches,
      advice.strands,
      advice.backStrands,
      s.adjustments,
    ],
  );

  // --- Worker pipeline: load → mask → convert (the worker handles calls in order) -------------
  useEffect(() => {
    if (!working || !worker.current) return;
    void worker.current.api.load({ ...working, data: new Uint8ClampedArray(working.data) });
    setLoaded((v) => v + 1);
  }, [working]);

  useEffect(() => {
    if (loaded) void worker.current?.api.setMask(mask ?? null);
  }, [mask, loaded]);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const img = await worker.current?.api.adjusted(s.adjustments);
      if (!cancelled && img) setAdjusted(img);
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [loaded, s.adjustments]);

  // Results remember the request they answer: the preview is "busy" until they match.
  const requestKey = `${loaded}|${s.removeBackground}|${s.wandTolerance}|${JSON.stringify(s.wandSeeds)}|${JSON.stringify(params)}`;
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const out = await worker.current!.api.convert(params);
        if (!cancelled) setConv({ key: requestKey, out });
      } catch (e) {
        const error =
          e instanceof Error && e.name === 'NoCandidateThreadsError'
            ? t('wizard.errors.noThreads')
            : t('wizard.errors.convert');
        if (!cancelled) setConv({ key: requestKey, out: null, error });
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `mask` is a dependency so a new background selection re-runs the conversion.
  }, [loaded, mask, params, requestKey, t]);
  const result = conv?.out ?? null;
  const busy = loaded > 0 && conv?.key !== requestKey;
  const conversionError = conv?.key === requestKey ? conv.error : undefined;

  const variantCounts = useMemo(() => {
    const k = s.maxColors;
    return [...new Set([Math.max(2, k - 10), k, Math.min(80, k + 10)])];
  }, [s.maxColors]);

  const variantsKey = `${requestKey}|${variantCounts.join(',')}`;
  useEffect(() => {
    if (step !== 'create' || !loaded) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const outs = await worker.current?.api.variants(params, variantCounts);
      if (!cancelled && outs) setVariantState({ key: variantsKey, outs });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, loaded, mask, params, variantCounts, variantsKey]);
  const variants = variantState?.key === variantsKey ? variantState.outs : null;

  // --- Photo loading -------------------------------------------------------------------------
  const loadFile = useCallback(
    async (f: File, settings?: unknown) => {
      setError(null);
      try {
        const bmp = await decodeImage(f);
        setFile(f);
        setBitmap(bmp);
        set(
          settings
            ? sanitizeSettings(settings)
            : {
                orientation: { rotation: 0, flip: false },
                crop: FULL_CROP,
                aspect: 'free',
                wandSeeds: [],
                title: f.name.replace(/\.[^.]+$/, ''),
              },
        );
        setConv(null);
        setStep('crop');
        setView('photo');
      } catch {
        setError(t('wizard.errors.unsupported'));
      }
    },
    [set, t],
  );

  // "Regenerate from the photo": start from the project's photo and settings.
  const [search] = useSearchParams();
  const fromId = search.get('from');
  useEffect(() => {
    if (!fromId) return;
    let cancelled = false;
    void db.sources.get(fromId).then((src) => {
      if (cancelled || !src) return;
      const name = `${useWizard.getState().title || 'foto'}.${src.mime.split('/')[1] ?? 'jpg'}`;
      void loadFile(
        new File([src.bytes as BlobPart], name, { type: src.mime }),
        src.settings ?? {},
      );
    });
    return () => {
      cancelled = true;
    };
  }, [fromId, loadFile]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (item) void loadFile(item);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  const goTo = (next: Step) => {
    setStep(next);
    setView(next === 'crop' || next === 'adjust' ? 'photo' : 'pattern');
  };
  const nextStep = () => goTo(STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(step) + 1)]);

  const rotate = (delta: 90 | -90) => {
    const rotation = ((((s.orientation.rotation + delta) % 360) + 360) % 360) as Rotation;
    set({
      orientation: { ...s.orientation, rotation },
      crop: FULL_CROP,
      aspect: 'free',
      wandSeeds: [],
    });
  };

  const setAspect = (aspect: AspectPreset) => {
    const ratio = ASPECTS[aspect];
    if (!bitmap) return;
    const [Wo, Ho] = orientedSize(bitmap, s.orientation.rotation);
    set({ aspect, crop: ratio === null ? s.crop : cropForAspect(ratio, Wo, Ho), wandSeeds: [] });
  };

  const create = async () => {
    if (!result || !file || !bitmap) return;
    setSaving(true);
    try {
      const pattern = createPattern(result.width, result.height, {
        cells: result.cells,
        palette: result.palette,
        fabric: s.fabric,
        meta: { title: s.title.trim() || t('wizard.create.untitled'), source: 'photo' },
      });
      const thumbnail = await patternThumbnail(
        result.width,
        result.height,
        result.cells,
        result.palette,
        s.fabric.color,
      );
      let bytes: Uint8Array;
      let mime = file.type;
      if (file.size <= MAX_STORED_SOURCE && /^image\/(jpeg|png|webp)$/.test(file.type)) {
        bytes = new Uint8Array(await file.arrayBuffer());
      } else {
        const canvas = drawOriented(bitmap, { rotation: 0, flip: false }, FULL_CROP, 2400);
        bytes = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
        mime = 'image/jpeg';
      }
      const id = await createProject(pattern, {
        thumbnail,
        source: { bytes, mime, settings: pickSettings(s) },
      });
      navigate(`/project/${id}`);
    } catch {
      setError(t('wizard.errors.save'));
      setSaving(false);
    }
  };

  // --- Rendering -----------------------------------------------------------------------------
  const finished = finishedSize(s.width, height, s.fabric);
  const toBuy = fabricToBuy(finished);
  const frame = suggestFrame(finished);
  const hoop = suggestHoop(finished);
  const has = !!bitmap;
  const stepProps = (id: Step, n: number) => ({
    n,
    title: t(`wizard.steps.${id}`),
    open: step === id,
    disabled: id !== 'photo' && !has,
    onOpen: () => goTo(id),
  });

  const preset = FABRIC_PRESETS.find((p) => p.kind === s.fabric.kind)!;
  const m = result?.metrics;

  return (
    <Page wide>
      <PageHeader title={t('wizard.title')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="space-y-3">
          <StepCard {...stepProps('photo', 1)} summary={file?.name}>
            <PhotoPicker onFile={loadFile} hasPhoto={has} />
          </StepCard>

          <StepCard
            {...stepProps('crop', 2)}
            summary={s.aspect === 'free' ? t('wizard.crop.free') : s.aspect}
          >
            <Field label={t('wizard.crop.aspect')}>
              <Choice<AspectPreset>
                name="aspect"
                size="sm"
                value={s.aspect}
                onChange={setAspect}
                options={(Object.keys(ASPECTS) as AspectPreset[]).map((a) => ({
                  value: a,
                  label: a === 'free' ? t('wizard.crop.free') : a,
                }))}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => rotate(-90)}
                aria-label={t('wizard.crop.rotateLeft')}
                title={t('wizard.crop.rotateLeft')}
              >
                <RotateCcw size={18} aria-hidden />
              </Button>
              <Button
                onClick={() => rotate(90)}
                aria-label={t('wizard.crop.rotateRight')}
                title={t('wizard.crop.rotateRight')}
              >
                <RotateCw size={18} aria-hidden />
              </Button>
              <Button
                onClick={() =>
                  set({
                    orientation: { ...s.orientation, flip: !s.orientation.flip },
                    wandSeeds: [],
                  })
                }
                aria-pressed={s.orientation.flip}
                title={t('wizard.crop.flip')}
              >
                <FlipHorizontal2 size={18} aria-hidden />
                {t('wizard.crop.flip')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => set({ crop: FULL_CROP, aspect: 'free', wandSeeds: [] })}
              >
                {t('wizard.crop.reset')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('wizard.crop.hint')}</p>
            <NextButton onClick={nextStep} />
          </StepCard>

          <StepCard
            {...stepProps('adjust', 3)}
            summary={s.removeBackground ? t('wizard.adjust.backgroundOn') : undefined}
          >
            <SliderField
              label={t('wizard.adjust.brightness')}
              value={s.adjustments.brightness}
              min={-1}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set({ adjustments: { ...s.adjustments, brightness: v } })}
            />
            <SliderField
              label={t('wizard.adjust.contrast')}
              value={s.adjustments.contrast}
              min={-1}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set({ adjustments: { ...s.adjustments, contrast: v } })}
            />
            <SliderField
              label={t('wizard.adjust.saturation')}
              value={s.adjustments.saturation}
              min={-1}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set({ adjustments: { ...s.adjustments, saturation: v } })}
            />
            <SliderField
              label={t('wizard.adjust.midtones')}
              value={s.adjustments.gamma}
              min={0.5}
              max={2}
              step={0.05}
              format={(v) => formatDecimal(v, 2, lng)}
              onChange={(v) => set({ adjustments: { ...s.adjustments, gamma: v } })}
            />
            <SliderField
              label={t('wizard.adjust.sharpen')}
              value={s.adjustments.sharpen}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set({ adjustments: { ...s.adjustments, sharpen: v } })}
            />
            <SliderField
              label={t('wizard.adjust.denoise')}
              hint={t('wizard.adjust.denoiseHint')}
              value={s.adjustments.denoise}
              min={0}
              max={1}
              step={0.05}
              format={pct}
              onChange={(v) => set({ adjustments: { ...s.adjustments, denoise: v } })}
            />
            <Button variant="ghost" onClick={() => set({ adjustments: NO_ADJUSTMENTS })}>
              <Undo2 size={16} aria-hidden />
              {t('wizard.adjust.reset')}
            </Button>
            <div className="space-y-3 rounded-lg bg-surface-2 p-3">
              <Toggle checked={s.removeBackground} onChange={(v) => set({ removeBackground: v })}>
                {t('wizard.adjust.background')}
              </Toggle>
              {s.removeBackground && (
                <>
                  <p className="text-xs text-muted">{t('wizard.adjust.backgroundHint')}</p>
                  <SliderField
                    label={t('wizard.adjust.tolerance')}
                    value={s.wandTolerance}
                    min={0.02}
                    max={0.25}
                    step={0.01}
                    format={(v) => formatInt(v * 400, lng)}
                    onChange={(v) => set({ wandTolerance: v })}
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={s.wandSeeds.length === 0}
                      onClick={() => set({ wandSeeds: s.wandSeeds.slice(0, -1) })}
                    >
                      {t('wizard.adjust.undoPick')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={s.wandSeeds.length === 0}
                      onClick={() => set({ wandSeeds: [] })}
                    >
                      {t('wizard.adjust.clearPicks')}
                    </Button>
                  </div>
                </>
              )}
            </div>
            <NextButton onClick={nextStep} />
          </StepCard>

          <StepCard
            {...stepProps('size', 4)}
            summary={`${s.width} × ${height} · ${formatSize(finished.widthMm, finished.heightMm, units, lng)}`}
          >
            <div className="space-y-2">
              <SliderField
                label={t('wizard.size.width')}
                value={Math.min(s.width, 400)}
                min={10}
                max={400}
                onChange={(v) => set({ width: v })}
                format={(v) => t('wizard.size.stitches', { count: v })}
              />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <NumberInput
                  label={t('wizard.size.width')}
                  value={s.width}
                  min={10}
                  max={1000}
                  onChange={(v) => set({ width: v })}
                  suffix={`× ${height} ${t('wizard.size.stitchesShort')}`}
                />
              </div>
            </div>
            <Field label={t('wizard.size.fabric')}>
              <Choice<FabricKind>
                name="fabric-kind"
                size="sm"
                value={s.fabric.kind}
                onChange={(kind) => {
                  const p = FABRIC_PRESETS.find((x) => x.kind === kind)!;
                  set({
                    fabric: {
                      ...s.fabric,
                      kind,
                      count: p.counts[Math.min(1, p.counts.length - 1)],
                      over: p.defaultOver,
                    },
                  });
                }}
                options={FABRIC_PRESETS.map((p) => ({
                  value: p.kind,
                  label: t(`fabric.kinds.${p.kind}`),
                }))}
              />
              <Choice<number>
                name="fabric-count"
                size="sm"
                value={s.fabric.count}
                onChange={(count) => set({ fabric: { ...s.fabric, count } })}
                options={preset.counts.map((c) => ({ value: c, label: `${c} ct` }))}
              />
              {s.fabric.kind !== 'aida' && (
                <Toggle
                  checked={s.fabric.over === 2}
                  onChange={(v) => set({ fabric: { ...s.fabric, over: v ? 2 : 1 } })}
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
                    aria-pressed={s.fabric.color === c.hex}
                    onClick={() => set({ fabric: { ...s.fabric, color: c.hex } })}
                    className={`size-8 rounded-full border-2 ${s.fabric.color === c.hex ? 'border-accent ring-2 ring-accent/40' : 'border-line'}`}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
            </Field>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-3 text-sm">
              <dt className="text-muted">{t('wizard.size.finished')}</dt>
              <dd className="font-medium">
                {formatSize(finished.widthMm, finished.heightMm, units, lng)}
              </dd>
              <dt className="text-muted">{t('wizard.size.toBuy')}</dt>
              <dd>{formatSize(toBuy.widthMm, toBuy.heightMm, units, lng)}</dd>
              <dt className="text-muted">{t('wizard.size.frame')}</dt>
              <dd>{frame ? `${frame.widthCm} × ${frame.heightCm} cm` : t('wizard.size.custom')}</dd>
              <dt className="text-muted">{t('wizard.size.hoop')}</dt>
              <dd>{hoop ? `Ø ${hoop} cm` : t('wizard.size.scrollFrame')}</dd>
              <dt className="text-muted">{t('wizard.size.strands')}</dt>
              <dd>
                {t('wizard.size.strandsValue', {
                  count: advice.strands,
                  needle: advice.needles.join('/'),
                })}
              </dd>
            </dl>
            <NextButton onClick={nextStep} />
          </StepCard>

          <StepCard
            {...stepProps('colors', 5)}
            summary={
              m ? t('wizard.colors.summary', { count: m.colors, brand: s.brand }) : undefined
            }
          >
            <Field label={t('wizard.colors.brand')}>
              <Choice<Brand>
                name="brand"
                value={s.brand}
                onChange={(brand) => set({ brand })}
                options={BRANDS.map((b) => ({ value: b, label: b }))}
              />
            </Field>
            <div className="space-y-2">
              <SliderField
                label={t('wizard.colors.max')}
                value={s.maxColors}
                min={2}
                max={80}
                onChange={(v) => set({ maxColors: v })}
              />
              {result && result.suggestedColors !== s.maxColors && (
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => set({ maxColors: result.suggestedColors })}
                >
                  {t('wizard.colors.useSuggested', { count: result.suggestedColors })}
                </Button>
              )}
            </div>
            <Field label={t('wizard.colors.cleanup')} hint={t('wizard.colors.cleanupHint')}>
              <Choice<CleanupLevel>
                name="cleanup"
                size="sm"
                value={s.cleanup}
                onChange={(cleanup) => set({ cleanup })}
                options={([0, 1, 2, 3] as const).map((v) => ({
                  value: v,
                  label: t(`wizard.colors.cleanupLevels.${v}`),
                }))}
              />
            </Field>
            <Toggle checked={s.protectDetails} onChange={(v) => set({ protectDetails: v })}>
              {t('wizard.colors.protectDetails')}
            </Toggle>
            <SliderField
              label={t('wizard.colors.minStitches')}
              hint={t('wizard.colors.minStitchesHint')}
              value={s.minStitches}
              min={0}
              max={30}
              onChange={(v) => set({ minStitches: v })}
            />
            <Field label={t('wizard.colors.dither')} hint={t('wizard.colors.ditherHint')}>
              <Choice<DitherMethod>
                name="dither"
                size="sm"
                value={s.dither}
                onChange={(dither) => set({ dither })}
                options={(['none', 'floyd-steinberg', 'atkinson', 'ordered'] as const).map((d) => ({
                  value: d,
                  label: t(`wizard.colors.dithers.${d}`),
                }))}
              />
            </Field>
            {s.dither !== 'none' && (
              <SliderField
                label={t('wizard.colors.ditherStrength')}
                value={s.ditherStrength}
                min={0.1}
                max={1}
                step={0.05}
                format={pct}
                onChange={(v) => set({ ditherStrength: v })}
              />
            )}
            <NextButton onClick={nextStep} />
          </StepCard>

          <StepCard {...stepProps('create', 6)}>
            <Field label={t('wizard.create.name')} htmlFor="project-title">
              <input
                id="project-title"
                className="w-full rounded-lg border border-line bg-surface px-3 py-2"
                value={s.title}
                maxLength={120}
                onChange={(e) => set({ title: e.target.value })}
              />
            </Field>
            {variants && variants.length > 1 && (
              <Field label={t('wizard.create.variants')}>
                <div className="grid grid-cols-3 gap-2">
                  {variants.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => set({ maxColors: variantCounts[i] })}
                      className={`rounded-lg border p-1 text-xs ${variantCounts[i] === s.maxColors ? 'border-accent' : 'border-line'}`}
                    >
                      <PatternCanvas
                        width={v.width}
                        height={v.height}
                        cells={v.cells}
                        palette={v.palette}
                        fabricColor={s.fabric.color}
                        className="w-full rounded"
                      />
                      <span className="mt-1 block">
                        {t('wizard.colors.summary', { count: v.metrics.colors, brand: s.brand })}
                      </span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <Button
              variant="primary"
              className="w-full py-2.5 text-base"
              disabled={!result || saving || busy}
              onClick={() => void create()}
            >
              {saving && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {t('wizard.create.button')}
            </Button>
          </StepCard>
        </div>

        <div className="sticky top-0 z-10 -mx-4 space-y-3 bg-bg px-4 py-2 max-lg:order-first lg:top-4 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0">
          {(error ?? conversionError) && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {error ?? conversionError}
            </p>
          )}
          {!has ? (
            <Card className="flex min-h-64 items-center justify-center text-center text-muted">
              {t('wizard.preview.empty')}
            </Card>
          ) : (
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Choice<'photo' | 'pattern'>
                  name="view"
                  size="sm"
                  value={step === 'crop' ? 'photo' : view}
                  onChange={setView}
                  options={[
                    { value: 'photo', label: t('wizard.preview.photo') },
                    { value: 'pattern', label: t('wizard.preview.pattern') },
                  ]}
                />
                {busy && (
                  <Loader2
                    size={18}
                    className="animate-spin text-muted"
                    aria-label={t('wizard.preview.working')}
                  />
                )}
              </div>
              {step === 'crop' && bitmap ? (
                <CropEditor
                  bitmap={bitmap}
                  orientation={s.orientation}
                  crop={s.crop}
                  ratio={ASPECTS[s.aspect]}
                  onChange={(crop) => set({ crop, wandSeeds: [] })}
                />
              ) : view === 'photo' ? (
                (adjusted ?? working) && (
                  <RasterView
                    image={
                      (adjusted && working && adjusted.width === working.width
                        ? adjusted
                        : working)!
                    }
                    mask={mask}
                    label={t('wizard.preview.photo')}
                    onPick={
                      step === 'adjust' && s.removeBackground
                        ? (fx, fy) => set({ wandSeeds: [...s.wandSeeds, [fx, fy]] })
                        : undefined
                    }
                  />
                )
              ) : result ? (
                <PatternCanvas
                  width={result.width}
                  height={result.height}
                  cells={result.cells}
                  palette={result.palette}
                  fabricColor={s.fabric.color}
                  label={t('wizard.preview.pattern')}
                  fit
                  className="mx-auto block rounded-lg border border-line"
                />
              ) : (
                <div className="flex min-h-64 items-center justify-center text-muted">
                  <Loader2 className="animate-spin" aria-hidden />
                </div>
              )}
              {m && (
                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <Metric
                    label={t('wizard.metrics.size')}
                    value={`${result!.width} × ${result!.height}`}
                  />
                  <Metric label={t('wizard.metrics.colors')} value={formatInt(m.colors, lng)} />
                  <Metric label={t('wizard.metrics.stitches')} value={formatInt(m.stitches, lng)} />
                  <Metric
                    label={t('wizard.metrics.confetti')}
                    value={`${formatDecimal(m.confettiPercent, 1, lng)}%`}
                  />
                  <Metric
                    label={t('wizard.metrics.difficulty')}
                    value={t(`difficulty.${m.difficulty}`)}
                  />
                  <Metric
                    label={t('wizard.metrics.time')}
                    value={t('wizard.metrics.hours', { count: Math.max(1, Math.round(m.hours)) })}
                  />
                  <Metric
                    label={t('wizard.metrics.finished')}
                    value={
                      formatLength(finished.widthMm, units, lng) +
                      ' × ' +
                      formatLength(finished.heightMm, units, lng)
                    }
                  />
                </dl>
              )}
              {result && view === 'pattern' && (
                <ul
                  className="flex max-h-40 flex-wrap gap-1.5 overflow-auto"
                  aria-label={t('wizard.preview.palette')}
                >
                  {result.palette.map((p) => {
                    const thread = getThread(p.threads[0]);
                    const [r, g, b] = entryRgb(p);
                    return (
                      <li
                        key={p.id}
                        className="flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-xs"
                        title={thread?.name}
                      >
                        <span
                          className="size-3.5 rounded-sm border border-black/10"
                          style={{ background: `rgb(${r},${g},${b})` }}
                        />
                        {p.threads[0].code}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function pct(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function NextButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end">
      <Button variant="primary" onClick={onClick}>
        {t('wizard.next')}
      </Button>
    </div>
  );
}

function PhotoPicker({ onFile, hasPhoto }: { onFile: (f: File) => void; hasPhoto: boolean }) {
  const { t } = useTranslation();
  const [over, setOver] = useState(false);
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) onFile(f);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`space-y-3 rounded-xl border-2 border-dashed p-5 text-center ${over ? 'border-accent bg-surface-2' : 'border-line'}`}
    >
      <p className="text-sm text-muted">{t('wizard.photo.drop')}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent-strong has-focus-visible:outline-2">
          <ImageUp size={18} aria-hidden />
          {hasPhoto ? t('wizard.photo.change') : t('wizard.photo.choose')}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={pick}
            data-testid="photo-input"
          />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2 has-focus-visible:outline-2 sm:hidden">
          <Camera size={18} aria-hidden />
          {t('wizard.photo.camera')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={pick}
          />
        </label>
      </div>
      <p className="text-xs text-muted">{t('wizard.photo.privacy')}</p>
    </div>
  );
}
