import { useTranslation } from 'react-i18next';
import { Page, PageHeader } from '../components/ui.tsx';
import { guideContent } from '../guide/content.tsx';

export default function Guide() {
  const { t, i18n } = useTranslation();
  const content = guideContent(i18n.resolvedLanguage);
  return (
    <Page>
      <PageHeader title={t('pages.guide')} />
      <p className="-mt-3 mb-6 max-w-2xl text-muted">{content.intro}</p>
      <nav aria-label={t('guide.contents')} className="mb-8">
        <ul className="flex flex-wrap gap-2">
          {content.sections.map((s) => (
            <li key={s.id}>
              <a
                href={`#/guide`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-block rounded-full border border-line px-3 py-1 text-sm hover:bg-surface-2"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-10">
        {content.sections.map((s) => (
          <section
            key={s.id}
            id={`guide-${s.id}`}
            className="scroll-mt-4 space-y-3 leading-relaxed"
          >
            <h2 className="text-xl font-semibold tracking-tight">{s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>
    </Page>
  );
}
