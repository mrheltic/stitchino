import { FileUp, ImagePlus, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, LinkButton, Page } from '../components/ui.tsx';

export function Home() {
  const { t } = useTranslation();
  return (
    <Page wide>
      <section className="mb-10 rounded-2xl border border-line bg-surface px-6 py-10 text-center sm:px-10">
        <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('home.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t('home.subtitle')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/new" variant="primary" className="px-5 py-2.5 text-base">
            <ImagePlus size={20} aria-hidden />
            {t('home.fromPhoto')}
          </LinkButton>
          <LinkButton to="/new?blank=1">
            <Square size={18} aria-hidden />
            {t('home.blank')}
          </LinkButton>
          <LinkButton to="/import-pdf">
            <FileUp size={18} aria-hidden />
            {t('home.importPdf')}
          </LinkButton>
        </div>
      </section>
      <h2 className="mb-3 text-lg font-semibold">{t('home.projects')}</h2>
      <Card className="text-center text-muted">{t('home.noProjects')}</Card>
    </Page>
  );
}
