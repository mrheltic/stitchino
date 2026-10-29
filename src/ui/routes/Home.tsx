import { useLiveQuery } from 'dexie-react-hooks';
import { FileUp, FolderInput, ImagePlus, Sparkles, Square } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { importOxs } from '../../core/io/oxs.ts';
import { PROJECT_EXTENSIONS } from '../../core/io/projectFile.ts';
import { db } from '../../storage/db.ts';
import { createProject, importProjectFile, listProjects } from '../../storage/projects.ts';
import { ProjectCard } from '../components/ProjectCard.tsx';
import { Card, LinkButton, Page } from '../components/ui.tsx';
import { patternThumbnail } from '../patternPaint.ts';

const moreLink =
  'inline-flex items-center gap-1.5 font-medium text-ink underline-offset-2 hover:underline';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useLiveQuery(() => listProjects(), []);
  const progress = useLiveQuery(async () => {
    const rows = await db.progress.toArray();
    return new Map(rows.map((r) => [r.projectId, r.total ? r.done / r.total : 0]));
  }, []);
  const [error, setError] = useState<string | null>(null);

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Project files are zips ("PK"); anything else is tried as OXS (XML).
      if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        navigate(`/project/${await importProjectFile(bytes)}`);
        return;
      }
      const { pattern, report } = importOxs(new TextDecoder().decode(bytes));
      pattern.meta.title ||= file.name.replace(/\.[^.]+$/, '');
      const thumbnail = await patternThumbnail(
        pattern.width,
        pattern.height,
        pattern.cells,
        pattern.palette,
        pattern.fabric.color,
      );
      const id = await createProject(pattern, { thumbnail });
      navigate(`/project/${id}`, { state: { oxsReport: report } });
    } catch {
      setError(t('home.openError'));
    }
  };

  return (
    <Page wide>
      <section className="mb-10 rounded-2xl border border-line bg-surface px-6 py-10 text-center sm:px-10">
        <p className="mb-3 text-sm font-medium text-accent">
          {t('app.name')} · {t('app.tagline')}
        </p>
        <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('home.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t('home.subtitle')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/new" variant="primary" className="px-5 py-2.5 text-base">
            <ImagePlus size={20} aria-hidden />
            {t('home.fromPhoto')}
          </LinkButton>
          <LinkButton to="/new?example=1" className="px-5 py-2.5 text-base">
            <Sparkles size={18} aria-hidden />
            {t('home.example')}
          </LinkButton>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted">
          <span>{t('home.moreWays')}</span>
          <Link to="/new?blank=1" className={moreLink}>
            <Square size={16} aria-hidden />
            {t('home.blank')}
          </Link>
          <Link to="/import-pdf" className={moreLink}>
            <FileUp size={16} aria-hidden />
            {t('home.importPdf')}
          </Link>
          <label className={`${moreLink} cursor-pointer has-focus-visible:outline-2`}>
            <FolderInput size={16} aria-hidden />
            {t('home.openFile')}
            <input
              type="file"
              accept={[...PROJECT_EXTENSIONS, '.oxs', '.xml'].join(',')}
              className="sr-only"
              onChange={(e) => void openFile(e)}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
      </section>
      <h2 className="mb-3 text-lg font-semibold">{t('home.projects')}</h2>
      {projects === undefined ? null : projects.length === 0 ? (
        <Card>
          <p className="mb-4 text-center text-muted">{t('home.noProjects')}</p>
          <ol className="grid gap-4 sm:grid-cols-3">
            {(['photo', 'edit', 'stitch'] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <span className="text-sm">
                  <span className="block font-medium">{t(`home.how.${k}`)}</span>
                  <span className="text-muted">{t(`home.how.${k}Text`)}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-sm">
            <Link to="/guide" className="text-accent underline underline-offset-2">
              {t('home.how.guide')}
            </Link>
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} progress={progress?.get(p.id)} />
          ))}
        </ul>
      )}
    </Page>
  );
}
