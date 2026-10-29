import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  DEFAULT_FABRIC,
  createPattern,
  type Fabric,
  type FabricKind,
} from '../../core/model/pattern.ts';
import { FABRIC_PRESETS, finishedSize } from '../../core/size/fabric.ts';
import { createProject } from '../../storage/projects.ts';
import { Choice, Field, NumberInput } from '../components/controls.tsx';
import { Button, Card, Page, PageHeader } from '../components/ui.tsx';
import { formatSize } from '../format.ts';
import { useSettings } from '../state/settings.ts';

export function BlankPattern() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const units = useSettings((s) => s.units);
  const [title, setTitle] = useState('');
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const [fabric, setFabric] = useState<Fabric>(DEFAULT_FABRIC);
  const [saving, setSaving] = useState(false);
  const preset = FABRIC_PRESETS.find((p) => p.kind === fabric.kind)!;
  const size = finishedSize(width, height, fabric);

  const create = async () => {
    setSaving(true);
    const pattern = createPattern(width, height, {
      fabric,
      meta: { title: title.trim() || t('wizard.create.untitled'), source: 'blank' },
    });
    const id = await createProject(pattern);
    navigate(`/project/${id}`);
  };

  return (
    <Page>
      <PageHeader title={t('blank.title')} />
      <Card className="space-y-5">
        <Field label={t('wizard.create.name')} htmlFor="project-title">
          <input
            id="project-title"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field
          label={t('blank.size')}
          hint={formatSize(size.widthMm, size.heightMm, units, i18n.resolvedLanguage)}
        >
          <div className="flex flex-wrap items-center gap-3">
            <NumberInput
              label={t('blank.width')}
              value={width}
              min={1}
              max={1000}
              onChange={setWidth}
              suffix="×"
            />
            <NumberInput
              label={t('blank.height')}
              value={height}
              min={1}
              max={1000}
              onChange={setHeight}
              suffix={t('wizard.size.stitchesShort')}
            />
          </div>
        </Field>
        <Field label={t('wizard.size.fabric')}>
          <Choice<FabricKind>
            name="fabric-kind"
            size="sm"
            value={fabric.kind}
            onChange={(kind) => {
              const p = FABRIC_PRESETS.find((x) => x.kind === kind)!;
              setFabric({
                ...fabric,
                kind,
                count: p.counts[Math.min(1, p.counts.length - 1)],
                over: p.defaultOver,
              });
            }}
            options={FABRIC_PRESETS.map((p) => ({
              value: p.kind,
              label: t(`fabric.kinds.${p.kind}`),
            }))}
          />
          <Choice<number>
            name="fabric-count"
            size="sm"
            value={fabric.count}
            onChange={(count) => setFabric({ ...fabric, count })}
            options={preset.counts.map((c) => ({ value: c, label: `${c} ct` }))}
          />
        </Field>
        <div className="flex justify-end">
          <Button variant="primary" disabled={saving} onClick={() => void create()}>
            {t('blank.create')}
          </Button>
        </div>
      </Card>
    </Page>
  );
}
