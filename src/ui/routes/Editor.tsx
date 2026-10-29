import { DropdownMenu } from 'radix-ui';
import {
  ArrowLeft,
  Download,
  Expand,
  Grid3x3,
  Hand,
  Loader2,
  MoreHorizontal,
  Palette as PaletteIcon,
  Redo2,
  Sparkles,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../storage/db.ts';
import { PROJECT_EXTENSION } from '../../core/io/projectFile.ts';
import { CompositeCommand, EditorDocument } from '../../core/model/document.ts';
import {
  clearCommand,
  cropCommand,
  extractClip,
  flipClip,
  isolatedMask,
  pasteCommand,
  rotateClip,
} from '../../core/model/ops.ts';
import type { ViewMode } from '../../render/chartRenderer.ts';
import {
  exportProjectFile,
  loadProject,
  saveProject,
  type ProjectSummary,
} from '../../storage/projects.ts';
import { buttonClass } from '../components/buttonClass.ts';
import { LinkButton, Page, PageHeader } from '../components/ui.tsx';
import { downloadBytes, safeFileName } from '../download.ts';
import { ChartView, type ChartViewHandle } from '../editor/ChartView.tsx';
import { CleanupDialog, PropertiesDialog, ResizeDialog, TextDialog } from '../editor/dialogs.tsx';
import { Minimap, type MinimapHandle } from '../editor/Minimap.tsx';
import { PalettePanel, SymbolSwatch } from '../editor/PalettePanel.tsx';
import { INITIAL_EDITOR, useEditor } from '../editor/store.ts';
import { ToolController } from '../editor/toolController.ts';
import { ToolOptions, Toolbar } from '../editor/Toolbar.tsx';
import { TOOLS } from '../editor/tools.ts';
import { patternThumbnail } from '../patternPaint.ts';

export default function Editor() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const [state, setState] = useState<
    { id: string; doc: EditorDocument; summary: ProjectSummary } | null | undefined
  >();

  useEffect(() => {
    let cancelled = false;
    void loadProject(id).then((d) => {
      if (cancelled) return;
      if (!d) {
        setState(null);
        return;
      }
      useEditor.setState({
        ...INITIAL_EDITOR,
        hidden: new Set(),
        activeId: d.pattern.palette[0]?.id ?? null,
      });
      setState({ id, doc: new EditorDocument(d.pattern), summary: d.summary });
    });
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
  return <Workspace key={state.id} id={state.id} doc={state.doc} summary={state.summary} />;
}

type SaveState = 'saved' | 'saving' | 'error';

function Workspace({
  id,
  doc,
  summary,
}: {
  id: string;
  doc: EditorDocument;
  summary: ProjectSummary;
}) {
  const { t } = useTranslation();
  const version = useSyncExternalStore(
    (cb) => doc.subscribe(cb),
    () => doc.version,
  );
  const editor = useEditor();
  const chart = useRef<ChartViewHandle>(null);
  const minimap = useRef<MinimapHandle>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [dialog, setDialog] = useState<'resize' | 'properties' | 'text' | 'cleanup' | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const hasSource = useLiveQuery(
    async () => (await db.sources.where('projectId').equals(id).count()) > 0,
    [id],
  );
  const controller = useMemo(() => new ToolController(doc, useEditor.getState), [doc]);
  const p = doc.pattern;

  // Autosave shortly after the last change, and when the page is hidden or left.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    const flush = async () => {
      if (!dirty) return;
      dirty = false;
      try {
        const pat = doc.pattern;
        const thumbnail = await patternThumbnail(
          pat.width,
          pat.height,
          pat.cells,
          pat.palette,
          pat.fabric.color,
        );
        await saveProject(id, pat, thumbnail);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    };
    const unsubscribe = doc.subscribe(() => {
      dirty = true;
      setSaveState('saving');
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), 800);
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
  }, [doc, id]);

  // Selection and floating paste follow the store; redraw their overlay when they change.
  useEffect(
    () => controller.refresh(),
    [controller, editor.selection, editor.selectionMask, editor.floating],
  );

  const isolated = useMemo(() => {
    void version;
    return editor.showIsolated ? isolatedMask(p) : undefined;
  }, [editor.showIsolated, p, version]);
  const isolatedCount = useMemo(
    () => (isolated ? isolated.reduce((n, v) => n + v, 0) : 0),
    [isolated],
  );

  const background =
    getComputedStyle(document.documentElement).getPropertyValue('--surface-2').trim() || '#f3eee6';
  const options = {
    mode: editor.mode,
    grid: editor.grid,
    rulers: editor.rulers,
    highlightId: editor.highlightId,
    hidden: editor.hidden,
    showIsolated: editor.showIsolated,
    isolated,
    background,
  };

  const selectionAction = (
    action:
      | 'copy'
      | 'cut'
      | 'delete'
      | 'crop'
      | 'flipH'
      | 'flipV'
      | 'rotate'
      | 'paste'
      | 'apply'
      | 'cancel',
  ) => {
    const s = useEditor.getState();
    const sel = s.selection;
    const f = s.floating;
    if (f) {
      if (action === 'apply') {
        doc.execute(pasteCommand(p, f.clip, f.x, f.y));
        s.set({
          floating: null,
          selection: { x0: f.x, y0: f.y, x1: f.x + f.clip.width, y1: f.y + f.clip.height },
          selectionMask: null,
        });
      } else if (action === 'cancel') s.set({ floating: null });
      else if (action === 'flipH' || action === 'flipV')
        s.set({ floating: { ...f, clip: flipClip(f.clip, action === 'flipH') } });
      else if (action === 'rotate') s.set({ floating: { ...f, clip: rotateClip(f.clip) } });
      return;
    }
    if (action === 'paste' && s.clipboard) {
      const v = chart.current?.viewport();
      let x = sel?.x0 ?? 0;
      let y = sel?.y0 ?? 0;
      if (!sel && v) {
        const [cx, cy] = v.toCell(v.width / 2, v.height / 2);
        x = Math.round(cx - s.clipboard.width / 2);
        y = Math.round(cy - s.clipboard.height / 2);
      }
      s.set({ floating: { clip: s.clipboard, x, y }, tool: 'select' });
      return;
    }
    if (!sel) return;
    const { x0, y0, x1, y1 } = sel;
    const mask = s.selectionMask ?? undefined;
    if (action === 'copy' || action === 'cut') {
      s.set({ clipboard: extractClip(p, x0, y0, x1, y1, mask) });
      if (action === 'cut') doc.execute(clearCommand(p, x0, y0, x1, y1, mask));
    } else if (action === 'delete') {
      doc.execute(clearCommand(p, x0, y0, x1, y1, mask));
    } else if (action === 'crop') {
      doc.execute(cropCommand(p, x0, y0, x1, y1));
      s.set({ selection: null, selectionMask: null });
      chart.current?.fit();
    } else {
      const clip = extractClip(p, x0, y0, x1, y1, mask);
      const next = action === 'rotate' ? rotateClip(clip) : flipClip(clip, action === 'flipH');
      const clear = clearCommand(p, x0, y0, x1, y1, mask);
      clear.apply(p, true);
      const paste = pasteCommand(p, next, x0, y0);
      clear.apply(p, false);
      doc.execute(new CompositeCommand([clear, paste]));
      s.set({
        selection: {
          x0,
          y0,
          x1: Math.min(p.width, x0 + next.width),
          y1: Math.min(p.height, y0 + next.height),
        },
        selectionMask: null,
      });
    }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [role="dialog"], [role="menu"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) doc.redo();
        else doc.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        doc.redo();
      } else if (mod && k === 'c') selectionAction('copy');
      else if (mod && k === 'x') selectionAction('cut');
      else if (mod && k === 'v') selectionAction('paste');
      else if (e.key === 'Delete' || e.key === 'Backspace') selectionAction('delete');
      else if (e.key === 'Escape') {
        const s = useEditor.getState();
        if (s.floating) s.set({ floating: null });
        else s.set({ selection: null, selectionMask: null, highlightId: null });
      } else if (e.key === 'Enter' && useEditor.getState().floating) selectionAction('apply');
      else if (!mod && (e.key === '+' || e.key === '=')) chart.current?.zoom(1.25);
      else if (!mod && e.key === '-') chart.current?.zoom(0.8);
      else if (!mod && e.key === '0') chart.current?.fit();
      else if (!mod && k === 'g') useEditor.getState().set({ grid: !useEditor.getState().grid });
      else if (!mod && !e.altKey) {
        const tool = TOOLS.find((x) => x.key.toLowerCase() === k);
        if (tool) useEditor.getState().set({ tool: tool.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const active = p.palette.find((e) => e.id === editor.activeId);
  const iconButton =
    'flex size-9 items-center justify-center rounded-lg text-ink hover:bg-surface-2 disabled:opacity-40';
  const menuItem =
    'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
        <Link
          to="/"
          className={iconButton}
          aria-label={t('nav.projects')}
          title={t('nav.projects')}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <button
          type="button"
          onClick={() => setDialog('properties')}
          className="min-w-0 max-w-[40vw] truncate rounded-lg px-2 py-1 text-left font-medium hover:bg-surface-2"
          title={t('editor.properties.title')}
        >
          {p.meta.title || t('wizard.create.untitled')}
        </button>
        <span className="px-1 text-xs text-muted" role="status">
          {saveState === 'saving'
            ? t('editor.saving')
            : saveState === 'error'
              ? t('editor.saveError')
              : t('editor.saved')}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          className={iconButton}
          onClick={() => doc.undo()}
          disabled={!doc.canUndo}
          aria-label={t('editor.undo')}
          title={`${t('editor.undo')} (Ctrl+Z)`}
        >
          <Undo2 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => doc.redo()}
          disabled={!doc.canRedo}
          aria-label={t('editor.redo')}
          title={`${t('editor.redo')} (Ctrl+Y)`}
        >
          <Redo2 size={18} aria-hidden />
        </button>
        <select
          aria-label={t('editor.view.label')}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
          value={editor.mode}
          onChange={(e) => editor.set({ mode: e.target.value as ViewMode })}
        >
          {(['colorSymbols', 'symbols', 'colors'] as const).map((m) => (
            <option key={m} value={m}>
              {t(`editor.view.${m}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${iconButton} ${editor.grid ? 'bg-surface-2' : ''}`}
          aria-pressed={editor.grid}
          onClick={() => editor.set({ grid: !editor.grid })}
          aria-label={t('editor.grid')}
          title={`${t('editor.grid')} (G)`}
        >
          <Grid3x3 size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={`${iconButton} w-auto gap-1 px-2 ${editor.showIsolated ? 'bg-surface-2' : ''}`}
          aria-pressed={editor.showIsolated}
          onClick={() => editor.set({ showIsolated: !editor.showIsolated })}
          title={t('editor.isolated')}
        >
          <Sparkles size={18} aria-hidden />
          <span className="text-xs max-sm:sr-only">
            {editor.showIsolated
              ? t('editor.isolatedCount', { count: isolatedCount })
              : t('editor.isolated')}
          </span>
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => chart.current?.zoom(0.8)}
          aria-label={t('editor.zoomOut')}
          title={`${t('editor.zoomOut')} (−)`}
        >
          <ZoomOut size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => chart.current?.zoom(1.25)}
          aria-label={t('editor.zoomIn')}
          title={`${t('editor.zoomIn')} (+)`}
        >
          <ZoomIn size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => chart.current?.fit()}
          aria-label={t('editor.fit')}
          title={`${t('editor.fit')} (0)`}
        >
          <Expand size={18} aria-hidden />
        </button>
        <button
          type="button"
          className={`${iconButton} lg:hidden`}
          onClick={() => setPaletteOpen(!paletteOpen)}
          aria-expanded={paletteOpen}
          aria-label={t('editor.palette.toggle')}
        >
          <PaletteIcon size={18} aria-hidden />
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={iconButton} aria-label={t('editor.more')}>
            <MoreHorizontal size={18} aria-hidden />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-56 rounded-lg border border-line bg-surface p-1 shadow-lg"
            >
              <DropdownMenu.Item className={menuItem} onSelect={() => setDialog('text')}>
                <Type size={16} aria-hidden />
                {t('editor.text.title')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={() => setDialog('cleanup')}>
                <Sparkles size={16} aria-hidden />
                {t('editor.cleanup.title')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={() => setDialog('resize')}>
                <Expand size={16} aria-hidden />
                {t('editor.resize.title')}
              </DropdownMenu.Item>
              <DropdownMenu.Item className={menuItem} onSelect={() => setDialog('properties')}>
                {t('editor.properties.title')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                disabled={!hasSource}
                onSelect={() => navigate(`/new?from=${id}`)}
              >
                {t('editor.regenerate')}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuItem}
                disabled={summary.imported}
                onSelect={async () =>
                  downloadBytes(
                    await exportProjectFile(id),
                    safeFileName(p.meta.title) + PROJECT_EXTENSION,
                  )
                }
              >
                <Download size={16} aria-hidden />
                {t('home.export')}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <Link to={`/project/${id}/stitch`} className={buttonClass('primary', 'px-3 py-1.5')}>
          <Hand size={16} aria-hidden />
          <span className="max-sm:sr-only">{t('home.stitch')}</span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden border-r border-line bg-surface p-1.5 lg:block">
          <Toolbar vertical />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-11 flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
            {active ? (
              <span className="flex items-center gap-2 text-sm" title={t('editor.activeColor')}>
                <SymbolSwatch entry={active} size={24} />
                <span className="font-medium">
                  {active.threads.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted">{t('editor.noActiveColor')}</span>
            )}
            <span className="h-5 w-px bg-line" />
            <ToolOptions onSelectionAction={selectionAction} />
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col">
            <ChartView
              ref={chart}
              onViewChange={(vp) => minimap.current?.update(vp)}
              doc={doc}
              options={options}
              tool={controller}
              panOnly={editor.tool === 'pan' && !editor.floating}
              className="flex-1 bg-surface-2"
              label={t('editor.canvas', { title: p.meta.title })}
            />
            {editor.minimap && (
              <Minimap
                ref={minimap}
                doc={doc}
                version={version}
                label={t('editor.minimap')}
                onNavigate={(cx, cy) => chart.current?.focus(cx, cy, 0)}
              />
            )}
          </div>
          <div className="overflow-x-auto border-t border-line bg-surface p-1.5 lg:hidden">
            <Toolbar vertical={false} />
          </div>
        </div>
        <aside
          className={`flex min-h-0 flex-col border-l border-line bg-surface max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:max-h-[55vh] max-lg:rounded-t-2xl max-lg:border-t max-lg:shadow-2xl lg:w-80 ${
            paletteOpen ? '' : 'max-lg:hidden'
          }`}
        >
          <PalettePanel doc={doc} version={version} />
        </aside>
      </div>

      <ResizeDialog
        key={`r${dialog === 'resize'}`}
        doc={doc}
        open={dialog === 'resize'}
        onOpenChange={(o) => setDialog(o ? 'resize' : null)}
      />
      <PropertiesDialog
        key={`p${dialog === 'properties'}`}
        doc={doc}
        open={dialog === 'properties'}
        onOpenChange={(o) => setDialog(o ? 'properties' : null)}
      />
      <TextDialog
        open={dialog === 'text'}
        onOpenChange={(o) => setDialog(o ? 'text' : null)}
        activeId={editor.activeId}
        onInsert={(clip) => {
          const v = chart.current?.viewport();
          const [cx, cy] = v ? v.toCell(v.width / 2, v.height / 2) : [0, 0];
          editor.set({
            floating: {
              clip,
              x: Math.round(cx - clip.width / 2),
              y: Math.round(cy - clip.height / 2),
            },
            tool: 'select',
          });
        }}
      />
      <CleanupDialog
        doc={doc}
        open={dialog === 'cleanup'}
        onOpenChange={(o) => setDialog(o ? 'cleanup' : null)}
      />
    </div>
  );
}
