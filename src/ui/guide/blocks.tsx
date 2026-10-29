import type { ReactNode } from 'react';

/** Building blocks of the guide pages. */

export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">{children}</p>;
}

export function Faq({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="space-y-2">
      {items.map(([q, a]) => (
        <details key={q} className="rounded-lg border border-line px-3 py-2">
          <summary className="cursor-pointer font-medium">{q}</summary>
          <div className="mt-2 text-muted">{a}</div>
        </details>
      ))}
    </div>
  );
}

export function Glossary({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(9rem,auto)_1fr]">
      {items.map(([term, def]) => (
        <div key={term} className="contents">
          <dt className="font-medium">{term}</dt>
          <dd className="text-muted max-sm:mb-1">{def}</dd>
        </div>
      ))}
    </dl>
  );
}
