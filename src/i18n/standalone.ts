import i18next from 'i18next';
import en from './en.json';
import it from './it.json';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A translation function for code that can't use the page's i18next instance (workers). */
export async function standaloneT(lng: string): Promise<Translate> {
  const instance = i18next.createInstance();
  await instance.init({
    resources: { it: { translation: it }, en: { translation: en } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
  return (key, options) => instance.t(key, options) as string;
}
