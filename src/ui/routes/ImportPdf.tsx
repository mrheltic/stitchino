import { AlertTriangle, FileUp, Loader2, Lock } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  analyzeDocument,
  assembleChart,
  placePages,
  type ChartPage,
  type PdfAnalysis,
  type Placement,
} from '../../core/pdf/import/analyze.ts';
import { buildImportedPattern, symbolCounts } from '../../core/pdf/import/build.ts';
import { getThread } from '../../core/threads/catalog.ts';
import type { ThreadRef } from '../../core/threads/types.ts';
import { createProject } from '../../storage/projects.ts';
import { NumberInput } from '../components/controls.tsx';
import { PatternCanvas } from '../components/PatternCanvas.tsx';
import { Button, Card, Page, PageHeader } from '../components/ui.tsx';
import { SymbolSwatch } from '../editor/PalettePanel.tsx';
import { ThreadPicker } from '../editor/ThreadPicker.tsx';
import { formatInt } from '../format.ts';
import { readPdf, renderPage, PdfPasswordError, type LoadedPdf } from '../importPdf/readPdf.ts';
import { patternThumbnail } from '../patternPaint.ts';

type Stage =
  | { kind: 'pick'; error?: 'notChart' | 'unreadable' }
  | { kind: 'password'; bytes: Uint8Array; name: string; incorrect: boolean }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'review'; pdf: LoadedPdf; analysis: PdfAnalysis; name: string };

