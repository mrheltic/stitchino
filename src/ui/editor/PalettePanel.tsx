import { DropdownMenu } from 'radix-ui';
import { Eye, EyeOff, MoreVertical, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorDocument } from '../../core/model/document.ts';
import { entryRgb } from '../../core/model/entryColor.ts';
import {
  deleteColorCommand,
  mergeColorsCommand,
  updatePaletteCommand,
} from '../../core/model/ops.ts';
import { countStitches, nextPaletteId, type PaletteEntry } from '../../core/model/pattern.ts';
import { SYMBOLS } from '../../core/model/symbols.ts';
import { estimatePattern } from '../../core/size/threadEstimate.ts';
import { equivalentThread, getThread, type CatalogThread } from '../../core/threads/catalog.ts';
import { relativeLuminance } from '../../core/color/srgb.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { formatInt } from '../format.ts';
import { useEditor } from './store.ts';
import { SymbolPicker } from './SymbolPicker.tsx';
import { ThreadPicker } from './ThreadPicker.tsx';

export function SymbolSwatch({ entry, size = 28 }: { entry: PaletteEntry; size?: number }) {
  const rgb = entryRgb(entry);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded border border-black/10 font-symbols"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.6,
        background: `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`,
        color: relativeLuminance(rgb) > 0.3 ? '#111' : '#fff',
      }}
      aria-hidden
    >
      {entry.symbol}
    </span>
  );
}

const menuItem =
  'flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40';

