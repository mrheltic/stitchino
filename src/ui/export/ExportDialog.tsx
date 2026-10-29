import { Check, Download, Loader2, Share2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { exportOxs } from '../../core/io/oxs.ts';
import { PROJECT_EXTENSION } from '../../core/io/projectFile.ts';
import type { Pattern } from '../../core/model/pattern.ts';
import { chartGrid, type ChartStyle, type Paper } from '../../core/pdf/export/chartPdf.ts';
import type { ViewMode } from '../../render/chartRenderer.ts';
import { chartPng } from '../../render/exportPng.ts';
import { stitchedImage } from '../../render/mockups.ts';
import { exportProjectFile } from '../../storage/projects.ts';
import { withPdfWorker } from '../../workers/pdfClient.ts';
import { Choice, Field, Toggle } from '../components/controls.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { Button } from '../components/ui.tsx';
import { canShareFile, downloadBytes, safeFileName, shareFile } from '../download.ts';
import { formatDecimal } from '../format.ts';
import { safeStorage } from '../state/settings.ts';
import { noteExport, takeNudge } from '../support/nudge.ts';
import { SupportNote } from '../support/SupportNote.tsx';
import { canvasToBlob } from '../wizard/image.ts';
import { loadPdfFonts, symbolFontReady } from './fonts.ts';

type Format = 'pdf' | 'png' | 'oxs' | 'project';
type Preset = 'print' | 'patternKeeper';

interface ExportPrefs {
  format: Format;
  preset: Preset;
  /** null: A4, or Letter for English. */
  paper: Paper | null;
  style: ChartStyle;
  columns: number;
  overlap: boolean;
  cover: boolean;
  pageMap: boolean;
  pngMode: ViewMode;
}

const useExportPrefs = create<ExportPrefs & { set: (p: Partial<ExportPrefs>) => void }>()(
  persist(
    (set) => ({
      format: 'pdf',
      preset: 'print',
      paper: null,
      style: 'color',
      columns: 60,
      overlap: true,
      cover: true,
      pageMap: true,
      pngMode: 'colorSymbols',
      set: (p) => set(p),
    }),
    {
      name: 'puntocroce.export',
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ set: _set, ...prefs }) => prefs,
    },
  ),
);

