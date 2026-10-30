import { BookOpen, FolderOpen, Palette, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatches } from 'react-router';
import { UpdatePrompt } from './components/UpdatePrompt.tsx';
import { Tour } from './tour/Tour.tsx';

export interface RouteHandle {
  /** Full-screen work area (editor, stitching): no footer, main fills the viewport. */
  fullscreen?: boolean;
  /** On phones the app header gives way too (the page has its own way back). */
  immersive?: boolean;
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
        `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium max-sm:flex-col max-sm:gap-0.5 max-sm:px-1.5 max-sm:py-1 max-sm:text-[11px] max-sm:leading-tight ${
          isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
        }`
      }
    >
      {icon}
      {/* On phones the label goes under the icon, small: icons alone don't say enough. */}
      <span>{children}</span>
    </NavLink>
  );
}

export function Layout() {
  const { t, i18n } = useTranslation();
  const matches = useMatches();
  const fullscreen = matches.some((m) => (m.handle as RouteHandle | undefined)?.fullscreen);
  const immersive = matches.some((m) => (m.handle as RouteHandle | undefined)?.immersive);

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
      <header className={`border-b border-line bg-surface ${immersive ? 'max-lg:hidden' : ''}`}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="./favicon.svg" alt="" width={28} height={28} className="rounded-md" />
            <span className="max-sm:sr-only">{t('app.name')}</span>
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
        <footer className="flex flex-wrap items-center justify-center gap-x-3 border-t border-line px-4 py-3 text-center text-xs text-muted">
          <span className="py-1">{t('footer.privacy')}</span>
          <span className="py-1">{t('footer.license')}</span>
          {/* Static pages next to the app, outside the hash router. */}
          <a
            href={i18n.resolvedLanguage === 'it' ? 'it/schemi/' : 'patterns/'}
            className="py-1 underline-offset-2 hover:text-ink hover:underline"
          >
            {t('footer.patterns')}
          </a>
          <Link to="/privacy" className="py-1 underline-offset-2 hover:text-ink hover:underline">
            {t('footer.privacyLink')}
          </Link>
          <Link to="/support" className="py-1 text-accent underline-offset-2 hover:underline">
            ♥ {t('footer.support')}
          </Link>
        </footer>
      )}
      <UpdatePrompt />
      <Tour />
    </div>
  );
}
