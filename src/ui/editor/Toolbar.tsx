import { FlipHorizontal2, FlipVertical2, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Symmetry } from '../../core/model/ops.ts';
import { Choice, Toggle } from '../components/controls.tsx';
import { Button } from '../components/ui.tsx';
import { useEditor } from './store.ts';
import { TOOLS } from './tools.ts';

export function Toolbar({ vertical }: { vertical: boolean }) {
  const { t } = useTranslation();
  const tool = useEditor((s) => s.tool);
  const set = useEditor((s) => s.set);
  return (
    <div
      role="toolbar"
      aria-label={t('editor.tools.label')}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      className={`flex gap-1 ${vertical ? 'flex-col' : 'flex-row'}`}
    >
      {TOOLS.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          type="button"
          aria-pressed={tool === id}
          aria-label={t(`editor.tools.${id}`)}
          title={`${t(`editor.tools.${id}`)} (${key})`}
          onClick={() => set({ tool: id, floating: useEditor.getState().floating })}
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
            tool === id ? 'bg-accent text-accent-ink' : 'text-ink hover:bg-surface-2'
          }`}
        >
          <Icon size={20} />
        </button>
      ))}
    </div>
  );
}

/** Options of the current tool, and actions on the selection or pasted content. */
export function ToolOptions({
  onSelectionAction,
}: {
  onSelectionAction: (
    action:
      | 'copy'
      | 'cut'
      | 'delete'
      | 'crop'
      | 'flipH'
      | 'flipV'
      | 'rotate'
      | 'paste'
      | 'apply'
      | 'cancel',
  ) => void;
}) {
  const { t } = useTranslation();
  const s = useEditor();
  const symmetryOptions: { value: Symmetry; label: string }[] = (
    ['none', 'horizontal', 'vertical', 'both'] as const
  ).map((v) => ({
    value: v,
    label: t(`editor.options.symmetry.${v}`),
  }));
  const small = 'px-2.5 py-1 text-xs';

  if (s.floating) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{t('editor.options.floating')}</span>
        <Button
          className={small}
          onClick={() => onSelectionAction('flipH')}
          title={t('editor.options.flipH')}
        >
          <FlipHorizontal2 size={16} aria-hidden />
        </Button>
        <Button
          className={small}
          onClick={() => onSelectionAction('flipV')}
          title={t('editor.options.flipV')}
        >
          <FlipVertical2 size={16} aria-hidden />
        </Button>
        <Button
          className={small}
          onClick={() => onSelectionAction('rotate')}
          title={t('editor.options.rotate')}
        >
          <RotateCw size={16} aria-hidden />
        </Button>
        <Button variant="primary" className={small} onClick={() => onSelectionAction('apply')}>
          {t('editor.options.apply')}
        </Button>
        <Button variant="ghost" className={small} onClick={() => onSelectionAction('cancel')}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="font-medium">{t(`editor.tools.${s.tool}`)}</span>
      {s.tool === 'half' && (
        <Choice
          name="half-direction"
          size="sm"
          value={s.halfDirection}
          onChange={(halfDirection) => s.set({ halfDirection })}
          options={[
            { value: 'slash', label: '╱' },
            { value: 'backslash', label: '╲' },
          ]}
        />
      )}
      {(s.tool === 'rect' || s.tool === 'ellipse') && (
        <Toggle checked={s.shapeFilled} onChange={(shapeFilled) => s.set({ shapeFilled })}>
          {t('editor.options.filled')}
        </Toggle>
      )}
      {s.tool === 'eraser' && (
        <Choice
          name="eraser-target"
          size="sm"
          value={s.eraserTarget}
          onChange={(eraserTarget) => s.set({ eraserTarget })}
          options={[
            { value: 'stitches', label: t('editor.options.eraseStitches') },
            { value: 'backstitch', label: t('editor.options.eraseLines') },
          ]}
        />
      )}
      {(s.tool === 'backstitch' || s.tool === 'knot') && (
        <Toggle checked={s.halfSnap} onChange={(halfSnap) => s.set({ halfSnap })}>
          {t('editor.options.halfSnap')}
        </Toggle>
      )}
      {['pencil', 'half', 'quarter', 'threeQuarter', 'eraser', 'line', 'rect', 'ellipse'].includes(
        s.tool,
      ) && (
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('editor.options.symmetry.label')}</span>
          <select
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs"
            value={s.symmetry}
            onChange={(e) => s.set({ symmetry: e.target.value as Symmetry })}
          >
            {symmetryOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {s.tool === 'select' && (
        <Choice
          name="select-mode"
          size="sm"
          value={s.selectMode}
          onChange={(selectMode) => s.set({ selectMode })}
          options={[
            { value: 'rect', label: t('editor.options.selectRect') },
            { value: 'lasso', label: t('editor.options.selectLasso') },
            { value: 'wand', label: t('editor.options.selectWand') },
          ]}
        />
      )}
      {s.tool === 'select' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {s.selection ? (
            <>
              <Button className={small} onClick={() => onSelectionAction('copy')}>
                {t('editor.options.copy')}
              </Button>
              <Button className={small} onClick={() => onSelectionAction('cut')}>
                {t('editor.options.cut')}
              </Button>
              <Button className={small} onClick={() => onSelectionAction('delete')}>
                {t('common.delete')}
              </Button>
              <Button className={small} onClick={() => onSelectionAction('crop')}>
                {t('editor.options.crop')}
              </Button>
              <Button
                className={small}
                onClick={() => onSelectionAction('flipH')}
                title={t('editor.options.flipH')}
              >
                <FlipHorizontal2 size={16} aria-hidden />
              </Button>
              <Button
                className={small}
                onClick={() => onSelectionAction('flipV')}
                title={t('editor.options.flipV')}
              >
                <FlipVertical2 size={16} aria-hidden />
              </Button>
              <Button
                className={small}
                onClick={() => onSelectionAction('rotate')}
                title={t('editor.options.rotate')}
              >
                <RotateCw size={16} aria-hidden />
              </Button>
            </>
          ) : (
            <span className="text-muted">{t('editor.options.selectHint')}</span>
          )}
          {s.clipboard && (
            <Button className={small} onClick={() => onSelectionAction('paste')}>
              {t('editor.options.paste')}
            </Button>
          )}
        </div>
      )}
      {s.tool === 'cleanup' && (
        <span className="text-muted">{t('editor.options.cleanupHint')}</span>
      )}
      {s.tool === 'pan' && <span className="text-muted">{t('editor.options.panHint')}</span>}
    </div>
  );
}
