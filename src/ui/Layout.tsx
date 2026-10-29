import { BookOpen, FolderOpen, Palette, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatches } from 'react-router';
import { UpdatePrompt } from './components/UpdatePrompt.tsx';

export interface RouteHandle {
  /** Full-screen work area (editor, stitching): no footer, main fills the viewport. */
  fullscreen?: boolean;
}

function NavItem({
  to,
  end,
  icon,
  children,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium ${
          isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
        }`
      }
    >
      {icon}
      <span className="max-sm:sr-only">{children}</span>
    </NavLink>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const fullscreen = useMatches().some((m) => (m.handle as RouteHandle | undefined)?.fullscreen);

  return (
    <div
      className={fullscreen ? 'flex h-dvh flex-col overflow-hidden' : 'flex min-h-full flex-col'}
    >
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2"
        onClick={() => document.getElementById('main')?.focus()}
      >
        {t('nav.skip')}
      </button>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="./favicon.svg" alt="" width={28} height={28} className="rounded-md" />
            <span>{t('app.name')}</span>
          </Link>
          <nav aria-label={t('nav.menu')} className="ml-auto flex items-center gap-1">
            <NavItem to="/" end icon={<FolderOpen size={18} aria-hidden />}>
              {t('nav.projects')}
            </NavItem>
            <NavItem to="/inventory" icon={<Palette size={18} aria-hidden />}>
              {t('nav.inventory')}
            </NavItem>
            <NavItem to="/guide" icon={<BookOpen size={18} aria-hidden />}>
              {t('nav.guide')}
            </NavItem>
            <NavItem to="/settings" icon={<Settings size={18} aria-hidden />}>
              {t('nav.settings')}
            </NavItem>
          </nav>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={`flex flex-1 flex-col outline-none ${fullscreen ? 'min-h-0' : ''}`}
      >
        <Outlet />
      </main>
      {!fullscreen && (
        <footer className="border-t border-line px-4 py-4 text-center text-xs text-muted">
          {t('footer.privacy')} · {t('footer.license')}
        </footer>
      )}
      <UpdatePrompt />
    </div>
  );
}