export default function ImportPdf() {
  const { t } = useTranslation();
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [password, setPassword] = useState('');
  const [dragging, setDragging] = useState(false);

  const open = async (bytes: Uint8Array, name: string, pw?: string) => {
    setStage({ kind: 'reading', done: 0, total: 0 });
    try {
      const pdf = await readPdf(bytes, pw, (done, total) =>
        setStage({ kind: 'reading', done, total }),
      );
      const analysis = analyzeDocument(pdf.pages);
      if (!analysis.pages.length) {
        void pdf.close();
        setStage({ kind: 'pick', error: 'notChart' });
        return;
      }
      setStage({ kind: 'review', pdf, analysis, name });
    } catch (e) {
      if (e instanceof PdfPasswordError)
        setStage({ kind: 'password', bytes, name, incorrect: e.incorrect });
      else {
        console.error(e);
        setStage({ kind: 'pick', error: 'unreadable' });
      }
    }
  };

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    setPassword('');
    await open(new Uint8Array(await file.arrayBuffer()), file.name.replace(/\.pdf$/i, ''));
  };

  if (stage.kind === 'review')
    return (
      <Review
        pdf={stage.pdf}
        analysis={stage.analysis}
        name={stage.name}
        onCancel={() => {
          void stage.pdf.close();
          setStage({ kind: 'pick' });
        }}
      />
    );

  return (
    <Page>
      <PageHeader title={t('importPdf.title')} />
      <p className="-mt-3 mb-6 max-w-2xl text-muted">{t('importPdf.intro')}</p>
      {stage.kind === 'reading' ? (
        <Card className="flex items-center gap-3">
          <Loader2 className="animate-spin text-muted" aria-hidden />
          <p role="status">
            {stage.total
              ? t('importPdf.reading', { done: stage.done, total: stage.total })
              : t('importPdf.opening')}
          </p>
        </Card>
      ) : stage.kind === 'password' ? (
        <Card>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void open(stage.bytes, stage.name, password);
            }}
          >
            <p className="flex items-center gap-2 font-medium">
              <Lock size={18} aria-hidden />
              {stage.incorrect ? t('importPdf.wrongPassword') : t('importPdf.needsPassword')}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label={t('importPdf.password')}
                autoFocus
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
              />
              <Button type="submit" variant="primary">
                {t('importPdf.unlock')}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          <label
            onDragOver={(e: DragEvent) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              setDragging(false);
              void openFile(e.dataTransfer.files[0]);
            }}
            className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center has-focus-visible:outline-2 ${
              dragging ? 'border-accent bg-surface-2' : 'border-line bg-surface'
            }`}
          >
            <FileUp size={32} className="text-muted" aria-hidden />
            <span className="font-medium">{t('importPdf.choose')}</span>
            <span className="text-sm text-muted">{t('importPdf.drop')}</span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              data-testid="pdf-input"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                void openFile(f);
              }}
            />
          </label>
          {stage.error && (
            <p role="alert" className="mt-4 flex gap-2 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle size={18} className="shrink-0" aria-hidden />
              {t(`importPdf.errors.${stage.error}`)}
            </p>
          )}
          <p className="mt-6 text-sm text-muted">{t('importPdf.personal')}</p>
        </>
      )}
    </Page>
  );
}

function PagePreview({
  pdf,
  page,
  placement,
  onChange,
}: {
  pdf: LoadedPdf;
  page: ChartPage;
  placement: Placement;
  onChange: (p: Placement) => void;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; w: number; h: number } | null>(null);
  const { lattice } = page;
  useEffect(() => {
    let cancelled = false;
    const c = canvas.current;
    if (!c) return;
    void renderPage(pdf.doc, page.page, c, 220).then((scale) => {
      if (cancelled) return;
      setBox({
        left: (lattice.x0 - lattice.sx / 2) * scale,
        top: (lattice.y0 - lattice.sy / 2) * scale,
        w: lattice.cols * lattice.sx * scale,
        h: lattice.rows * lattice.sy * scale,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, page, lattice]);
  const guessed = page.offset.x === null || page.offset.y === null;
  return (
    <li className="flex gap-3">
      <div className="relative shrink-0 self-start overflow-hidden rounded border border-line bg-white">
        <canvas ref={canvas} aria-label={t('importPdf.pageImage', { n: page.page + 1 })} />
        {box && (
          <span
            className="pointer-events-none absolute border-2 border-accent bg-accent/10"
            style={{ left: box.left, top: box.top, width: box.w, height: box.h }}
          />
        )}
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-medium">{t('importPdf.page', { n: page.page + 1 })}</p>
        <p className="text-muted">
          {t('importPdf.pageSize', { cols: lattice.cols, rows: lattice.rows })}
        </p>
        {guessed && (
          <p className="flex gap-1.5 text-amber-700 dark:text-amber-300">
            <AlertTriangle size={16} className="shrink-0" aria-hidden />
            {t('importPdf.guessed')}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <NumberInput
            label={t('importPdf.firstColumn')}
            value={placement.x + 1}
            min={1}
            max={3000}
            onChange={(v) => onChange({ ...placement, x: v - 1 })}
            suffix={t('importPdf.column')}
          />
          <NumberInput
            label={t('importPdf.firstRow')}
            value={placement.y + 1}
            min={1}
            max={3000}
            onChange={(v) => onChange({ ...placement, y: v - 1 })}
            suffix={t('importPdf.row')}
          />
        </div>
      </div>
    </li>
  );
}

function Review({
  pdf,
  analysis,
  name,
  onCancel,
}: {
  pdf: LoadedPdf;
  analysis: PdfAnalysis;
  name: string;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const navigate = useNavigate();
  const [placements, setPlacements] = useState(() => placePages(analysis.pages));
  const [threads, setThreads] = useState(
    () => new Map([...analysis.key].map(([ch, e]) => [ch, e.threads] as [string, ThreadRef[]])),
  );
  const [title, setTitle] = useState(pdf.title ?? name);
  const [picker, setPicker] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chart = useMemo(() => assembleChart(analysis.pages, placements), [analysis, placements]);
  const counts = useMemo(() => symbolCounts(chart), [chart]);
  const pattern = useMemo(
    () => buildImportedPattern(chart, threads, { title, fabricCount: analysis.fabricCount }),
    [chart, threads, title, analysis.fabricCount],
  );
  const entryOf = new Map(counts.map(([ch], i) => [ch, pattern.palette[i]]));
  const missing = counts.filter(([ch]) => !threads.has(ch)).length;
  const guessed = analysis.pages.filter((p) => p.offset.x === null || p.offset.y === null).length;

  const save = async () => {
    setSaving(true);
    try {
      const thumbnail = await patternThumbnail(
        pattern.width,
        pattern.height,
        pattern.cells,
        pattern.palette,
        pattern.fabric.color,
      );
      const id = await createProject(pattern, { thumbnail, imported: true });
      void pdf.close();
      navigate(`/project/${id}/stitch`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page wide>
      <PageHeader title={t('importPdf.reviewTitle')}>
        <Button onClick={onCancel}>{t('importPdf.another')}</Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {t('importPdf.import')}
        </Button>
      </PageHeader>
      <p className="-mt-3 mb-4 text-muted" role="status">
        {t('importPdf.found', {
          w: chart.width,
          h: chart.height,
          colors: counts.length,
          count: analysis.pages.length,
        })}
      </p>
      {(missing > 0 || guessed > 0 || chart.conflicts > 0) && (
        <ul className="mb-4 space-y-1 text-sm text-amber-800 dark:text-amber-200">
          {missing > 0 && <li>• {t('importPdf.missing', { count: missing })}</li>}
          {guessed > 0 && <li>• {t('importPdf.guessedPages', { count: guessed })}</li>}
          {chart.conflicts > 0 && <li>• {t('importPdf.conflicts', { count: chart.conflicts })}</li>}
        </ul>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="space-y-6">
          <Card className="space-y-3">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">{t('wizard.create.name')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2"
              />
            </label>
            <PatternCanvas
              width={pattern.width}
              height={pattern.height}
              cells={pattern.cells}
              palette={pattern.palette}
              fabricColor={pattern.fabric.color}
              label={t('importPdf.preview')}
              className="mx-auto block rounded border border-line"
              fit
            />
          </Card>
          <Card>
            <h2 className="mb-3 font-medium">{t('importPdf.pages')}</h2>
            <ul className="space-y-4">
              {analysis.pages.map((p, i) => (
                <PagePreview
                  key={p.page}
                  pdf={pdf}
                  page={p}
                  placement={placements[i]}
                  onChange={(next) => setPlacements(placements.map((x, k) => (k === i ? next : x)))}
                />
              ))}
            </ul>
          </Card>
        </div>
        <Card className="self-start p-0">
          <h2 className="border-b border-line px-4 py-3 font-medium">{t('importPdf.key')}</h2>
          <p className="px-4 pt-3 text-xs text-muted">{t('importPdf.keyHint')}</p>
          <ul className="divide-y divide-line">
            {counts.map(([ch, n]) => {
              const entry = entryOf.get(ch)!;
              const known = threads.get(ch);
              const th = known && getThread(known[0]);
              return (
                <li key={ch} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded border border-line bg-white text-lg text-black"
                    title={t('importPdf.originalSymbol')}
                  >
                    {ch}
                  </span>
                  <span aria-hidden className="text-muted">
                    →
                  </span>
                  <SymbolSwatch entry={entry} size={28} />
                  <span className="min-w-0 flex-1">
                    {known ? (
                      <>
                        <span className="font-medium">
                          {known.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                        </span>{' '}
                        <span className="text-muted">{th?.name}</span>
                      </>
                    ) : (
                      <span className="font-medium text-amber-800 dark:text-amber-200">
                        {t('importPdf.choose_thread')}
                      </span>
                    )}
                    <span className="block text-xs text-muted">
                      {t('stitch.stitches', { count: n, n: formatInt(n, lng) })}
                    </span>
                  </span>
                  <Button className="px-2.5 py-1 text-xs" onClick={() => setPicker(ch)}>
                    {known ? t('importPdf.change') : t('importPdf.pick')}
                  </Button>
                </li>
              );
            })}
          </ul>
          <p className="px-4 py-3 text-xs text-muted">{t('importPdf.personal')}</p>
        </Card>
      </div>
      <ThreadPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={t('importPdf.pickTitle', { symbol: picker ?? '' })}
        current={picker ? threads.get(picker)?.[0] : undefined}
        onPick={(th) => {
          if (picker === null) return;
          setThreads(new Map(threads).set(picker, [{ brand: th.brand, code: th.code }]));
        }}
      />
    </Page>
  );
}
