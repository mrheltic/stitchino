import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../components/ComingSoon.tsx';

export default function Stitch() {
  const { t } = useTranslation();
  return <ComingSoon title={t('pages.stitch')} />;
}
