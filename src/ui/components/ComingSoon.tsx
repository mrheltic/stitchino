import { useTranslation } from 'react-i18next';
import { Card, Page, PageHeader } from './ui.tsx';

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={title} />
      <Card className="text-muted">{t('common.comingSoon')}</Card>
    </Page>
  );
}
