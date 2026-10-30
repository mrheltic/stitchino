import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Copy, Download, Loader2, Printer, Share2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { EditorDocument, MetaCommand } from '../../core/model/document.ts';
import {
  countStitches,
  type Fabric,
  type FabricKind,
  type Pattern,
} from '../../core/model/pattern.ts';
import { computeMetrics } from '../../core/convert/metrics.ts';
import {
  DEFAULT_MARGIN_MM,
  FABRIC_COLORS,
  FABRIC_PRESETS,
  fabricToBuy,
  finishedSize,
} from '../../core/size/fabric.ts';
import { suggestFrame, suggestHoop } from '../../core/size/frames.ts';
import { stitchingAdvice } from '../../core/size/needles.ts';
import { estimateColor } from '../../core/size/threadEstimate.ts';
import { getThread } from '../../core/threads/catalog.ts';
import { threadKey, type ThreadRef } from '../../core/threads/types.ts';
import { addSkeins, listInventory } from '../../storage/inventory.ts';
import { frameMockup, hoopMockup, stitchedImage } from '../../render/mockups.ts';
import type { RealisticStyle } from '../../render/realistic.ts';
import { realSizeLayout, realSizePdf, type Paper } from '../../render/realSizePdf.ts';
import { loadProject, saveProject } from '../../storage/projects.ts';
import { Choice, Field, NumberInput, Toggle } from '../components/controls.tsx';
import { Button, Card, LinkButton, Page, PageHeader } from '../components/ui.tsx';
import { downloadBytes, safeFileName } from '../download.ts';
import { ChartView } from '../editor/ChartView.tsx';
import { formatInt, formatSize } from '../format.ts';
import { patternThumbnail } from '../patternPaint.ts';
import { useSettings } from '../state/settings.ts';
import { canvasToBlob } from '../wizard/image.ts';

type View = 'detail' | 'far' | 'frame' | 'hoop';

export default function RealSize() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [state, setState] = useState<{ id: string; pattern: Pattern } | null | undefined>();
  useEffect(() => {
    let cancelled = false;
    void loadProject(id).then((d) => !cancelled && setState(d ? { id, pattern: d.pattern } : null));
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (state === undefined || (state && state.id !== id)) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Loader2 className="animate-spin" aria-label={t('editor.loading')} />
      </div>
    );
  }
  if (!state) {
    return (
      <Page>
        <PageHeader title={t('editor.notFound')} />
        <LinkButton to="/">{t('notFound.back')}</LinkButton>
      </Page>
    );
  }
  return <RealSizeView key={state.id} id={state.id} pattern={state.pattern} />;
}

