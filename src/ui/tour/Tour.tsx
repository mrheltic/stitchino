import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { db } from '../../storage/db.ts';
import { Button } from '../components/ui.tsx';
import { routeMatches, TOUR, TOUR_START_PATH, useTour } from './store.ts';

/**
 * The guided tour: a card that points at one control at a time, over a dimmed page. The page stays
 * usable underneath; some steps move on when the highlighted control is used.
 */
export function Tour() {
  const { t } = useTranslation();
  const { status, step, lastPath, next, back, end, seen } = useTour();
  const location = useLocation();
  const navigate = useNavigate();
  const current = TOUR[step];
  const here = location.pathname + location.search;
  const onRoute = status === 'running' && current && routeMatches(current.route, location.pathname);

  // First visit: offer the tour on the home page (not to returning users, nor to test robots).
  useEffect(() => {
    if (status !== 'new' || location.pathname !== '/' || navigator.webdriver) return;
    let cancelled = false;
    void db.projects.count().then((n) => {
      if (cancelled) return;
      if (n > 0) useTour.getState().end();
      else useTour.getState().start();
    });
    return () => {
      cancelled = true;
    };
  }, [status, location.pathname]);

  useEffect(() => {
    if (onRoute && current.route !== 'any') seen(here);
  }, [onRoute, current, here, seen]);

  if (status !== 'running' || !current) return null;

  if (!onRoute) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3 text-sm shadow-lg">
        <span className="flex-1">{t('tour.paused')}</span>
        <Button variant="primary" onClick={() => navigate(lastPath)}>
          {t('tour.resume')}
        </Button>
        <Button variant="ghost" onClick={end}>
          {t('tour.end')}
        </Button>
      </div>
    );
  }

  const first = step === 0;
  const last = step === TOUR.length - 1;
  return (
    <TourCard
      key={current.id}
      target={current.target}
      clickTarget={current.clickTarget}
      onTargetUsed={next}
      label={t(`tour.steps.${current.id}.title`)}
    >
      <p className="text-xs text-muted">{t('tour.stepOf', { n: step + 1, total: TOUR.length })}</p>
      <h2 className="mt-1 text-base font-semibold">{t(`tour.steps.${current.id}.title`)}</h2>
      <p className="mt-1 text-sm">{t(`tour.steps.${current.id}.body`)}</p>
      {current.clickTarget && <p className="mt-2 text-xs text-muted">{t('tour.clickHint')}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {first ? (
          <>
            <Button variant="ghost" onClick={end}>
              {t('tour.notNow')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                next();
                navigate(TOUR_START_PATH);
              }}
            >
              {t('tour.start')}
            </Button>
          </>
        ) : (
          <>
            {!last && (
              <Button variant="ghost" className="mr-auto" onClick={end}>
                {t('tour.end')}
              </Button>
            )}
            <Button onClick={back}>{t('tour.back')}</Button>
            {!current.clickTarget && (
              <Button variant="primary" onClick={last ? end : next}>
                {last ? t('tour.finish') : t('tour.next')}
              </Button>
            )}
          </>
        )}
      </div>
    </TourCard>
  );
}

function visibleTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function TourCard({
  target,
  clickTarget,
  onTargetUsed,
  label,
  children,
}: {
  target?: string;
  clickTarget?: boolean;
  onTargetUsed: () => void;
  label: string;
  children: ReactNode;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(200);
  const cardRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  // Follow the target while the page lays out, scrolls or resizes.
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    // Where the target sits in the page when it was last scrolled to. Scroll again when the
    // layout moves it (a preview that grows), not when the user scrolls.
    let placedAt: number | null = null;
    const track = () => {
      const el = visibleTarget(target);
      if (el) {
        const pageTop = el.getBoundingClientRect().top + window.scrollY;
        if (placedAt === null || Math.abs(pageTop - placedAt) > 4) {
          // Below the large breakpoint the wizard's preview sticks to the top: keep targets under it.
          el.scrollIntoView({
            block: window.innerWidth < 1024 ? 'end' : 'center',
            behavior: placedAt === null ? 'smooth' : 'auto',
          });
          placedAt = pageTop;
        }
      }
      const r = el?.getBoundingClientRect() ?? null;
      setRect((old) =>
        old &&
        r &&
        old.x === r.x &&
        old.y === r.y &&
        old.width === r.width &&
        old.height === r.height
          ? old
          : r,
      );
      const h = cardRef.current?.offsetHeight;
      if (h) setCardHeight(h);
      setViewport((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight
          ? v
          : { w: window.innerWidth, h: window.innerHeight },
      );
      frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  useEffect(() => {
    if (!target || !clickTarget) return;
    const onClick = (e: MouseEvent) => {
      const el = visibleTarget(target);
      if (el && e.target instanceof Node && el.contains(e.target)) onTargetUsed();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [target, clickTarget, onTargetUsed]);

  const pad = 6;
  const gap = pad + 10;
  const narrow = viewport.w < 640;
  const width = Math.min(352, viewport.w - 32);
  const clampTop = (top: number) => Math.min(Math.max(16, top), viewport.h - cardHeight - 16);
  let card: CSSProperties;
  if (!rect) {
    card = narrow
      ? { left: 16, right: 16, bottom: 16 }
      : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  } else if (narrow) {
    // A sheet at the top or the bottom, away from the target.
    card =
      rect.top + rect.height / 2 > viewport.h / 2
        ? { left: 16, right: 16, top: 16 }
        : { left: 16, right: 16, bottom: 16 };
  } else {
    const left = Math.min(Math.max(16, rect.left), viewport.w - width - 16);
    if (viewport.h - rect.bottom - gap >= cardHeight + 16)
      card = { left, width, top: rect.bottom + gap };
    else if (rect.top - gap >= cardHeight + 16)
      card = { left, width, bottom: viewport.h - rect.top + gap };
    else if (rect.left >= width + gap + 16)
      card = { left: rect.left - width - gap, width, top: clampTop(rect.top) };
    else if (viewport.w - rect.right >= width + gap + 16)
      card = { left: rect.right + gap, width, top: clampTop(rect.top) };
    else card = { left: (viewport.w - width) / 2, width, bottom: 16 };
  }

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-xl transition-all duration-200"
        style={
          rect
            ? {
                left: rect.left - pad,
                top: rect.top - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
                boxShadow: '0 0 0 3px var(--accent), 0 0 0 9999px rgb(0 0 0 / 0.35)',
              }
            : { inset: 0, background: 'rgb(0 0 0 / 0.35)' }
        }
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-label={label}
        className="fixed z-[61] max-w-[22rem] rounded-xl border border-line bg-surface p-4 shadow-2xl max-sm:max-w-none"
        style={card}
      >
        {children}
      </div>
    </>
  );
}
