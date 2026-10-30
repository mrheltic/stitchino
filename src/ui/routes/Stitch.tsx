import { DropdownMenu } from 'radix-ui';
import {
  ArrowLeft,
  Expand,
  Hand,
  Highlighter,
  Loader2,
  LocateFixed,
  MapPin,
  Maximize,
  Minimize,
  MoreHorizontal,
  PaintBucket,
  PanelRight,
  Pencil,
  Redo2,
  SquareDashed,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { EditorDocument } from '../../core/model/document.ts';
import { entryRgb } from '../../core/model/entryColor.ts';
import { pickDoneColor } from '../../core/progress/doneColor.ts';
import { ProgressTracker } from '../../core/progress/tracker.ts';
import type { ViewMode } from '../../render/chartRenderer.ts';
import { ProgressLayer } from '../../render/progressLayer.ts';
import { loadProgress, loadProject, putProgress } from '../../storage/projects.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { LinkButton, Page, PageHeader } from '../components/ui.tsx';
import { ChartView, type ChartViewHandle } from '../editor/ChartView.tsx';
import { BackstitchIcon } from '../editor/icons.tsx';
import { SymbolSwatch } from '../editor/PalettePanel.tsx';
import { StitchController } from '../stitch/stitchController.ts';
import { StitchPanel } from '../stitch/StitchPanel.tsx';
import { DONE_COLORS, useStitch, type StitchTool } from '../stitch/store.ts';
import { useWakeLock } from '../stitch/useWakeLock.ts';

interface Loaded {
  id: string;
  doc: EditorDocument;
  tracker: ProgressTracker;
  imported: boolean;
  reset: boolean;
}

export default function Stitch() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [state, setState] = useState<Loaded | null | undefined>();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const d = await loadProject(id);
      if (!d) {
        if (!cancelled) setState(null);
        return;
      }
      const { data, reset } = await loadProgress(id, d.pattern);
      if (cancelled) return;
      const tracker = new ProgressTracker(d.pattern, data);
      // Nothing marked yet: say how marking works.
      useStitch.setState({
        activeId: null,
        tool: 'mark',
        hint: tracker.total.done ? null : 'stitch.toolHints.mark',
      });
      setState({
        id,
        doc: new EditorDocument(d.pattern),
        tracker,
        imported: d.summary.imported,
        reset,
      });
    })();
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
  if (state === null) {
    return (
      <Page>
        <PageHeader title={t('editor.notFound')} />
        <LinkButton to="/">{t('notFound.back')}</LinkButton>
      </Page>
    );
  }
  return <StitchWorkspace key={state.id} {...state} />;
}

const NOTHING_HIDDEN: ReadonlySet<number> = new Set();

const TOOL_ICONS: Record<StitchTool, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  mark: Highlighter,
  area: PaintBucket,
  rect: SquareDashed,
  lines: BackstitchIcon,
  park: MapPin,
  pan: Hand,
};

