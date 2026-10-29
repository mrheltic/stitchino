import { Download, Loader2, Upload } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { APP_NAME, LINKS } from '../../core/brand.ts';
import { LANGUAGES } from '../../i18n/index.ts';
import { BACKUP_EXTENSION, exportBackup, restoreBackup } from '../../storage/backup.ts';
import { requestPersistentStorage } from '../../storage/db.ts';
import { Button, Card, Page, PageHeader } from '../components/ui.tsx';
import { downloadBytes } from '../download.ts';
import { patternThumbnail } from '../patternPaint.ts';
import { useSettings, type ThemePref, type Units } from '../state/settings.ts';

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
            o.value === value ? 'border-accent bg-surface-2 font-medium' : 'border-line'
          }`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function Backup() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    void navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => setPersisted(null));
  }, []);

  const download = async () => {
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      downloadBytes(await exportBackup(), `${APP_NAME.toLowerCase()}-${date}${BACKUP_EXTENSION}`);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await restoreBackup(new Uint8Array(await file.arrayBuffer()), undefined, (p) =>
        patternThumbnail(p.width, p.height, p.cells, p.palette, p.fabric.color),
      );
      setMessage(
        [
          t('settings.backup.restored', { count: r.added }),
          r.skipped ? t('settings.backup.skipped', { count: r.skipped }) : '',
          r.threads ? t('settings.backup.threads', { count: r.threads }) : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
      void requestPersistentStorage().then(setPersisted);
    } catch {
      setMessage(t('settings.backup.invalid'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3">
      <h2 className="font-medium">{t('settings.backup.title')}</h2>
      <p className="text-sm text-muted">{t('settings.backup.text')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void download()} disabled={busy}>
          {busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Download size={16} aria-hidden />
          )}
          {t('settings.backup.download')}
        </Button>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 has-focus-visible:outline-2">
          <Upload size={16} aria-hidden />
          {t('settings.backup.restore')}
          <input
            type="file"
            accept={`${BACKUP_EXTENSION},.zip`}
            className="sr-only"
            onChange={(e) => void restore(e)}
            disabled={busy}
          />
        </label>
      </div>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <p className="text-xs text-muted">
        {persisted ? t('settings.backup.persisted') : t('settings.backup.notPersisted')}{' '}
        {t('settings.backup.ios')}
      </p>
    </Card>
  );
}

function About() {
  const { t } = useTranslation();
  const link = 'text-accent underline underline-offset-2';
  return (
    <Card className="space-y-2 text-sm">
      <h2 className="font-medium">{t('settings.about.title')}</h2>
      <p>
        {APP_NAME} {__APP_VERSION__} · {t('settings.about.license')}
      </p>
      <p className="text-muted">{t('settings.about.credits')}</p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.source && (
          <a href={LINKS.source} target="_blank" rel="noopener noreferrer" className={link}>
            {t('settings.about.source')}
          </a>
        )}
        {LINKS.issues && (
          <a href={LINKS.issues} target="_blank" rel="noopener noreferrer" className={link}>
            {t('settings.about.issues')}
          </a>
        )}
        <Link to="/privacy" className={link}>
          {t('footer.privacyLink')}
        </Link>
        <Link to="/support" className={link}>
          {t('footer.support')}
        </Link>
      </p>
    </Card>
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, units, setTheme, setUnits } = useSettings();
  return (
    <Page>
      <PageHeader title={t('settings.title')} />
      <div className="space-y-6">
        <Card className="space-y-6">
          <section>
            <h2 className="mb-2 font-medium">{t('settings.language')}</h2>
            <Choice
              name="language"
              value={i18n.resolvedLanguage ?? 'it'}
              options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
              onChange={(lng) => void i18n.changeLanguage(lng)}
            />
          </section>
          <section>
            <h2 className="mb-2 font-medium">{t('settings.theme')}</h2>
            <Choice<ThemePref>
              name="theme"
              value={theme}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
              onChange={setTheme}
            />
          </section>
          <section>
            <h2 className="mb-2 font-medium">{t('settings.units')}</h2>
            <Choice<Units>
              name="units"
              value={units}
              options={[
                { value: 'metric', label: t('settings.metric') },
                { value: 'imperial', label: t('settings.imperial') },
              ]}
              onChange={setUnits}
            />
          </section>
        </Card>
        <Backup />
        <About />
      </div>
    </Page>
  );
}
