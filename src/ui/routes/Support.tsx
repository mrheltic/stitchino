import { Coffee, Heart, MessageCircle, Repeat, Share2, Sprout } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DONATION_LINKS, LINKS } from '../../core/brand.ts';
import { Card, Page, PageHeader } from '../components/ui.tsx';

const DONATION_ICONS = { kofi: Coffee, githubSponsors: Heart, liberapay: Repeat } as const;

function Way({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-accent">{icon}</span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-sm text-muted">{children}</span>
      </span>
    </li>
  );
}

export default function Support() {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t('support.title')} />
      <p className="-mt-3 mb-6 max-w-2xl text-muted">{t('support.intro')}</p>
      {DONATION_LINKS.length > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {DONATION_LINKS.map((k) => {
            const Icon = DONATION_ICONS[k];
            return (
              <a
                key={k}
                href={LINKS[k]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 hover:bg-surface-2"
              >
                <Icon size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="block font-medium">{t(`support.links.${k}`)}</span>
                  <span className="text-sm text-muted">{t(`support.linkHints.${k}`)}</span>
                </span>
              </a>
            );
          })}
        </div>
      )}
      <Card>
        <h2 className="mb-4 font-medium">{t('support.otherWays')}</h2>
        <ul className="space-y-4">
          <Way icon={<Share2 size={20} aria-hidden />} title={t('support.share')}>
            {t('support.shareText')}
          </Way>
          <Way icon={<MessageCircle size={20} aria-hidden />} title={t('support.feedback')}>
            {t('support.feedbackText')}{' '}
            {LINKS.issues && (
              <a
                href={LINKS.issues}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2"
              >
                {t('support.feedbackLink')}
              </a>
            )}
          </Way>
          <Way icon={<Sprout size={20} aria-hidden />} title={t('support.test')}>
            {t('support.testText')}
          </Way>
        </ul>
      </Card>
    </Page>
  );
}
