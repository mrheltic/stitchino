import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function StepCard({
  n,
  title,
  summary,
  open,
  disabled,
  onOpen,
  children,
}: {
  n: number;
  title: string;
  summary?: ReactNode;
  open: boolean;
  disabled?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl border bg-surface ${open ? 'border-accent/60' : 'border-line'} ${disabled ? 'opacity-50' : ''}`}
    >
      <h2>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          onClick={onOpen}
          className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-not-allowed"
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              open ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'
            }`}
          >
            {n}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{title}</span>
            {!open && summary && <span className="truncate text-xs text-muted">{summary}</span>}
          </span>
          <ChevronDown
            size={18}
            aria-hidden
            className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {open && <div className="space-y-5 border-t border-line px-4 py-4">{children}</div>}
    </section>
  );
}
