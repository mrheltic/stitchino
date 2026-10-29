import { useLiveQuery } from 'dexie-react-hooks';
import { Hand } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { countStitches } from '../../core/model/pattern.ts';
import { estimatePattern } from '../../core/size/threadEstimate.ts';
import { finishedSize } from '../../core/size/fabric.ts';
import { getThread } from '../../core/threads/catalog.ts';
import { loadProject } from '../../storage/projects.ts';
import { PatternCanvas } from '../components/PatternCanvas.tsx';
import { entryRgb } from '../patternPaint.ts';
import { Card, LinkButton, Page, PageHeader } from '../components/ui.tsx';
import { formatInt, formatSize } from '../format.ts';
import { useSettings } from '../state/settings.ts';

export default function Editor() {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const { id = '' } = useParams();
  const units = useSettings((s) => s.units);
  const data = useLiveQuery(() => loadProject(id).then((d) => d ?? null), [id]);

  if (data === undefined) return null;
  if (data === null) {
    return (
      <Page>
        <PageHeader title={t('editor.notFound')} />
        <LinkButton to="/">{t('notFound.back')}</LinkButton>
      </Page>
    );
  }
  const { pattern } = data;
  const counts = countStitches(pattern);
  const estimates = estimatePattern(pattern, counts);
  const size = finishedSize(pattern.width, pattern.height, pattern.fabric);

  return (
    <Page wide>
      <PageHeader title={pattern.meta.title || t('wizard.create.untitled')}>
        <LinkButton to={`/project/${id}/stitch`} variant="primary">
          <Hand size={18} aria-hidden />
          {t('home.stitch')}
        </LinkButton>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <Card>
          <PatternCanvas
            width={pattern.width}
            height={pattern.height}
            cells={pattern.cells}
            palette={pattern.palette}
            fabricColor={pattern.fabric.color}
            label={t('wizard.preview.pattern')}
            fit
            className="mx-auto block"
          />
          <p className="mt-3 text-sm text-muted">
            {pattern.width} × {pattern.height} ·{' '}
            {formatSize(size.widthMm, size.heightMm, units, lng)} ·{' '}
            {t(`fabric.kinds.${pattern.fabric.kind}`)} {pattern.fabric.count} ct
          </p>
        </Card>
        <Card className="p-0">
          <h2 className="border-b border-line px-4 py-3 font-medium">{t('editor.legend')}</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">{t('editor.symbol')}</th>
                <th className="py-2 font-normal">{t('editor.thread')}</th>
                <th className="py-2 text-right font-normal">{t('editor.stitches')}</th>
                <th className="px-4 py-2 text-right font-normal">{t('editor.skeins')}</th>
              </tr>
            </thead>
            <tbody>
              {pattern.palette.map((p) => {
                const [r, g, b] = entryRgb(p);
                const thread = getThread(p.threads[0]);
                return (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-1.5">
                      <span
                        className="inline-flex size-7 items-center justify-center rounded font-symbols text-base"
                        style={{
                          background: `rgb(${r},${g},${b})`,
                          color: r * 0.3 + g * 0.59 + b * 0.11 > 140 ? '#000' : '#fff',
                        }}
                      >
                        {p.symbol}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <div className="font-medium">
                        {p.threads.map((x) => `${x.brand} ${x.code}`).join(' + ')}
                      </div>
                      <div className="text-xs text-muted">{thread?.name}</div>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatInt(counts.get(p.id)?.full ?? 0, lng)}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {estimates.get(p.id)?.skeins ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </Page>
  );
}
