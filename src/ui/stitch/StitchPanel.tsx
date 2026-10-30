import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localDay, pace, type ProgressTracker } from '../../core/progress/tracker.ts';
import { getThread } from '../../core/threads/catalog.ts';
import { Toggle } from '../components/controls.tsx';
import { SymbolSwatch } from '../editor/PalettePanel.tsx';
import { formatInt } from '../format.ts';
import { DailyChart } from './DailyChart.tsx';
import { useStitch } from './store.ts';

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      className="h-2 overflow-hidden rounded-full"
      style={{ background: 'color-mix(in srgb, var(--accent) 18%, var(--surface))' }}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

/** Progress summary, daily chart and the colours with what's left of each. */
export function StitchPanel({ tracker, version }: { tracker: ProgressTracker; version: number }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const activeId = useStitch((s) => s.activeId);
  const set = useStitch((s) => s.set);
  const [hideDone, setHideDone] = useState(false);
  void version;

  const { total, done } = tracker.total;
  const ratio = total ? done / total : 0;
  const percent = new Intl.NumberFormat(lng, { style: 'percent', maximumFractionDigits: 0 }).format(
    total && done < total ? Math.min(ratio, 0.99) : ratio,
  );
  const today = Math.max(0, tracker.data.daily[localDay()] ?? 0);
  const p = pace(tracker.data.daily, total - done);
  const entries = tracker.pattern.palette.filter((e) => {
    const tl = tracker.tallies.get(e.id);
    return tl && tl.total > 0 && !(hideDone && tl.done === tl.total);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="space-y-3 border-b border-line p-3" aria-label={t('stitch.progress')}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold tabular-nums">{percent}</p>
          <p className="text-sm text-muted tabular-nums">
            {t('stitch.doneOf', { done: formatInt(done, lng), total: formatInt(total, lng) })}
          </p>
        </div>
        <Meter value={ratio} label={t('stitch.progress')} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{t('stitch.today')}</dt>
          <dd className="tabular-nums">
            {t('stitch.stitches', { count: today, n: formatInt(today, lng) })}
          </dd>
          {done >= total && total > 0 ? (
            <>
              <dt className="text-muted">{t('stitch.finish')}</dt>
              <dd className="font-medium">{t('stitch.finished')}</dd>
            </>
          ) : (
            p.finish && (
              <>
                <dt className="text-muted">{t('stitch.pace')}</dt>
                <dd className="tabular-nums">
                  {t('stitch.paceValue', { n: formatInt(p.perDay, lng) })}
                </dd>
                <dt className="text-muted">{t('stitch.finish')}</dt>
                <dd>{p.finish.toLocaleDateString(lng, { dateStyle: 'long' })}</dd>
              </>
            )
          )}
          {tracker.backTotal.total > 0 && (
            <>
              <dt className="text-muted">{t('stitch.backstitch')}</dt>
              <dd className="tabular-nums">
                {tracker.backTotal.done}/{tracker.backTotal.total}
              </dd>
            </>
          )}
          {tracker.knotTotal.total > 0 && (
            <>
              <dt className="text-muted">{t('stitch.knots')}</dt>
              <dd className="tabular-nums">
                {tracker.knotTotal.done}/{tracker.knotTotal.total}
              </dd>
            </>
          )}
        </dl>
        <DailyChart daily={tracker.data.daily} />
      </section>
      <section className="flex min-h-0 flex-1 flex-col" aria-label={t('stitch.colors')}>
        <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
          <h2 className="text-sm font-medium">{t('stitch.colors')}</h2>
          <Toggle checked={hideDone} onChange={setHideDone}>
            <span className="text-xs">{t('stitch.hideDone')}</span>
          </Toggle>
        </div>
        <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {entries.map((e) => {
            const tl = tracker.tallies.get(e.id)!;
            const complete = tl.done === tl.total;
            const name = getThread(e.threads[0])?.name ?? '';
            return (
              <li key={e.id}>
                <button
                  type="button"
                  aria-pressed={activeId === e.id}
                  onClick={() => set({ activeId: activeId === e.id ? null : e.id })}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${
                    activeId === e.id ? 'bg-surface-2 ring-2 ring-accent' : 'hover:bg-surface-2'
                  } ${complete ? 'opacity-60' : ''}`}
                >
                  <SymbolSwatch entry={e} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {e.threads.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                      <span className="ml-1.5 font-normal text-muted">{name}</span>
                    </span>
                    <span className="mt-1 block">
                      <Meter value={tl.done / tl.total} label={t('stitch.colorProgress')} />
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-right text-xs tabular-nums text-muted">
                    {complete ? (
                      <CircleCheck
                        size={18}
                        className="ml-auto text-accent"
                        aria-label={t('stitch.colorDone')}
                      />
                    ) : (
                      t('stitch.left', { n: formatInt(tl.total - tl.done, lng) })
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