/** Colours of the pattern with usage, and every palette operation. */
export function PalettePanel({ doc, version }: { doc: EditorDocument; version: number }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const { activeId, highlightId, hidden, set, toggleHidden } = useEditor();
  const [picker, setPicker] = useState<
    { mode: 'add' } | { mode: 'replace'; entry: PaletteEntry } | null
  >(null);
  const [symbolFor, setSymbolFor] = useState<PaletteEntry | null>(null);
  const [deleting, setDeleting] = useState<PaletteEntry | null>(null);
  const p = doc.pattern;

  const { counts, estimates } = useMemo(() => {
    void version;
    const c = countStitches(p);
    return { counts: c, estimates: estimatePattern(p, c) };
  }, [p, version]);

  const total = (id: number) => {
    const c = counts.get(id);
    return c ? c.full + c.half + c.quarter + c.threeQuarter : 0;
  };

  const addThread = (thread: CatalogThread) => {
    const existing = p.palette.find(
      (e) =>
        e.threads.length === 1 &&
        e.threads[0].brand === thread.brand &&
        e.threads[0].code === thread.code,
    );
    if (existing) {
      set({ activeId: existing.id });
      return;
    }
    const id = nextPaletteId(p);
    const used = new Set(p.palette.map((e) => e.symbol));
    const symbol = SYMBOLS.find((s) => !used.has(s)) ?? SYMBOLS[p.palette.length % SYMBOLS.length];
    const strands = p.palette[0]?.strands ?? 2;
    doc.execute(
      updatePaletteCommand(p, (list) => [
        ...list,
        {
          id,
          threads: [{ brand: thread.brand, code: thread.code }],
          symbol,
          strands,
          backStrands: 1,
        },
      ]),
    );
    set({ activeId: id });
  };

  const replaceThread = (entry: PaletteEntry, thread: CatalogThread) => {
    doc.execute(
      updatePaletteCommand(p, (list) =>
        list.map((e) =>
          e.id === entry.id ? { ...e, threads: [{ brand: thread.brand, code: thread.code }] } : e,
        ),
      ),
    );
  };

  const setStrands = (entry: PaletteEntry, strands: number) => {
    doc.execute(
      updatePaletteCommand(p, (list) =>
        list.map((e) => (e.id === entry.id ? { ...e, strands } : e)),
      ),
    );
  };

  const setSymbol = (entry: PaletteEntry, symbol: string) => {
    doc.execute(
      updatePaletteCommand(p, (list) =>
        list.map((e) => (e.id === entry.id ? { ...e, symbol } : e)),
      ),
    );
  };

  const sorted = [...p.palette].sort((a, b) => total(b.id) - total(a.id));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="font-medium">{t('editor.palette.title', { count: p.palette.length })}</h2>
        <button
          type="button"
          onClick={() => setPicker({ mode: 'add' })}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-accent hover:bg-surface-2"
        >
          <Plus size={16} aria-hidden />
          {t('editor.palette.add')}
        </button>
      </div>
      {highlightId !== null && (
        <button
          type="button"
          className="mx-3 mt-2 rounded-lg bg-surface-2 px-2 py-1 text-xs"
          onClick={() => set({ highlightId: null })}
        >
          {t('editor.palette.showAll')}
        </button>
      )}
      <ul className="min-h-0 flex-1 overflow-auto py-1" aria-label={t('editor.palette.list')}>
        {sorted.length === 0 && (
          <li className="px-3 py-4 text-sm text-muted">{t('editor.palette.empty')}</li>
        )}
        {sorted.map((e) => {
          const thread = getThread(e.threads[0]);
          const other = e.threads[0].brand === 'DMC' ? 'Anchor' : 'DMC';
          const eq = equivalentThread(e.threads[0], other);
          const isHidden = hidden.has(e.id);
          return (
            <li
              key={e.id}
              className={`flex items-center gap-2 px-2 py-1 ${activeId === e.id ? 'bg-surface-2' : ''}`}
            >
              <button
                type="button"
                onClick={() => set({ activeId: e.id })}
                aria-pressed={activeId === e.id}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left"
              >
                <SymbolSwatch entry={e} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.threads.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {thread?.name}
                    {eq && ` · ≈ ${other} ${eq.thread.code}`}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                  <span className="block" data-testid="stitch-count">
                    {formatInt(total(e.id), lng)}
                  </span>
                  <span className="block">
                    {t('editor.palette.skeins', { count: estimates.get(e.id)?.skeins ?? 0 })}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleHidden(e.id)}
                className="rounded p-1 text-muted hover:bg-surface-2"
                aria-label={isHidden ? t('editor.palette.show') : t('editor.palette.fade')}
                title={isHidden ? t('editor.palette.show') : t('editor.palette.fade')}
              >
                {isHidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="rounded p-1 text-muted hover:bg-surface-2"
                  aria-label={t('editor.palette.actions')}
                >
                  <MoreVertical size={16} aria-hidden />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    className="z-50 min-w-52 rounded-lg border border-line bg-surface p-1 shadow-lg"
                  >
                    <DropdownMenu.Item
                      className={menuItem}
                      onSelect={() => set({ highlightId: e.id })}
                    >
                      {t('editor.palette.highlight')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={menuItem}
                      onSelect={() => setPicker({ mode: 'replace', entry: e })}
                    >
                      {t('editor.palette.replace')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={() => setSymbolFor(e)}>
                      {t('editor.palette.changeSymbol')}
                    </DropdownMenu.Item>
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className={menuItem}>
                        {t('editor.palette.strands', { count: e.strands })}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent className="z-50 rounded-lg border border-line bg-surface p-1 shadow-lg">
                          {[1, 2, 3, 4].map((n) => (
                            <DropdownMenu.Item
                              key={n}
                              className={menuItem}
                              onSelect={() => setStrands(e, n)}
                            >
                              {t('editor.palette.strandsOption', { count: n })}
                            </DropdownMenu.Item>
                          ))}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger className={menuItem} disabled={p.palette.length < 2}>
                        {t('editor.palette.merge')}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent className="z-50 max-h-80 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
                          {p.palette
                            .filter((x) => x.id !== e.id)
                            .map((x) => (
                              <DropdownMenu.Item
                                key={x.id}
                                className={menuItem}
                                onSelect={() => {
                                  doc.execute(mergeColorsCommand(p, e.id, x.id));
                                  if (activeId === e.id) set({ activeId: x.id });
                                }}
                              >
                                <SymbolSwatch entry={x} size={20} />
                                {x.threads.map((th) => `${th.brand} ${th.code}`).join(' + ')}
                              </DropdownMenu.Item>
                            ))}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Separator className="my-1 h-px bg-line" />
                    <DropdownMenu.Item
                      className={`${menuItem} text-red-700 dark:text-red-300`}
                      onSelect={() => setDeleting(e)}
                    >
                      {t('editor.palette.delete')}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </li>
          );
        })}
      </ul>
      <ThreadPicker
        open={picker !== null}
        onOpenChange={(o) => !o && setPicker(null)}
        title={
          picker?.mode === 'replace'
            ? t('editor.palette.replaceTitle')
            : t('editor.palette.addTitle')
        }
        current={picker?.mode === 'replace' ? picker.entry.threads[0] : undefined}
        onPick={(thread) =>
          picker?.mode === 'replace' ? replaceThread(picker.entry, thread) : addThread(thread)
        }
      />
      <SymbolPicker
        open={symbolFor !== null}
        onOpenChange={(o) => !o && setSymbolFor(null)}
        used={new Set(p.palette.map((e) => e.symbol))}
        current={symbolFor?.symbol}
        onPick={(s) => symbolFor && setSymbol(symbolFor, s)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('editor.palette.deleteTitle')}
        description={t('editor.palette.deleteText', { count: deleting ? total(deleting.id) : 0 })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => {
          if (!deleting) return;
          doc.execute(deleteColorCommand(p, deleting.id));
          if (activeId === deleting.id) set({ activeId: null });
        }}
      />
    </div>
  );
}
