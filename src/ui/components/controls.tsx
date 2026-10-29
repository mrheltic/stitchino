import { Slider as RadixSlider } from 'radix-ui';
import { useId, type ReactNode } from 'react';

/**
 * A labelled form section. With `htmlFor` the label names that control; otherwise it names the
 * group of controls inside.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  const labelId = useId();
  const hintId = useId();
  if (htmlFor) {
    return (
      <div className="space-y-1.5">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {children}
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      className="space-y-1.5"
    >
      <div id={labelId} className="text-sm font-medium">
        {label}
      </div>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  hint,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <label id={id} className="font-medium">
          {label}
        </label>
        <span className="tabular-nums text-muted">{format(value)}</span>
      </div>
      <RadixSlider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-labelledby={id}
      >
        <RadixSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          className="block size-5 rounded-full border-2 border-accent bg-surface shadow focus-visible:outline-2"
          aria-labelledby={id}
        />
      </RadixSlider.Root>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Choice<T extends string | number>({
  name,
  value,
  options,
  onChange,
  size = 'md',
}: {
  name: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((o) => (
        <label
          key={String(o.value)}
          title={o.title}
          className={`cursor-pointer rounded-lg border ${size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} ${
            o.value === value
              ? 'border-accent bg-surface-2 font-medium'
              : 'border-line hover:bg-surface-2'
          } has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}
        >
          <input
            type="radio"
            name={name}
            value={String(o.value)}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {children}
    </label>
  );
}

export function NumberInput({
  value,
  min,
  max,
  onChange,
  label,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  suffix?: ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 tabular-nums"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v))));
        }}
      />
      {suffix && <span className="text-muted">{suffix}</span>}
    </label>
  );
}
