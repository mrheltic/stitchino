import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui.tsx';

export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-lg"
    >
      <p className="flex-1 text-sm">
        {needRefresh ? t('pwa.updateAvailable') : t('pwa.offlineReady')}
      </p>
      {needRefresh && (
        <Button variant="primary" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.update')}
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        {t('pwa.dismiss')}
      </Button>
    </div>
  );
}
