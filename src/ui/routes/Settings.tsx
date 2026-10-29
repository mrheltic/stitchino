import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../i18n/index.ts';
import { Card, Page, PageHeader } from '../components/ui.tsx';
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

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, units, setTheme, setUnits } = useSettings();
  return (
    <Page>
      <PageHeader title={t('settings.title')} />
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
    </Page>
  );
}
