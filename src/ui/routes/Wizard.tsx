import {
  Camera,
  FlipHorizontal2,
  ImageUp,
  Loader2,
  RotateCcw,
  RotateCw,
  Sparkles,
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
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { NO_ADJUSTMENTS } from '../../core/convert/adjust.ts';
import type { CleanupLevel } from '../../core/convert/cleanup.ts';
import type { DitherMethod } from '../../core/convert/dither.ts';
import { paintStroke } from '../../core/convert/mask.ts';
import type { ConvertOutput, ConvertParams } from '../../core/convert/pipeline.ts';
import { DEFAULT_CONVERT_PARAMS } from '../../core/convert/pipeline.ts';
import type { RasterImage } from '../../core/convert/raster.ts';
import { withOutline } from '../../core/model/outline.ts';
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
import { listInventory } from '../../storage/inventory.ts';
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
import { EXAMPLE_PICTURE, fetchPicture, linkSettings } from '../wizard/samples.ts';
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
type BgTool = 'keep' | 'remove' | 'wand';
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
  // The subject found automatically, for the picture loaded as number `key`.
  const [subject, setSubject] = useState<{ key: number; mask: Uint8Array } | null>(null);
  const [bgTool, setBgTool] = useState<BgTool>('keep');
  const [brushSize, setBrushSize] = useState(0.04);
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
  const autoMask =
    s.removeBackground && s.autoSubject && subject?.key === loaded ? subject.mask : undefined;
  const finding = loaded > 0 && s.removeBackground && s.autoSubject && subject?.key !== loaded;
  // Background: the subject found automatically, then wand taps, then brush strokes on top.
  const mask = useMemo(() => {
    if (!working || !s.removeBackground) return undefined;
    if (!autoMask && s.wandSeeds.length === 0 && s.bgStrokes.length === 0) return undefined;
    const size = working.width * working.height;
    const m = autoMask?.length === size ? new Uint8Array(autoMask) : new Uint8Array(size);
    for (const [fx, fy] of s.wandSeeds)
      floodSelect(working, fx * working.width, fy * working.height, s.wandTolerance, m);
    for (const stroke of s.bgStrokes) paintStroke(m, working.width, working.height, stroke);
    return m;
  }, [working, s.removeBackground, autoMask, s.wandSeeds, s.wandTolerance, s.bgStrokes]);

  const [cropW, cropH] = bitmap ? cropPixels(bitmap, s.orientation, s.crop) : [1, 1];
  const height = Math.max(1, Math.round((s.width * cropH) / cropW));
  const advice = stitchingAdvice(s.fabric);
  const ownedKeys = useLiveQuery(async () => (await listInventory()).map((r) => r.key), []);
  const inventory = useMemo(
    () => (s.threads === 'all' || !ownedKeys ? undefined : { keys: ownedKeys, mode: s.threads }),
    [s.threads, ownedKeys],
  );
  const params: ConvertParams = useMemo(
    () => ({
      ...DEFAULT_CONVERT_PARAMS,
      width: s.width,
      height,
      brand: s.brand,
      inventory,
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
      inventory,
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

  const subjectKey = subject?.key;
  useEffect(() => {
    if (!loaded || !s.removeBackground || !s.autoSubject || subjectKey === loaded) return;
    let cancelled = false;
    void worker.current?.api.subject().then((m) => {
      if (!cancelled) setSubject({ key: loaded, mask: m });
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, s.removeBackground, s.autoSubject, subjectKey]);

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
  const strokesKey = useMemo(() => JSON.stringify(s.bgStrokes), [s.bgStrokes]);
  const requestKey = `${loaded}|${s.removeBackground}|${autoMask ? 1 : 0}|${s.wandTolerance}|${JSON.stringify(s.wandSeeds)}|${strokesKey}|${JSON.stringify(params)}`;
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
                bgStrokes: [],
                title: f.name.replace(/\.[^.]+$/, ''),
              },
        );
        setConv(null);
        // Result first: the pattern appears at once, the steps above refine it.
        setStep('create');
        setView('pattern');
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

  // "Open in Stitchino" on a free pattern's page: its picture and settings, from this site;
  // `example` opens the example picture.
  const picture = search.get('src') ?? (search.get('example') ? EXAMPLE_PICTURE : null);
  const query = search.toString();
  useEffect(() => {
    if (!picture) return;
    let cancelled = false;
    void fetchPicture(picture).then((f) => {
      if (cancelled || !f) return;
      const example = picture === EXAMPLE_PICTURE;
      void loadFile(
        f,
        example
          ? { title: t('wizard.photo.exampleTitle'), autoSubject: true }
          : linkSettings(query),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [picture, query, loadFile, t]);

  const loadExample = async () => {
    const f = await fetchPicture(EXAMPLE_PICTURE);
    if (f) await loadFile(f, { title: t('wizard.photo.exampleTitle'), autoSubject: true });
  };

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
      bgStrokes: [],
    });
  };

  const setAspect = (aspect: AspectPreset) => {
    const ratio = ASPECTS[aspect];
    if (!bitmap) return;
    const [Wo, Ho] = orientedSize(bitmap, s.orientation.rotation);
    set({
      aspect,
      crop: ratio === null ? s.crop : cropForAspect(ratio, Wo, Ho),
      wandSeeds: [],
      bgStrokes: [],
    });
  };

  const create = async () => {
    if (!result || !file || !bitmap) return;
    setSaving(true);
    try {
      let pattern = createPattern(result.width, result.height, {
        cells: result.cells,
        palette: result.palette,
        fabric: s.fabric,
        meta: { title: s.title.trim() || t('wizard.create.untitled'), source: 'photo' },
      });
      if (s.removeBackground && s.outline) pattern = withOutline(pattern, 'design');
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
    tour: `step-${id}`,
  });

  const preset = FABRIC_PRESETS.find((p) => p.kind === s.fabric.kind)!;
  const m = result?.metrics;

  return (
    <Page wide>
      <PageHeader title={t('wizard.title')} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <div className="space-y-3">
          <StepCard {...stepProps('photo', 1)} summary={file?.name}>
            <PhotoPicker onFile={loadFile} onExample={loadExample} hasPhoto={has} />
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
                    bgStrokes: [],
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
                onClick={() =>
                  set({ crop: FULL_CROP, aspect: 'free', wandSeeds: [], bgStrokes: [] })
                }
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
            <details className="group rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                {t('wizard.moreAdjustments')}
              </summary>
              <div className="mt-3 space-y-4">
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
              </div>
            </details>
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
                  <Toggle checked={s.autoSubject} onChange={(v) => set({ autoSubject: v })}>
                    {t('wizard.adjust.autoSubject')}
                  </Toggle>
                  {finding && (
                    <p role="status" className="flex items-center gap-2 text-xs text-muted">
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {t('wizard.adjust.finding')}
                    </p>
                  )}
                  <Field label={t('wizard.adjust.tool')}>
                    <Choice<BgTool>
                      name="bg-tool"
                      size="sm"
                      value={bgTool}
                      onChange={setBgTool}
                      options={(['keep', 'remove', 'wand'] as const).map((v) => ({
                        value: v,
                        label: t(`wizard.adjust.tools.${v}`),
                      }))}
                    />
                  </Field>
                  <p className="text-xs text-muted">{t(`wizard.adjust.toolHints.${bgTool}`)}</p>
                  {bgTool === 'wand' ? (
                    <SliderField
                      label={t('wizard.adjust.tolerance')}
                      value={s.wandTolerance}
                      min={0.02}
                      max={0.25}
                      step={0.01}
                      format={(v) => formatInt(v * 400, lng)}
                      onChange={(v) => set({ wandTolerance: v })}
                    />
                  ) : (
                    <SliderField
                      label={t('wizard.adjust.brushSize')}
                      value={brushSize}
                      min={0.01}
                      max={0.12}
                      step={0.005}
                      format={(v) => formatInt(v * 100, lng)}
                      onChange={setBrushSize}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!s.wandSeeds.length && !s.bgStrokes.length}
                      onClick={() =>
                        // Brush strokes come after wand taps, so they're undone first.
                        s.bgStrokes.length
                          ? set({ bgStrokes: s.bgStrokes.slice(0, -1) })
                          : set({ wandSeeds: s.wandSeeds.slice(0, -1) })
                      }
                    >
                      {t('wizard.adjust.undoPick')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!s.wandSeeds.length && !s.bgStrokes.length}
                      onClick={() => set({ wandSeeds: [], bgStrokes: [] })}
                    >
                      {t('wizard.adjust.clearPicks')}
                    </Button>
                  </div>
                  <Toggle checked={s.outline} onChange={(v) => set({ outline: v })}>
                    {t('wizard.adjust.outline')}
                  </Toggle>
                  <p className="text-xs text-muted">{t('wizard.adjust.outlineHint')}</p>
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
            <Field
              label={t('wizard.colors.threads')}
              hint={
                (ownedKeys?.length ?? 0) > 0 ? (
                  t('wizard.colors.threadsOwned', { count: ownedKeys!.length })
                ) : (
                  <Link to="/inventory" className="underline underline-offset-2">
                    {t('wizard.colors.threadsEmpty')}
                  </Link>
                )
              }
            >
              <Choice<'all' | 'only' | 'prefer'>
                name="threads"
                value={s.threads}
                onChange={(threads) => set({ threads })}
                options={(['all', 'prefer', 'only'] as const).map((v) => ({
                  value: v,
                  label: t(`wizard.colors.threadsModes.${v}`),
                }))}
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
            <details className="group rounded-lg border border-line px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium">
                {t('wizard.moreOptions')}
              </summary>
              <div className="mt-3 space-y-4">
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
                    options={(['none', 'floyd-steinberg', 'atkinson', 'ordered'] as const).map(
                      (d) => ({
                        value: d,
                        label: t(`wizard.colors.dithers.${d}`),
                      }),
                    )}
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
              </div>
            </details>
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
              <div data-tour="variants">
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
              </div>
            )}
            <Button
              variant="primary"
              className="w-full py-2.5 text-base"
              disabled={!result || saving || busy}
              onClick={() => void create()}
              data-tour="create"
            >
              {saving && <Loader2 size={18} className="animate-spin" aria-hidden />}
              {t('wizard.create.button')}
            </Button>
          </StepCard>
        </div>

        <div
          data-tour="preview"
          className="sticky top-0 z-10 -mx-4 space-y-3 bg-bg px-4 py-2 max-lg:order-first lg:top-4 lg:mx-0 lg:self-start lg:bg-transparent lg:p-0"
        >
          {(error ?? conversionError) && (
            <p
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            >
              {error ?? conversionError}
            </p>
          )}
          {!has ? (
            <Card className="flex min-h-64 items-center justify-center text-center text-muted max-lg:hidden">
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
                  onChange={(crop) => set({ crop, wandSeeds: [], bgStrokes: [] })}
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
                      step === 'adjust' && s.removeBackground && bgTool === 'wand'
                        ? (fx, fy) => set({ wandSeeds: [...s.wandSeeds, [fx, fy]] })
                        : undefined
                    }
                    brush={
                      step === 'adjust' && s.removeBackground && bgTool !== 'wand'
                        ? { mode: bgTool, size: brushSize }
                        : undefined
                    }
                    onStroke={(stroke) => set({ bgStrokes: [...s.bgStrokes, stroke] })}
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
                  <Metric
                    label={t('wizard.metrics.stitches')}
                    value={formatInt(m.stitches, lng)}
                    phone={false}
                  />
                  <Metric
                    label={t('wizard.metrics.confetti')}
                    value={`${formatDecimal(m.confettiPercent, 1, lng)}%`}
                    phone={false}
                  />
                  <Metric
                    label={t('wizard.metrics.difficulty')}
                    value={t(`difficulty.${m.difficulty}`)}
                    phone={false}
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
                  className="flex max-h-40 flex-wrap gap-1.5 overflow-auto max-sm:hidden"
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

/** `phone={false}` leaves the figure out on phones, where the pinned preview must stay short. */
function Metric({ label, value, phone = true }: { label: string; value: string; phone?: boolean }) {
  return (
    <div className={`flex gap-1 ${phone ? '' : 'max-sm:hidden'}`}>
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

function PhotoPicker({
  onFile,
  onExample,
  hasPhoto,
}: {
  onFile: (f: File) => void;
  onExample: () => void;
  hasPhoto: boolean;
}) {
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
        {!hasPhoto && (
          <button
            type="button"
            onClick={onExample}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2"
          >
            <Sparkles size={18} aria-hidden />
            {t('wizard.photo.example')}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">{t('wizard.photo.privacy')}</p>
    </div>
  );
}
