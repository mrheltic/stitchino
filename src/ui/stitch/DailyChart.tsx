import { useTranslation } from 'react-i18next';
import { localDay } from '../../core/progress/tracker.ts';
import { formatInt } from '../format.ts';

const DAYS = 14;
const W = 280;
const H = 72;
const BASE = H - 14;
const TOP = 12;

/** Stitches per day over the last two weeks: today in the accent, earlier days muted. */
export function DailyChart({ daily }: { daily: Record<string, number> }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const today = new Date();
  const days = Array.from({ length: DAYS }, (_, k) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DAYS - 1 - k));
    return { date: d, n: Math.max(0, daily[localDay(d)] ?? 0) };
  });
  const max = Math.max(...days.map((d) => d.n));
  const slot = W / DAYS;
  const bar = Math.min(24, slot - 2);
  const label = (d: Date) => d.toLocaleDateString(lng, { day: 'numeric', month: 'short' });
  const peak = days.findIndex((d) => d.n === max);

  return (
    <figure className="space-y-1">
      <figcaption className="text-sm font-medium">{t('stitch.daily.title')}</figcaption>
      {max === 0 ? (
        <p className="text-sm text-muted">{t('stitch.daily.empty')}</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
          <line x1={0} x2={W} y1={BASE + 0.5} y2={BASE + 0.5} stroke="var(--line)" />
          {days.map((d, k) => {
            const h = d.n ? Math.max(2, ((BASE - TOP) * d.n) / max) : 0;
            const x = k * slot + (slot - bar) / 2;
            const r = Math.min(4, h, bar / 2);
            const y = BASE - h;
            // Rounded top, square at the baseline.
            const path = `M${x},${BASE}V${y + r}Q${x},${y} ${x + r},${y}H${x + bar - r}Q${x + bar},${y} ${x + bar},${y + r}V${BASE}Z`;
            return (
              <g key={k}>
                <title>{`${label(d.date)}: ${formatInt(d.n, lng)}`}</title>
                <rect x={k * slot} y={0} width={slot} height={H} fill="transparent" />
                {h > 0 && (
                  <path d={path} fill={k === DAYS - 1 ? 'var(--accent)' : 'var(--chart-muted)'} />
                )}
              </g>
            );
          })}
          {max > 0 && (
            <text
              x={Math.min(W - 2, Math.max(2, peak * slot + slot / 2))}
              y={Math.max(9, BASE - ((BASE - TOP) * max) / max - 3)}
              textAnchor={peak < 2 ? 'start' : peak > DAYS - 3 ? 'end' : 'middle'}
              fontSize={9}
              fill="var(--muted)"
            >
              {formatInt(max, lng)}
            </text>
          )}
          <text x={0} y={H - 2} fontSize={9} fill="var(--muted)">
            {label(days[0].date)}
          </text>
          <text x={W} y={H - 2} fontSize={9} fill="var(--muted)" textAnchor="end">
            {t('stitch.daily.today')}
          </text>
        </svg>
      )}
      <table className="sr-only">
        <caption>{t('stitch.daily.title')}</caption>
        <tbody>
          {days.map((d, k) => (
            <tr key={k}>
              <th scope="row">{label(d.date)}</th>
              <td>{formatInt(d.n, lng)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