function StitchWorkspace({ id, doc, tracker, reset }: Loaded) {
  const { t } = useTranslation();
  const version = useSyncExternalStore(
    (cb) => tracker.subscribe(cb),
    () => tracker.version,
  );
  const st = useStitch();
  const chart = useRef<ChartViewHandle>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resetNotice, setResetNotice] = useState(reset);
  const [confirmReset, setConfirmReset] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const [saveError, setSaveError] = useState(false);
  const lastFound = useRef(-1);
  const viewDirty = useRef(false);
  const p = doc.pattern;

  const colours = useMemo(
    () =>
      new Map(
        p.palette.map((e) => {
          const [r, g, b] = entryRgb(e);
          return [e.id, `rgb(${r},${g},${b})`];
        }),
      ),
    [p],
  );
  const controller = useMemo(() => {
    const c = new StitchController(tracker, useStitch.getState, (i) => colours.get(i) ?? '#888');
    c.onHint = (key) => useStitch.getState().set({ hint: key });
    return c;
  }, [tracker, colours]);
  const autoDone = useMemo(
    () => pickDoneColor(DONE_COLORS, p.palette, (i) => tracker.tallies.get(i)?.total ?? 0),
    [p, tracker],
  );
  const doneColor = st.doneColor === 'auto' ? autoDone : st.doneColor;
  const layer = useMemo(() => new ProgressLayer(p, tracker.data, autoDone), [p, tracker, autoDone]);

  useWakeLock(st.keepAwake);

  useEffect(() => {
    layer.setColor(doneColor);
    chart.current?.redraw();
  }, [layer, doneColor]);

  // Repaint what changed and save shortly after; also save when the page is hidden or left.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const flush = async () => {
      if (!dirty && !viewDirty.current) return;
      dirty = false;
      viewDirty.current = false;
      try {
        await putProgress(id, tracker);
        setSaveError(false);
      } catch {
        setSaveError(true);
      }
    };
    const unsubscribe = tracker.subscribe((change) => {
      layer.paintCells(change.cells);
      chart.current?.redraw();
      if (!change.cells.length && !change.lines) return;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 600);
    });
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [id, tracker, layer]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Hints fade after a few seconds, longer ones a little later.
  useEffect(() => {
    if (!st.hint) return;
    const ms = Math.max(3500, t(st.hint).length * 60);
    const timer = setTimeout(() => useStitch.getState().set({ hint: null }), ms);
    return () => clearTimeout(timer);
  }, [st.hint, t]);

  useEffect(() => {
    lastFound.current = -1;
  }, [st.activeId]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const findNext = () => {
    const v = chart.current?.viewport();
    let from = lastFound.current;
    if (from < 0 && v) {
      const [cx, cy] = v.toCell(v.width / 2, v.height / 2);
      const x = Math.min(p.width - 1, Math.max(0, Math.floor(cx)));
      const y = Math.min(p.height - 1, Math.max(0, Math.floor(cy)));
      from = y * p.width + x - 1;
    }
    const i = tracker.findNext(from, st.activeId);
    if (i < 0) {
      st.set({ hint: 'stitch.hints.allDone' });
      controller.setRing(undefined);
      return;
    }
    lastFound.current = i;
    const x = i % p.width;
    const y = (i - x) / p.width;
    chart.current?.focus(x, y, 20);
    controller.setRing({ x, y });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="dialog"], [role="menu"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) tracker.redo();
        else tracker.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        tracker.redo();
      } else if (mod || e.altKey) return;
      else if (k === 'n') findNext();
      else if (k === 'f') toggleFullscreen();
      else if (e.key === '+' || e.key === '=') chart.current?.zoom(1.25);
      else if (e.key === '-') chart.current?.zoom(0.8);
      else if (e.key === '0') chart.current?.fit();
      else if (e.key === 'Escape') st.set({ activeId: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const background =
    getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#f3eee6';
  const options = {
    mode: st.mode,
    grid: st.grid,
    rulers: st.rulers,
    highlightId: st.activeId,
    hidden: NOTHING_HIDDEN,
    showIsolated: false,
    background,
    layer: { image: layer.canvas as CanvasImageSource, scale: layer.scale },
    done: {
      bits: tracker.data.bits,
      partials: tracker.data.partials,
      backstitches: tracker.data.backstitches,
      knots: tracker.data.knots,
      color: doneColor,
    },
  };

  const hasLines = p.backstitches.length > 0 || p.knots.length > 0;
  const tools = (['mark', 'area', 'rect', 'lines', 'park', 'pan'] as const).filter(
    (x) => x !== 'lines' || hasLines,
  );
  const active = p.palette.find((e) => e.id === st.activeId);
  const { total, done } = tracker.total;
  const percent = new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(total ? (done < total ? Math.min(done / total, 0.99) : 1) : 0);
  const iconButton =
    'flex size-10 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-2 disabled:opacity-40';
  const menuItem =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2';
  const left = st.leftHanded;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <Link
          to="/"
          className={iconButton}
          aria-label={t('nav.projects')}
          title={t('nav.projects')}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <h1 className="min-w-0 truncate px-1 font-medium max-sm:sr-only">
          {p.meta.title || t('wizard.create.untitled')}
        </h1>
        <span
          className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-medium tabular-nums"
          data-testid="stitch-percent"
        >
          {percent}
        </span>
        {saveError && (
          <span role="alert" className="text-xs text-red-700 dark:text-red-300">
            {t('editor.saveError')}
          </span>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className={iconButton}
          onClick={() => tracker.undo()}
          disabled={!tracker.canUndo}
          aria-label={t('editor.undo')}
          title={`${t('editor.undo')} (Ctrl+Z)`}
        >
          <Undo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => tracker.redo()}
          disabled={!tracker.canRedo}
          aria-label={t('editor.redo')}
          title={`${t('editor.redo')} (Ctrl+Y)`}
        >
          <Redo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={`${iconButton} w-auto gap-1.5 px-2`}
          onClick={findNext}
          title={`${t('stitch.findNext')} (N)`}
        >
          <LocateFixed size={18} aria-hidden />
          <span className="text-sm max-md:sr-only">{t('stitch.findNext')}</span>
        </button>
        <button
          type="button"
          className={`${iconButton} lg:hidden`}
          onClick={() => setPanelOpen(!panelOpen)}
          aria-expanded={panelOpen}
          aria-label={t('stitch.panel')}
        >
          <PanelRight size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={`${iconButton} max-sm:hidden`}
          onClick={toggleFullscreen}
          aria-label={fullscreen ? t('stitch.exitFullscreen') : t('stitch.fullscreen')}
          title={`${fullscreen ? t('stitch.exitFullscreen') : t('stitch.fullscreen')} (F)`}
        >
          {fullscreen ? <Minimize size={18} aria-hidden /> : <Maximize size={18} aria-hidden />}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={iconButton} aria-label={t('editor.more')}>
            <MoreHorizontal size={18} aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-60 rounded-lg border border-line bg-surface p-1 shadow-lg"
            >
              <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs text-muted">
                {t('editor.view.label')}
              </DropdownMenu.Label>
              <DropdownMenu.RadioGroup
                value={st.mode}
                onValueChange={(mode) => st.set({ mode: mode as ViewMode })}
              >
                {(['colorSymbols', 'symbols', 'colors'] as const).map((m) => (
                  <DropdownMenu.RadioItem key={m} value={m} className={menuItem}>
                    <span className="w-4">{st.mode === m ? '●' : ''}</span>
                    {t(`editor.view.${m}`)}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs text-muted">
                {t('stitch.doneColor')}
              </DropdownMenu.Label>
              <div className="flex gap-1.5 px-2.5 pb-2">
                <button
                  type="button"
                  onClick={() => st.set({ doneColor: 'auto' })}
                  aria-pressed={st.doneColor === 'auto'}
                  title={t('stitch.doneColors.autoHint')}
                  className={`h-7 rounded-full border-2 px-2 text-xs font-medium ${st.doneColor === 'auto' ? 'border-ink' : 'border-line'}`}
                >
                  {t('stitch.doneColors.auto')}
                </button>
                {DONE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => st.set({ doneColor: c })}
                    aria-label={t(`stitch.doneColors.${c.slice(1)}`)}
                    aria-pressed={st.doneColor === c}
                    className={`size-7 rounded-full border-2 ${st.doneColor === c ? 'border-ink' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              {(
                [
                  ['grid', t('editor.grid')],
                  ['rulers', t('stitch.rulers')],
                  ['leftHanded', t('stitch.leftHanded')],
                  ['keepAwake', t('stitch.keepAwake')],
                ] as const
              ).map(([key, label]) => (
                <DropdownMenu.CheckboxItem
                  key={key}
                  className={menuItem}
                  checked={st[key]}
                  onCheckedChange={(v) => st.set({ [key]: v })}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="w-4">{st[key] ? '✓' : ''}</span>
                  {label}
                </DropdownMenu.CheckboxItem>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item className={menuItem} asChild>
                <Link to={`/project/${id}`}>
                  <Pencil size={16} aria-hidden />
                  {t('stitch.edit')}
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={`${menuItem} text-red-700 dark:text-red-300`}
                onSelect={() => setConfirmReset(true)}
              >
                {t('stitch.reset')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <div className={`relative flex min-h-0 flex-1 ${left ? 'flex-row-reverse' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={`flex flex-wrap items-center gap-1 border-line bg-surface px-2 py-1.5 max-lg:order-last max-lg:border-t lg:border-b ${
              left ? '' : 'max-lg:flex-row-reverse'
            }`}
          >
            <div role="toolbar" aria-label={t('editor.tools.label')} className="flex gap-1">
              {tools.map((tool) => {
                const Icon = TOOL_ICONS[tool];
                return (
                  <button
                    key={tool}
                    type="button"
                    aria-pressed={st.tool === tool}
                    aria-label={t(`stitch.tools.${tool}`)}
                    title={t(`stitch.tools.${tool}`)}
                    onClick={() => st.set({ tool, hint: `stitch.toolHints.${tool}` })}
                    className={`flex size-11 items-center justify-center rounded-lg ${
                      st.tool === tool ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-surface-2'
                    }`}
                  >
                    <Icon size={20} aria-hidden />
                  </button>
                );
              })}
            </div>
            <span className="mx-1 h-6 w-px bg-line max-sm:hidden" />
            {active ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pl-1.5 pr-1 text-sm">
                <SymbolSwatch entry={active} size={24} />
                <span className="font-medium">
                  {active.threads.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                </span>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted hover:bg-surface"
                  onClick={() => st.set({ activeId: null })}
                  aria-label={t('stitch.allColors')}
                  title={t('stitch.allColors')}
                >
                  <X size={14} aria-hidden />
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-surface-2 lg:pointer-events-none"
                onClick={() => setPanelOpen(true)}
              >
                {t('stitch.allColorsHint')}
              </button>
            )}
            <span className="flex-1 max-lg:hidden" />
            <span className="flex max-lg:hidden">
              <button
                type="button"
                className={iconButton}
                onClick={() => chart.current?.zoom(0.8)}
                aria-label={t('editor.zoomOut')}
              >
                <ZoomOut size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={() => chart.current?.zoom(1.25)}
                aria-label={t('editor.zoomIn')}
              >
                <ZoomIn size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButton}
                onClick={() => chart.current?.fit()}
                aria-label={t('editor.fit')}
              >
                <Expand size={18} aria-hidden />
              </button>
            </span>
          </div>
          {resetNotice && (
            <div
              role="status"
              className="flex items-start gap-3 border-b border-line bg-surface-2 px-3 py-2 text-sm"
            >
              <p className="flex-1">{t('stitch.resetNotice')}</p>
              <button
                type="button"
                onClick={() => setResetNotice(false)}
                className="rounded-md px-2 py-0.5 text-muted hover:bg-surface"
              >
                {t('common.close')}
              </button>
            </div>
          )}
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ChartView
              ref={chart}
              doc={doc}
              options={options}
              tool={controller}
              panOnly={st.tool === 'pan'}
              className="flex-1 bg-surface-2"
              label={t('stitch.canvas', { title: p.meta.title })}
              initialView={tracker.data.view}
              onViewChange={(vp) => {
                const [cx, cy] = vp.toCell(vp.width / 2, vp.height / 2);
                const v = tracker.data.view;
                if (
                  v &&
                  Math.abs(v.cx - cx) < 0.01 &&
                  Math.abs(v.cy - cy) < 0.01 &&
                  v.scale === vp.scale
                )
                  return;
                tracker.setView({ cx, cy, scale: vp.scale });
                viewDirty.current = true;
              }}
            />
            {st.hint && (
              <p
                role="status"
                className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit max-w-[90%] rounded-2xl bg-ink px-4 py-2 text-center text-sm text-bg shadow-lg"
              >
                {t(st.hint)}
              </p>
            )}
          </div>
        </div>
        <aside
          aria-label={t('stitch.panel')}
          className={`flex min-h-0 flex-col border-line bg-surface max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:max-h-[65vh] max-lg:rounded-t-2xl max-lg:border-t max-lg:shadow-2xl lg:w-80 ${
            left ? 'lg:border-r' : 'lg:border-l'
          } ${panelOpen ? '' : 'max-lg:hidden'}`}
        >
          <div className="flex justify-end px-2 pt-2 lg:hidden">
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
              onClick={() => setPanelOpen(false)}
              aria-label={t('common.close')}
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <StitchPanel tracker={tracker} version={version} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('stitch.resetTitle')}
        description={t('stitch.resetText')}
        confirmLabel={t('stitch.resetConfirm')}
        danger
        onConfirm={() => {
          tracker.clearAll();
          tracker.clearHistory();
        }}
      />
    </div>
  );
}
