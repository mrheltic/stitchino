import { useTranslation } from 'react-i18next';
import { Card, Page, PageHeader } from '../components/ui.tsx';

/** Paragraphs come from the translations as arrays, so the page stays plain text. */
function Paragraphs({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 leading-relaxed">
      {items.map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
}

export default function Privacy() {
  const { t } = useTranslation();
  const list = (key: string) => t(key, { returnObjects: true }) as unknown as string[];
  return (
    <Page>
      <PageHeader title={t('privacy.title')} />
      <div className="space-y-6">
        <Card className="space-y-3">
          <h2 className="font-medium">{t('privacy.dataTitle')}</h2>
          <Paragraphs items={list('privacy.data')} />
          <p className="text-sm">
            <a
              href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {t('privacy.githubLink')}
            </a>
          </p>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-medium">{t('privacy.termsTitle')}</h2>
          <Paragraphs items={list('privacy.terms')} />
        </Card>
      </div>
    </Page>
  );
}