function RealSizeView({ id, pattern }: { id: string; pattern: Pattern }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const units = useSettings((s) => s.units);
  const [fabric, setFabric] = useState<Fabric>(pattern.fabric);
  const [strands, setStrands] = useState<number | undefined>(undefined);
  const [margin, setMargin] = useState(Math.round(DEFAULT_MARGIN_MM / 10));
  const [view, setView] = useState<View>('frame');
  const [paper, setPaper] = useState<Paper>(lng === 'en' ? 'letter' : 'a4');
  const [printing, setPrinting] = useState(false);
  const [savedFabric, setSavedFabric] = useState(pattern.fabric);
  const [copied, setCopied] = useState(false);
  const doc = useMemo(() => new EditorDocument(pattern), [pattern]);
  const style: RealisticStyle = useMemo(() => ({ fabric, strands }), [fabric, strands]);

  const size = finishedSize(pattern.width, pattern.height, fabric);
  const toBuy = fabricToBuy(size, margin * 10);
  const frame = suggestFrame(size);
  const frameMm = frame
    ? { widthMm: frame.widthCm * 10, heightMm: frame.heightCm * 10 }
    : { widthMm: size.widthMm + 80, heightMm: size.heightMm + 80 };
  const hoop = suggestHoop(size);
  const advice = stitchingAdvice(fabric);
  const preset = FABRIC_PRESETS.find((p) => p.kind === fabric.kind)!;
  const counts = useMemo(() => countStitches(pattern), [pattern]);
  const metrics = useMemo(
    () => computeMetrics(pattern.cells, pattern.width, pattern.height),
    [pattern],
  );
  const list = pattern.palette.map((e) => {
    const c = counts.get(e.id)!;
    const est = estimateColor(c, strands ?? e.strands, strands ?? e.backStrands, fabric);
    return {
      entry: e,
      stitches: c.full + c.half + c.quarter + c.threeQuarter,
      skeins: est.skeins,
      meters: est.lengthM,
    };
  });
  const totalSkeins = list.reduce((s, x) => s + x.skeins, 0);
  // Per thread: a blend shares its skeins between its threads; a thread may be in several entries.
  const inventory = useLiveQuery(() => listInventory(), []);
  const have = new Map(inventory?.map((r) => [r.key, r.skeins]));
  const perThread = new Map<string, { ref: ThreadRef; need: number; stitches: number }>();
  for (const x of list) {
    if (x.stitches === 0) continue;
    for (const ref of x.entry.threads) {
      const key = threadKey(ref);
      const cur = perThread.get(key) ?? { ref, need: 0, stitches: 0 };
      cur.need += x.skeins / x.entry.threads.length;
      cur.stitches += x.stitches;
      perThread.set(key, cur);
    }
  }
  const threads = [...perThread.entries()]
    .map(([key, v]) => {
      const need = Math.ceil(v.need - 1e-9);
      const owned = have.get(key) ?? 0;
      return { key, ref: v.ref, stitches: v.stitches, need, owned, buy: Math.max(0, need - owned) };
    })
    .sort((a, b) => b.stitches - a.stitches);
  const toBuyThreads = threads.filter((x) => x.buy > 0);
  const hasInventory = (inventory?.length ?? 0) > 0;
  const layout = realSizeLayout(pattern, style, paper);
  const fabricChanged = JSON.stringify(fabric) !== JSON.stringify(savedFabric);

  const shoppingText = () => {
    const lines = [
      t('realSize.shopping.heading', { title: pattern.meta.title }),
      '',
      t('realSize.shopping.fabricLine', {
        fabric: `${t(`fabric.kinds.${fabric.kind}`)} ${fabric.count} ct`,
        size: formatSize(toBuy.widthMm, toBuy.heightMm, units, lng),
      }),
      t('realSize.shopping.needleLine', { needle: advice.needles.join('/') }),
      '',
      ...toBuyThreads.map((x) =>
        `• ${x.ref.brand} ${x.ref.code} ${getThread(x.ref)?.name ?? ''} — ${t('editor.palette.skeins', { count: x.buy })}`.trim(),
      ),
    ];
    return lines.join('\n');
  };

  const printPdf = async () => {
    setPrinting(true);
    try {
      const bytes = await realSizePdf(pattern, style, paper, {
        title: pattern.meta.title || t('wizard.create.untitled'),
        page: (n, total) => t('realSize.print.page', { n, total }),
        cells: (x0, x1, y0, y1) => t('realSize.print.cells', { x0, x1, y0, y1 }),
        ruler: t('realSize.print.ruler'),
        instructions: t('realSize.print.instructions'),
      });
      downloadBytes(bytes, `${safeFileName(pattern.meta.title)}-1-1.pdf`, 'application/pdf');
    } finally {
      setPrinting(false);
    }
  };

  const saveFabric = async () => {
    doc.execute(
      new MetaCommand(
        { meta: pattern.meta, fabric: pattern.fabric },
        { meta: pattern.meta, fabric },
      ),
    );
    const thumb = await patternThumbnail(
      pattern.width,
      pattern.height,
      pattern.cells,
      pattern.palette,
      pattern.fabric.color,
    );
    await saveProject(id, pattern, thumb);
    setSavedFabric(fabric);
  };

  return (
    <Page wide>
      <PageHeader title={t('realSize.title')}>
        <LinkButton to={`/project/${id}`}>
          <ArrowLeft size={16} aria-hidden />
          {t('realSize.backToEditor')}
        </LinkButton>
      </PageHeader>
      <p className="-mt-4 mb-6 text-muted">{pattern.meta.title}</p>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="space-y-4">
          <Card className="space-y-4">
            <h2 className="font-medium">{t('realSize.fabric')}</h2>
            <Choice<FabricKind>
              name="rs-fabric-kind"
              size="sm"
              value={fabric.kind}
              onChange={(kind) => {
                const p = FABRIC_PRESETS.find((x) => x.kind === kind)!;
                setFabric({
                  ...fabric,
                  kind,
                  count: p.counts[Math.min(1, p.counts.length - 1)],
                  over: p.defaultOver,
                });
              }}
              options={FABRIC_PRESETS.map((p) => ({
                value: p.kind,
                label: t(`fabric.kinds.${p.kind}`),
              }))}
            />
            <Choice<number>
              name="rs-fabric-count"
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
            <Field label={t('realSize.strands')}>
              <Choice<number>
                name="rs-strands"
                size="sm"
                value={strands ?? 0}
                onChange={(v) => setStrands(v || undefined)}
                options={[
                  { value: 0, label: t('realSize.strandsProject') },
                  { value: 1, label: '1' },
                  { value: 2, label: '2' },
                  { value: 3, label: '3' },
                ]}
              />
            </Field>
            {fabricChanged && (
              <Button variant="primary" className="w-full" onClick={() => void saveFabric()}>
                {t('realSize.saveFabric')}
              </Button>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-medium">{t('realSize.measures')}</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t('wizard.size.finished')}</dt>
              <dd className="font-medium">{formatSize(size.widthMm, size.heightMm, units, lng)}</dd>
              <dt className="text-muted">{t('wizard.size.toBuy')}</dt>
              <dd>{formatSize(toBuy.widthMm, toBuy.heightMm, units, lng)}</dd>
              <dt className="text-muted">{t('realSize.margin')}</dt>
              <dd>
                <NumberInput
                  label={t('realSize.margin')}
                  value={margin}
                  min={2}
                  max={20}
                  onChange={setMargin}
                  suffix={t('realSize.cmPerSide')}
                />
              </dd>
              <dt className="text-muted">{t('wizard.size.frame')}</dt>
              <dd>{frame ? `${frame.widthCm} × ${frame.heightCm} cm` : t('wizard.size.custom')}</dd>
              <dt className="text-muted">{t('wizard.size.hoop')}</dt>
              <dd>{hoop ? `Ø ${hoop} cm` : t('wizard.size.scrollFrame')}</dd>
              <dt className="text-muted">{t('wizard.size.strands')}</dt>
              <dd>
                {t('wizard.size.strandsValue', {
                  count: strands ?? advice.strands,
                  needle: advice.needles.join('/'),
                })}
              </dd>
              <dt className="text-muted">{t('wizard.metrics.stitches')}</dt>
              <dd>{formatInt(metrics.stitches, lng)}</dd>
              <dt className="text-muted">{t('realSize.skeinsTotal')}</dt>
              <dd>{t('editor.palette.skeins', { count: totalSkeins })}</dd>
              <dt className="text-muted">{t('wizard.metrics.time')}</dt>
              <dd>
                {t('wizard.metrics.hours', { count: Math.max(1, Math.round(metrics.hours)) })}
              </dd>
            </dl>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-medium">{t('realSize.print.title')}</h2>
            <p className="text-sm text-muted">{t('realSize.print.hint')}</p>
            <Choice<Paper>
              name="rs-paper"
              size="sm"
              value={paper}
              onChange={setPaper}
              options={[
                { value: 'a4', label: 'A4' },
                { value: 'letter', label: 'Letter' },
              ]}
            />
            <p className="text-xs text-muted">
              {t('realSize.print.pages', { count: layout.cols * layout.rows })}
            </p>
            <Button
              variant="primary"
              className="w-full"
              disabled={printing}
              onClick={() => void printPdf()}
            >
              {printing ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                <Printer size={16} aria-hidden />
              )}
              {t('realSize.print.button')}
            </Button>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <Choice<View>
              name="rs-view"
              size="sm"
              value={view}
              onChange={setView}
              options={(['frame', 'hoop', 'far', 'detail'] as const).map((v) => ({
                value: v,
                label: t(`realSize.views.${v}`),
              }))}
            />
            {view === 'detail' ? (
              <ChartView
                doc={doc}
                panOnly
                label={t('realSize.views.detail')}
                className="h-[65vh] rounded-lg"
                options={{
                  mode: 'realistic',
                  grid: false,
                  rulers: false,
                  highlightId: null,
                  hidden: new Set(),
                  showIsolated: false,
                  background: '#ddd5ca',
                  realistic: style,
                }}
              />
            ) : (
              <Mockup
                view={view}
                pattern={pattern}
                style={style}
                frameW={frameMm.widthMm}
                frameH={frameMm.heightMm}
                hoopMm={(hoop ?? 30) * 10}
                fileName={`${safeFileName(pattern.meta.title)}-${view}.png`}
                label={t(`realSize.views.${view}`)}
                downloadLabel={t('realSize.download')}
              />
            )}
            <p className="text-xs text-muted">
              {t(`realSize.viewHints.${view}`, { hoop: hoop ?? 30 })}
            </p>
          </Card>

          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="font-medium">{t('realSize.shopping.title')}</h2>
              <div className="flex gap-2">
                <Button
                  className="px-3 py-1.5"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(shoppingText());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <Copy size={16} aria-hidden />
                  {copied ? t('realSize.shopping.copied') : t('realSize.shopping.copy')}
                </Button>
                {'share' in navigator && (
                  <Button
                    className="px-3 py-1.5"
                    onClick={() =>
                      void navigator
                        .share({ title: pattern.meta.title, text: shoppingText() })
                        .catch(() => {})
                    }
                  >
                    <Share2 size={16} aria-hidden />
                    {t('realSize.shopping.share')}
                  </Button>
                )}
              </div>
            </div>
            <p className="px-4 pt-3 text-sm">
              {t('realSize.shopping.fabricLine', {
                fabric: `${t(`fabric.kinds.${fabric.kind}`)} ${fabric.count} ct`,
                size: formatSize(toBuy.widthMm, toBuy.heightMm, units, lng),
              })}
              <br />
              {t('realSize.shopping.needleLine', { needle: advice.needles.join('/') })}
            </p>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-normal">{t('editor.thread')}</th>
                  <th className="py-2 text-right font-normal">{t('realSize.shopping.need')}</th>
                  <th className="py-2 pl-3 text-right font-normal">
                    {t('realSize.shopping.have')}
                  </th>
                  <th className="px-4 py-2 text-right font-normal">{t('realSize.shopping.buy')}</th>
                </tr>
              </thead>
              <tbody>
                {threads.map((x) => {
                  const th = getThread(x.ref);
                  const [r, g, b] = th?.rgb ?? [200, 200, 200];
                  return (
                    <tr key={x.key} className="border-t border-line">
                      <td className="flex items-center gap-2 px-4 py-1.5">
                        <span
                          className="size-5 shrink-0 rounded border border-black/10"
                          style={{ background: `rgb(${r},${g},${b})` }}
                          aria-hidden
                        />
                        <span>
                          <span className="font-medium">
                            {x.ref.brand} {x.ref.code}
                          </span>{' '}
                          <span className="text-muted">{th?.name}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{x.need}</td>
                      <td className="py-1.5 pl-3 text-right tabular-nums text-muted">{x.owned}</td>
                      <td className="px-4 py-1.5 text-right">
                        {x.buy > 0 ? (
                          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                            <span className="font-medium tabular-nums">{x.buy}</span>
                            <button
                              type="button"
                              className="rounded-md border border-line px-1.5 py-1 text-xs hover:bg-surface-2"
                              onClick={() => void addSkeins([{ ref: x.ref, skeins: x.buy }])}
                              title={t('realSize.shopping.boughtHint')}
                            >
                              {t('realSize.shopping.bought')}
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-muted">
                            {t('realSize.shopping.enough')}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {toBuyThreads.length > 1 && (
              <div className="flex justify-end px-4 pt-2">
                <Button
                  className="px-3 py-1.5 text-xs"
                  onClick={() =>
                    void addSkeins(toBuyThreads.map((x) => ({ ref: x.ref, skeins: x.buy })))
                  }
                >
                  {t('realSize.shopping.boughtAll')}
                </Button>
              </div>
            )}
            {!hasInventory && (
              <p className="px-4 pt-3 text-xs text-muted">{t('realSize.shopping.inventoryHint')}</p>
            )}
            <p className="px-4 py-3 text-xs text-muted">{t('realSize.shopping.estimateNote')}</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Mockup({
  view,
  pattern,
  style,
  frameW,
  frameH,
  hoopMm,
  fileName,
  label,
  downloadLabel,
}: {
  view: Exclude<View, 'detail'>;
  pattern: Pattern;
  style: RealisticStyle;
  frameW: number;
  frameH: number;
  hoopMm: number;
  fileName: string;
  label: string;
  downloadLabel: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const src =
        view === 'frame'
          ? frameMockup(pattern, style, { widthMm: frameW, heightMm: frameH })
          : view === 'hoop'
            ? hoopMockup(pattern, style, hoopMm)
            : stitchedImage(pattern, style, 1400).canvas;
      const c = ref.current;
      if (cancelled || !c) return;
      c.width = src.width;
      c.height = src.height;
      c.getContext('2d')?.drawImage(src as CanvasImageSource, 0, 0);
      setBusy(false);
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, pattern, style, frameW, frameH, hoopMm]);

  return (
    <div className="relative">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className="mx-auto block h-auto rounded-lg"
        style={{ width: 'min(100%, 65vh)' }}
      />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted" aria-hidden />
        </div>
      )}
      <div className="mt-2 flex justify-end">
        <Button
          className="px-3 py-1.5"
          onClick={async () => {
            const c = ref.current;
            if (c) downloadBytes(await canvasToBlob(c, 'image/png'), fileName);
          }}
        >
          <Download size={16} aria-hidden />
          {downloadLabel}
        </Button>
      </div>
    </div>
  );
}