/** The stitched preview as a JPEG for the PDF cover. */
async function coverJpeg(pattern: Pattern): Promise<Uint8Array> {
  const { canvas } = stitchedImage(pattern, { fabric: pattern.fabric }, 1400);
  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.85);
  return new Uint8Array(await blob.arrayBuffer());
}

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  pattern,
  beforeExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  pattern: Pattern;
  /** Saves pending edits, so the project file has them. */
  beforeExport?: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const lng = i18n.resolvedLanguage ?? 'it';
  const prefs = useExportPrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [nudge, setNudge] = useState(false);

  const paper: Paper = prefs.paper ?? (lng === 'en' ? 'letter' : 'a4');
  const pk = prefs.preset === 'patternKeeper';
  const columns = pk ? Math.min(prefs.columns, 60) : prefs.columns;
  const grid = chartGrid(pattern, paper, columns);
  const base = safeFileName(pattern.meta.title);

  const update = (p: Partial<ExportPrefs>) => {
    prefs.set(p);
    setFile(null);
    setError(false);
  };

  const build = async (): Promise<File> => {
    switch (prefs.format) {
      case 'pdf': {
        const [fonts, coverImage] = await Promise.all([
          loadPdfFonts(),
          prefs.cover && !pk ? coverJpeg(pattern) : undefined,
        ]);
        const bytes = await withPdfWorker((api) =>
          api.chart(pattern, {
            paper,
            style: prefs.style,
            columns,
            overlap: prefs.overlap ? 2 : 0,
            cover: prefs.cover,
            pageMap: prefs.pageMap,
            patternKeeper: pk,
            fonts,
            coverImage,
            language: lng,
          }),
        );
        return new File([bytes as BlobPart], `${base}${pk ? '-pattern-keeper' : ''}.pdf`, {
          type: 'application/pdf',
        });
      }
      case 'png': {
        const blob = await chartPng(pattern, prefs.pngMode, await symbolFontReady());
        return new File([blob], `${base}.png`, { type: 'image/png' });
      }
      case 'oxs':
        return new File([exportOxs(pattern)], `${base}.oxs`, { type: 'application/xml' });
      case 'project': {
        await beforeExport?.();
        const bytes = await exportProjectFile(projectId);
        return new File([bytes as BlobPart], base + PROJECT_EXTENSION, {
          type: 'application/octet-stream',
        });
      }
    }
  };

  const run = async () => {
    setBusy(true);
    setError(false);
    try {
      const f = await build();
      setFile(f);
      downloadBytes(f, f.name);
      noteExport();
      if (!nudge) setNudge(takeNudge());
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const formats: { value: Format; label: string }[] = [
    { value: 'pdf', label: t('export.formats.pdf') },
    { value: 'png', label: t('export.formats.png') },
    { value: 'oxs', label: t('export.formats.oxs') },
    { value: 'project', label: t('export.formats.project') },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('export.title')}
      wide
      footer={
        <>
          {file && canShareFile(file) && (
            <Button onClick={() => void shareFile(file, pattern.meta.title)}>
              <Share2 size={16} aria-hidden />
              {t('export.share')}
            </Button>
          )}
          <Button variant="primary" onClick={() => void run()} disabled={busy}>
            {busy ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <Download size={16} aria-hidden />
            )}
            {busy ? t('export.working') : file ? t('export.again') : t('export.download')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label={t('export.format')}>
          <Choice<Format>
            name="export-format"
            value={prefs.format}
            onChange={(format) => update({ format })}
            options={formats}
          />
        </Field>

        {prefs.format === 'pdf' && (
          <>
            <Field
              label={t('export.preset')}
              hint={pk ? t('export.pkHint') : t('export.printHint')}
            >
              <Choice<Preset>
                name="export-preset"
                value={prefs.preset}
                onChange={(preset) => update({ preset })}
                options={[
                  { value: 'print', label: t('export.presets.print') },
                  { value: 'patternKeeper', label: t('export.presets.patternKeeper') },
                ]}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t('export.paper')}>
                <Choice<Paper>
                  name="export-paper"
                  value={paper}
                  onChange={(p) => update({ paper: p })}
                  options={[
                    { value: 'a4', label: 'A4' },
                    { value: 'letter', label: 'Letter' },
                  ]}
                />
              </Field>
              <Field
                label={t('export.density')}
                hint={t('export.pages', { count: grid.cols * grid.rows })}
              >
                <Choice<number>
                  name="export-density"
                  value={columns}
                  onChange={(c) => update({ columns: c })}
                  options={[40, 60, ...(pk ? [] : [80])].map((c) => ({
                    value: c,
                    label: t(`export.densities.${c}`),
                  }))}
                />
              </Field>
            </div>
            {!pk && (
              <>
                <Field label={t('export.style')}>
                  <Choice<ChartStyle>
                    name="export-style"
                    value={prefs.style}
                    onChange={(style) => update({ style })}
                    options={(['color', 'bw', 'blocks'] as const).map((s) => ({
                      value: s,
                      label: t(`export.styles.${s}`),
                    }))}
                  />
                </Field>
                <div className="space-y-2">
                  <Toggle checked={prefs.cover} onChange={(cover) => update({ cover })}>
                    {t('export.cover')}
                  </Toggle>
                  <Toggle checked={prefs.pageMap} onChange={(pageMap) => update({ pageMap })}>
                    {t('export.pageMap')}
                  </Toggle>
                  <Toggle checked={prefs.overlap} onChange={(overlap) => update({ overlap })}>
                    {t('export.overlap')}
                  </Toggle>
                </div>
              </>
            )}
          </>
        )}

        {prefs.format === 'png' && (
          <Field label={t('editor.view.label')} hint={t('export.pngHint')}>
            <Choice<ViewMode>
              name="export-png-mode"
              value={prefs.pngMode}
              onChange={(pngMode) => update({ pngMode })}
              options={(['colorSymbols', 'symbols', 'colors', 'realistic'] as const).map((m) => ({
                value: m,
                label: t(`editor.view.${m}`),
              }))}
            />
          </Field>
        )}
        {prefs.format === 'oxs' && <p className="text-sm text-muted">{t('export.oxsHint')}</p>}
        {prefs.format === 'project' && (
          <p className="text-sm text-muted">{t('export.projectHint')}</p>
        )}

        {file && !busy && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Check size={16} className="text-green-700 dark:text-green-400" aria-hidden />
            {t('export.done', {
              name: file.name,
              size: formatDecimal(file.size / 1024 / 1024, file.size < 1024 * 1024 ? 2 : 1, lng),
            })}
          </p>
        )}
        {file && !busy && nudge && <SupportNote onClose={() => setNudge(false)} />}
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {t('export.error')}
          </p>
        )}
      </div>
    </Dialog>
  );
}
