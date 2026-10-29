import { useLiveQuery } from 'dexie-react-hooks';
import { FileUp, FolderInput, ImagePlus, Square } from 'lucide-react';
import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PROJECT_EXTENSION } from '../../core/io/projectFile.ts';
import { importProjectFile, listProjects } from '../../storage/projects.ts';
import { ProjectCard } from '../components/ProjectCard.tsx';
import { Card, LinkButton, Page } from '../components/ui.tsx';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useLiveQuery(() => listProjects(), []);
  const [error, setError] = useState<string | null>(null);

  const openFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const id = await importProjectFile(new Uint8Array(await file.arrayBuffer()));
      navigate(`/project/${id}`);
    } catch {
      setError(t('home.openError'));
    }
  };

  return (
    <Page wide>
      <section className="mb-10 rounded-2xl border border-line bg-surface px-6 py-10 text-center sm:px-10">
        <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {t('home.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t('home.subtitle')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/new" variant="primary" className="px-5 py-2.5 text-base">
            <ImagePlus size={20} aria-hidden />
            {t('home.fromPhoto')}
          </LinkButton>
          <LinkButton to="/new?blank=1">
            <Square size={18} aria-hidden />
            {t('home.blank')}
          </LinkButton>
          <LinkButton to="/import-pdf">
            <FileUp size={18} aria-hidden />
            {t('home.importPdf')}
          </LinkButton>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-2 has-focus-visible:outline-2">
            <FolderInput size={18} aria-hidden />
            {t('home.openFile')}
            <input
              type="file"
              accept={PROJECT_EXTENSION}
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
        <Card className="text-center text-muted">{t('home.noProjects')}</Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </ul>
      )}
    </Page>
  );
}
