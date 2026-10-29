import { Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DONATION_LINKS, LINKS } from '../../core/brand.ts';
import { neverNudge } from './nudge.ts';

/** Thank-you line shown after an export when it is due (see nudge.ts). */
export function SupportNote({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const link = DONATION_LINKS[0];
  if (!link) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
      <Heart size={16} className="shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">{t('support.nudge')}</span>
      <a
        href={LINKS[link]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-accent underline-offset-2 hover:underline"
      >
        {t(`support.links.${link}`)}
      </a>
      <button
        type="button"
        className="text-xs text-muted underline-offset-2 hover:underline"
        onClick={() => {
          neverNudge();
          onClose();
        }}
      >
        {t('support.never')}
      </button>
    </div>
  );
}
