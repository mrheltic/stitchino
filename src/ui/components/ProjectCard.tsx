import { Copy, Download, Hand, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PROJECT_EXTENSION } from '../../core/io/projectFile.ts';
import {
  deleteProject,
  duplicateProject,
  exportProjectFile,
  type ProjectSummary,
} from '../../storage/projects.ts';
import { downloadBytes, safeFileName } from '../download.ts';
import { formatInt } from '../format.ts';
import { useObjectUrl } from '../useObjectUrl.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { LinkButton } from './ui.tsx';

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage;
  const thumbUrl = useObjectUrl(project.thumbnail);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const iconButton = 'rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-ink';
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <Link to={`/project/${project.id}`} className="block aspect-[4/3] bg-surface-2">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="size-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className="flex size-full items-center justify-center text-sm text-muted">
            {t('home.noPreview')}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link to={`/project/${project.id}`} className="font-medium hover:underline">
          {project.title || t('wizard.create.untitled')}
        </Link>
        <p className="text-xs text-muted">
          {t('home.projectInfo', {
            size: `${project.width} × ${project.height}`,
            colors: project.colors,
            stitches: formatInt(project.stitches, lng),
          })}
        </p>
        <p className="text-xs text-muted">
          {t('home.updated', {
            date: new Date(project.updatedAt).toLocaleDateString(lng, { dateStyle: 'medium' }),
          })}
          {project.imported && ` · ${t('home.imported')}`}
        </p>
        <div className="mt-auto flex items-center gap-1 pt-2">
          <LinkButton
            to={`/project/${project.id}/stitch`}
            variant="secondary"
            className="px-3 py-1.5"
          >
            <Hand size={16} aria-hidden />
            {t('home.stitch')}
          </LinkButton>
          <span className="flex-1" />
          {!project.imported && (
            <>
              <button
                type="button"
                className={iconButton}
                title={t('home.duplicate')}
                aria-label={t('home.duplicate')}
                onClick={() =>
                  void duplicateProject(project.id, t('home.copyOf', { title: project.title }))
                }
              >
                <Copy size={18} aria-hidden />
              </button>
              <button
                type="button"
                className={iconButton}
                title={t('home.export')}
                aria-label={t('home.export')}
                onClick={async () =>
                  downloadBytes(
                    await exportProjectFile(project.id),
                    safeFileName(project.title) + PROJECT_EXTENSION,
                  )
                }
              >
                <Download size={18} aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            className={iconButton}
            title={t('common.delete')}
            aria-label={t('common.delete')}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={18} aria-hidden />
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('home.deleteTitle')}
        description={t('home.deleteText', { title: project.title })}
        confirmLabel={t('common.delete')}
        danger
        onConfirm={() => void deleteProject(project.id)}
      />
    </li>
  );
}
