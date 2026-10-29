import { useTranslation } from 'react-i18next';
import { SYMBOLS } from '../../core/model/symbols.ts';
import { Dialog } from '../components/Dialog.tsx';

export function SymbolPicker({
  open,
  onOpenChange,
  used,
  current,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  used: ReadonlySet<string>;
  current?: string;
  onPick: (symbol: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('editor.palette.chooseSymbol')}
      description={t('editor.palette.symbolHint')}
    >
      <div className="grid grid-cols-8 gap-1.5">
        {SYMBOLS.map((s) => {
          const taken = used.has(s) && s !== current;
          return (
            <button
              key={s}
              type="button"
              disabled={taken}
              onClick={() => {
                onPick(s);
                onOpenChange(false);
              }}
              className={`flex aspect-square items-center justify-center rounded-md border font-symbols text-xl ${
                s === current ? 'border-accent bg-surface-2' : 'border-line hover:bg-surface-2'
              } disabled:opacity-25`}
              aria-label={s}
            >
              {s}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
