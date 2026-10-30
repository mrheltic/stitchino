import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Minus, Plus, Trash2, Upload } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryCsv, parseCodeList, parseInventoryCsv } from '../../core/io/inventoryCsv.ts';
import { getThread, searchThreads } from '../../core/threads/catalog.ts';
import { BRANDS, type Brand } from '../../core/threads/types.ts';
import type { InventoryRow } from '../../storage/db.ts';
import {
  addSkeins,
  clearInventory,
  importInventory,
  listInventory,
  setSkeins,
} from '../../storage/inventory.ts';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Choice } from '../components/controls.tsx';
import { Button, Card, Page, PageHeader } from '../components/ui.tsx';
import { downloadBytes } from '../download.ts';
import { formatInt } from '../format.ts';

function Swatch({ brand, code }: { brand: Brand; code: string }) {
  const th = getThread({ brand, code });
  const [r, g, b] = th?.rgb ?? [200, 200, 200];
  return (
    <span
      className="size-7 shrink-0 rounded border border-black/10"
      style={{ background: `rgb(${r},${g},${b})` }}
      aria-hidden
    />
  );
}

function sortRows(rows: InventoryRow[]): InventoryRow[] {
  return [...rows].sort(
    (a, b) =>
      BRANDS.indexOf(a.brand) - BRANDS.indexOf(b.brand) ||
      a.code.localeCompare(b.code, 'en', { numeric: true }),
  );
}

export default function Inventory() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const rows = useLiveQuery(() => listInventory(), []);
  const [brand, setBrand] = useState<Brand>('DMC');
  const [query, setQuery] = useState('');
  const [codes, setCodes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const owned = new Map(rows?.map((r) => [r.key, r.skeins]));
  const results = query.trim() ? searchThreads(query, brand, 12) : [];
  const f = filter.trim().toLowerCase();
  const shown = sortRows(rows ?? []).filter(
    (r) =>
      !f ||
      r.code.toLowerCase().startsWith(f) ||
      (getThread(r.key)?.name.toLowerCase().includes(f) ?? false),
  );
  const skeins = (rows ?? []).reduce((s, r) => s + r.skeins, 0);

  const addList = async () => {
    const { refs, unknown } = parseCodeList(codes, brand);
    await addSkeins(refs.map((ref) => ({ ref, skeins: 1 })));
    setFeedback(
      [
        t('inventory.added', { count: refs.length }),
        unknown.length ? t('inventory.unknown', { list: unknown.join(', ') }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
    if (refs.length) setCodes('');
  };

  const importCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const { items, unknown } = parseInventoryCsv(await file.text(), brand);
    await importInventory(items);
    setFeedback(
      [
        t('inventory.imported', { count: items.length }),
        unknown.length ? t('inventory.skippedLines', { count: unknown.length }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  };

  const exportCsv = () => {
    const csv = inventoryCsv(
      (rows ?? []).map((r) => ({ ref: { brand: r.brand, code: r.code }, skeins: r.skeins })),
    );
    downloadBytes(new Blob([csv], { type: 'text/csv;charset=utf-8' }), t('inventory.fileName'));
  };

  const stepper =
    'flex size-8 items-center justify-center rounded-lg border border-line hover:bg-surface-2';

  return (
    <Page>
      <PageHeader title={t('inventory.title')}>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 has-focus-visible:outline-2">
          <Upload size={16} aria-hidden />
          {t('inventory.importCsv')}
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            className="sr-only"
            onChange={(e) => void importCsv(e)}
          />
        </label>
        <Button onClick={exportCsv} disabled={!rows?.length}>
          <Download size={16} aria-hidden />
          {t('inventory.exportCsv')}
        </Button>
      </PageHeader>
      <p className="-mt-3 mb-6 max-w-2xl text-muted">{t('inventory.intro')}</p>

      <Card className="mb-6 space-y-4">
        <h2 className="font-medium">{t('inventory.add')}</h2>
        <Choice<Brand>
          name="inventory-brand"
          size="sm"
          value={brand}
          onChange={setBrand}
          options={BRANDS.map((b) => ({ value: b, label: b }))}
        />
        <div className="space-y-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          {results.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {results.map((th) => (
                <li key={th.key}>
                  <button
                    type="button"
                    onClick={() => void addSkeins([{ ref: th, skeins: 1 }])}
                    className="flex w-full items-center gap-2 rounded-lg border border-line px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    <Swatch brand={th.brand} code={th.code} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {th.brand} {th.code}
                      </span>
                      <span className="line-clamp-2 text-xs text-muted">{th.name}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {owned.get(th.key) ? t('inventory.have', { count: owned.get(th.key) }) : ''}
                    </span>
                    <Plus size={16} aria-label={t('inventory.addOne')} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && results.length === 0 && (
            <p className="text-sm text-muted">{t('picker.none')}</p>
          )}
        </div>
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void addList();
          }}
        >
          <label htmlFor="inventory-codes" className="block text-sm font-medium">
            {t('inventory.many')}
          </label>
          <div className="flex gap-2">
            <input
              id="inventory-codes"
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              placeholder="310, 321, 150-168"
              className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!codes.trim()}>
              {t('inventory.addButton')}
            </Button>
          </div>
          <p className="text-xs text-muted">{t('inventory.manyHint')}</p>
        </form>
        {feedback && (
          <p role="status" className="text-sm">
            {feedback}
          </p>
        )}
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-medium">
            {t('inventory.summary', {
              count: rows?.length ?? 0,
              skeins: formatInt(skeins, lng),
            })}
          </h2>
          <span className="flex-1" />
          {(rows?.length ?? 0) > 8 && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('inventory.filter')}
              aria-label={t('inventory.filter')}
              className="w-48 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
            />
          )}
          {(rows?.length ?? 0) > 0 && (
            <Button
              variant="ghost"
              className="px-2 py-1 text-xs"
              onClick={() => setConfirmClear(true)}
            >
              {t('inventory.clear')}
            </Button>
          )}
        </div>
        {rows && rows.length === 0 ? (
          <p className="text-sm text-muted">{t('inventory.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r) => {
              const ref = { brand: r.brand, code: r.code };
              return (
                <li key={r.key} className="flex items-center gap-3 py-2">
                  <Swatch brand={r.brand} code={r.code} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">
                      {r.brand} {r.code}
                    </span>{' '}
                    <span className="text-muted">{getThread(r.key)?.name}</span>
                  </span>
                  <button
                    type="button"
                    className={stepper}
                    onClick={() => void setSkeins(ref, r.skeins - 1)}
                    aria-label={t('inventory.less', { thread: `${r.brand} ${r.code}` })}
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r.skeins}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) void setSkeins(ref, v);
                    }}
                    aria-label={t('inventory.skeinsOf', { thread: `${r.brand} ${r.code}` })}
                    className="w-14 rounded-lg border border-line bg-surface px-2 py-1 text-center text-sm tabular-nums"
                  />
                  <button
                    type="button"
                    className={stepper}
                    onClick={() => void setSkeins(ref, r.skeins + 1)}
                    aria-label={t('inventory.more', { thread: `${r.brand} ${r.code}` })}
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink"
                    onClick={() => void setSkeins(ref, 0)}
                    aria-label={t('inventory.remove', { thread: `${r.brand} ${r.code}` })}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('inventory.clearTitle')}
        description={t('inventory.clearText')}
        confirmLabel={t('inventory.clear')}
        danger
        onConfirm={() => void clearInventory()}
      />
    </Page>
  );
}
