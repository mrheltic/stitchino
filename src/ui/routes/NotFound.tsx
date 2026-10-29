import { useTranslation } from 'react-i18next';
import { LinkButton, Page, PageHeader } from '../components/ui.tsx';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <Page>
      <PageHeader title={t('notFound.title')} />
      <LinkButton to="/" variant="primary">
        {t('notFound.back')}
      </LinkButton>
    </Page>
  );
}
