import { Download, PartyPopper, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SITE_LABEL } from '../../core/brand.ts';
import { stitchingStats, type ProgressTracker } from '../../core/progress/tracker.ts';
import { finishCard } from '../../render/finishCard.ts';
import { Dialog } from '../components/Dialog.tsx';
import { Button, LinkButton } from '../components/ui.tsx';
import { canShareFile, downloadBytes, safeFileName, shareFile } from '../download.ts';
import { formatInt } from '../format.ts';
import { SupportNote } from '../support/SupportNote.tsx';
import { useObjectUrl } from '../useObjectUrl.ts';
import { canvasToBlob } from '../wizard/image.ts';

/** A day key (YYYY-MM-DD) as a local date. */
function dayDate(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Shown when the last stitch is marked: the piece as it looks stitched, its numbers, and a
 * picture to share. Patterns imported from a designer's PDF get no picture, since one pixel per
 * stitch would give the chart away.
 */
export function FinishDialog({
  open,
  onOpenChange,
  tracker,
  imported,
  support,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tracker: ProgressTracker;
  imported: boolean;
  /** Whether to add the thank-you line with the donation link. */
  support: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const p = tracker.pattern;
  const title = p.meta.title || t('wizard.create.untitled');
  const [picture, setPicture] = useState<File>();
  const [supportOpen, setSupportOpen] = useState(true);
  const url = useObjectUrl(picture);

  const stitches = tracker.total.total;
  const colors = [...tracker.tallies.values()].filter((x) => x.total > 0).length;
  const stats = stitchingStats(tracker.data.daily);
  const numbers = [
    t('stitch.stitches', { count: stitches, n: formatInt(stitches, lng) }),
    t('stitch.finishScreen.colors', { count: colors }),
    ...(stats.days > 1 ? [t('stitch.finishScreen.days', { count: stats.days })] : []),
  ].join(' · ');

  useEffect(() => {
    if (!open || imported) return;
    let cancelled = false;
    const canvas = finishCard(p, {
      title,
      stats: numbers,
      credit: t('stitch.finishScreen.credit', { site: SITE_LABEL }),
    });
    void canvasToBlob(canvas, 'image/png')
      .then((blob) => {
        if (cancelled) return;
        const name = `${safeFileName(title)}-stitchino.png`;
        setPicture(new File([blob], name, { type: 'image/png' }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, imported, p, title, numbers, t]);

  const date = (day: string) => dayDate(day).toLocaleDateString(lng, { dateStyle: 'long' });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('stitch.finished')}
      description={t('stitch.finishScreen.text', { title })}
      footer={
        <>
          <LinkButton to="/">{t('stitch.finishScreen.projects')}</LinkButton>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {imported ? (
          <p className="flex justify-center py-2 text-accent">
            <PartyPopper size={56} aria-hidden />
          </p>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-lg bg-surface-2">
            {url && (
              <img
                src={url}
                alt={t('stitch.finishScreen.pictureAlt', { title })}
                className="max-h-[34vh] w-auto rounded-lg"
                data-testid="finish-picture"
              />
            )}
          </div>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t('stitch.finishScreen.stitched')}</dt>
          <dd className="tabular-nums">{numbers}</dd>
          {stats.first && (
            <>
              <dt className="text-muted">{t('stitch.finishScreen.started')}</dt>
              <dd>{date(stats.first)}</dd>
            </>
          )}
          {stats.best && stats.days > 1 && (
            <>
              <dt className="text-muted">{t('stitch.finishScreen.best')}</dt>
              <dd className="tabular-nums">
                {t('stitch.finishScreen.bestValue', {
                  n: formatInt(stats.best.stitches, lng),
                  date: date(stats.best.day),
                })}
              </dd>
            </>
          )}
        </dl>
        {picture && (
          <div className="flex flex-wrap gap-2">
            {canShareFile(picture) && (
              <Button variant="primary" onClick={() => void shareFile(picture, title)}>
                <Share2 size={16} aria-hidden />
                {t('stitch.finishScreen.share')}
              </Button>
            )}
            <Button onClick={() => downloadBytes(picture, picture.name)}>
              <Download size={16} aria-hidden />
              {t('stitch.finishScreen.download')}
            </Button>
          </div>
        )}
        {support && supportOpen && <SupportNote onClose={() => setSupportOpen(false)} />}
      </div>
    </Dialog>
  );
}
