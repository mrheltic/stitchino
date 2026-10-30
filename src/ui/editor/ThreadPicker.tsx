import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  equivalentThread,
  getThread,
  searchThreads,
  threadsOf,
  type CatalogThread,
} from '../../core/threads/catalog.ts';
import { ThreadMatcher } from '../../core/threads/nearest.ts';
import { BRANDS, type Brand, type ThreadRef } from '../../core/threads/types.ts';
import { Choice } from '../components/controls.tsx';
import { Dialog } from '../components/Dialog.tsx';

function ThreadChip({
  t,
  onPick,
  current,
}: {
  t: CatalogThread;
  onPick: (t: CatalogThread) => void;
  current?: boolean;
}) {
  const [r, g, b] = t.rgb;
  return (
    <button
      type="button"
      onClick={() => onPick(t)}
      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${current ? 'border-accent' : 'border-line'}`}
      title={`${t.brand} ${t.code} – ${t.name}`}
    >
      <span
        className="size-6 shrink-0 rounded border border-black/10"
        style={{ background: `rgb(${r},${g},${b})` }}
      />
      <span className="min-w-0">
        <span className="block font-medium leading-tight">{t.code}</span>
        <span className="line-clamp-2 text-xs leading-tight text-muted">{t.name}</span>
      </span>
    </button>
  );
}

/** Dialog to choose a thread: closest matches to the current one, search, or browse a brand. */
export function ThreadPicker({
  open,
  onOpenChange,
  title,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  current?: ThreadRef;
  onPick: (t: CatalogThread) => void;
}) {
  const { t } = useTranslation();
  const [brand, setBrand] = useState<Brand>(current?.brand ?? 'DMC');
  const [query, setQuery] = useState('');
  const currentThread = current ? getThread(current) : undefined;

  const similar = useMemo(() => {
    if (!currentThread) return [];
    const list = threadsOf(brand);
    return new ThreadMatcher(list)
      .nearestK(currentThread.lab, 13)
      .map((m) => list[m.index])
      .filter((x) => x.key !== currentThread.key)
      .slice(0, 12);
  }, [currentThread, brand]);

  const results = useMemo(
    () => (query.trim() ? searchThreads(query, brand, 120) : [...threadsOf(brand)]),
    [query, brand],
  );
  const equivalent =
    currentThread && currentThread.brand !== brand
      ? equivalentThread(currentThread, brand)
      : undefined;
  const pick = (x: CatalogThread) => {
    onPick(x);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Choice<Brand>
            name="picker-brand"
            size="sm"
            value={brand}
            onChange={setBrand}
            options={BRANDS.map((b) => ({ value: b, label: b }))}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
          />
        </div>
        {equivalent && (
          <section>
            <h3 className="mb-2 text-sm font-medium">{t('picker.equivalent')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ThreadChip t={equivalent.thread} onPick={pick} />
            </div>
          </section>
        )}
        {similar.length > 0 && !query && (
          <section>
            <h3 className="mb-2 text-sm font-medium">{t('picker.similar')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {similar.map((x) => (
                <ThreadChip key={x.key} t={x} onPick={pick} />
              ))}
            </div>
          </section>
        )}
        <section>
          <h3 className="mb-2 text-sm font-medium">
            {query ? t('picker.results') : t('picker.all', { brand })}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((x) => (
              <ThreadChip key={x.key} t={x} onPick={pick} current={x.key === currentThread?.key} />
            ))}
          </div>
          {results.length === 0 && <p className="text-sm text-muted">{t('picker.none')}</p>}
        </section>
      </div>
    </Dialog>
  );
}
