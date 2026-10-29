import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../components/ComingSoon.tsx';

export default function Guide() {
  const { t } = useTranslation();
  return <ComingSoon title={t('pages.guide')} />;
}
