import { Download, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui.tsx';
import { formatInt } from '../format.ts';
import {
  backupDue,
  snoozeBackup,
  unsavedStitches,
  useBackupState,
  type ProgressCount,
} from './reminder.ts';
import { downloadBackup } from './saveBackup.ts';

/** On the home page: asks for a backup when a lot was stitched since the last one. */
export function BackupReminder({ rows }: { rows: readonly ProgressCount[] | undefined }) {
  const { t, i18n } = useTranslation();
  const state = useBackupState();
  const [now] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const box =
    'mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm';
  if (saved) {
    return (
      <div role="status" className={box}>
        <ShieldCheck size={20} className="shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1">{t('backupReminder.saved')}</p>
        <Button variant="ghost" onClick={() => setSaved(false)}>
          {t('common.close')}
        </Button>
      </div>
    );
  }
  if (!rows || !backupDue(state, rows, now)) return null;

  const n = formatInt(unsavedStitches(state.saved, rows), i18n.resolvedLanguage);
  const save = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await downloadBackup();
      setSaved(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('settings.backup.title')} className={box}>
      <ShieldCheck size={20} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-medium">
          {t(state.at ? 'backupReminder.since' : 'backupReminder.never', { n })}
        </p>
        <p className="text-muted">{t('backupReminder.why')}</p>
        {failed && (
          <p role="alert" className="mt-1 text-red-700 dark:text-red-300">
            {t('backupReminder.failed')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          {busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Download size={16} aria-hidden />
          )}
          {t('settings.backup.download')}
        </Button>
        <Button variant="ghost" onClick={() => snoozeBackup()} disabled={busy}>
          {t('backupReminder.later')}
        </Button>
      </div>
    </section>
  );
}
