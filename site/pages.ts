import { APP_NAME, LINKS, SITE_URL } from '../src/core/brand.ts';
import type { FreePattern } from './patterns.ts';
import { LANGS, PATHS, TEXT, type Lang } from './text.ts';

/** What a pattern page shows beyond its catalogue entry (computed by build.ts). */
export interface PatternInfo {
  entry: FreePattern;
  width: number;
  height: number;
  brand: string;
  stitches: number;
  finishedCm: [number, number];
  finishedIn: [number, number];
  threads: { label: string; name: string; hex: string; stitches: number }[];
  /** File names inside patterns/<slug>/. */
  files: {
    source?: string;
    preview: string;
    a4: string;
    letter: string;
    patternKeeper: string;
    a4It: string;
  };
  /** Width and colours used to make the pattern, for "Change it in Stitchino". */
  settings: { width: number; colors: number };
}

export interface Page {
  /** Folder relative to the app, e.g. "patterns/" ("" for the app itself). */
  path: string;
  html: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Relative path from a page folder back to the app (base is relative, as in the app). */
function up(path: string): string {
  return '../'.repeat(path.split('/').filter(Boolean).length);
}

export function patternPath(lang: Lang, entry: FreePattern): string {
  return lang === 'en'
    ? `${PATHS.patterns.en}${entry.slug}/`
    : `${PATHS.patterns.it}${entry.slugIt}/`;
}

interface Shell {
  lang: Lang;
  path: string;
  alternates: Record<Lang, string>;
  title: string;
  description: string;
  /** Social preview, relative to the app. */
  image: string;
  body: string;
  jsonLd?: object;
}

function shell(p: Shell): string {
  const t = TEXT[p.lang];
  const root = up(p.path);
  const other = LANGS.find((l) => l !== p.lang)!;
  const abs = (path: string) => SITE_URL + path;
  const jsonLd = p.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, '\\u003c')}</script>\n`
    : '';
  return `<!doctype html>
<html lang="${p.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${abs(p.path)}">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${abs(p.alternates[l])}">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="${abs(p.alternates.en)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${APP_NAME}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${abs(p.path)}">
<meta property="og:image" content="${abs(p.image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#9e2f45">
<link rel="icon" type="image/svg+xml" href="${root}favicon.svg">
<link rel="stylesheet" href="${root}site/site.css">
${jsonLd}</head>
<body>
<header class="top">
<a class="brand" href="${root}${PATHS.landing[p.lang]}"><img src="${root}favicon.svg" alt="" width="28" height="28">${APP_NAME}</a>
<nav>
<a href="${root}${PATHS.patterns[p.lang]}">${esc(t.freePatterns)}</a>
<a href="${root}${p.alternates[other]}" hreflang="${other}" lang="${other}">${esc(TEXT[other].language)}</a>
<a class="button small" href="${root}">${esc(t.openApp)}</a>
</nav>
</header>
<main>
${p.body}
</main>
<footer class="bottom">
<p>${esc(t.footerNote)}</p>
<p class="links">
<a href="${root}">${esc(t.openApp)}</a>
<a href="${root}${PATHS.patterns[p.lang]}">${esc(t.freePatterns)}</a>
<a href="${root}#/guide">${esc(t.guide)}</a>
<a href="${root}#/privacy">${esc(t.privacy)}</a>
<a href="${LINKS.source}">${esc(t.code)}</a>
<a href="${LINKS.kofi}">♥ ${esc(t.support)}</a>
</p>
</footer>
</body>
</html>
`;
}

export function landingPage(lang: Lang): Page {
  const t = TEXT[lang];
  const l = t.landing;
  const path = PATHS.landing[lang];
  const root = up(path);
  const body = `<section class="hero">
<h1>${esc(l.h1)}</h1>
<p class="lead">${esc(l.lead)}</p>
<p class="actions"><a class="button" href="${root}#/new">${esc(t.openApp)}</a> <a class="button secondary" href="${root}${PATHS.patterns[lang]}">${esc(t.freePatterns)}</a></p>
<img class="wide" src="${root}site/hero.jpg" width="1800" height="516" alt="${esc(l.heroAlt)}">
</section>
<section>
<h2>${esc(l.howTitle)}</h2>
<ol class="steps">
${l.steps.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('\n')}
</ol>
</section>
<section>
<h2>${esc(l.featuresTitle)}</h2>
<ul class="grid">
${l.features.map(([h, p]) => `<li><h3>${esc(h)}</h3><p>${esc(p)}</p></li>`).join('\n')}
</ul>
</section>
<section class="note">
<h2>${esc(l.privacyTitle)}</h2>
<p>${esc(l.privacyText)}</p>
</section>
<section>
<h2>${esc(l.faqTitle)}</h2>
${l.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
</section>
<section class="cta">
<h2>${esc(l.ctaTitle)}</h2>
<p>${esc(l.ctaText)}</p>
<p class="actions"><a class="button" href="${root}#/new">${esc(t.openApp)}</a></p>
</section>`;
  return {
    path,
    html: shell({
      lang,
      path,
      alternates: PATHS.landing,
      title: l.title,
      description: l.description,
      image: 'site/hero.jpg',
      body,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: APP_NAME,
        url: SITE_URL,
        description: l.description,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Any (web browser)',
        inLanguage: [...LANGS],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      },
    }),
  };
}

export function patternsIndex(lang: Lang, infos: PatternInfo[]): Page {
  const t = TEXT[lang].patterns;
  const path = PATHS.patterns[lang];
  const root = up(path);
  const cards = infos
    .map(
      (i) => `<li class="card"><a href="${root}${patternPath(lang, i.entry)}">
<img src="${root}patterns/${i.entry.slug}/${i.files.preview}" alt="" loading="lazy" width="${i.width * 10}" height="${i.height * 10}">
<span class="card-title">${esc(i.entry.title[lang])}</span>
<span class="card-meta">${esc(t.size(i.width, i.height))} · ${esc(t.colours(i.threads.length))}</span>
</a></li>`,
    )
    .join('\n');
  const first = infos[0];
  return {
    path,
    html: shell({
      lang,
      path,
      alternates: PATHS.patterns,
      title: t.title,
      description: t.description,
      image: first ? `patterns/${first.entry.slug}/${first.files.preview}` : 'site/hero.jpg',
      body: `<section>
<h1>${esc(t.h1)}</h1>
<p class="lead">${esc(t.lead)}</p>
<ul class="cards">
${cards}
</ul>
</section>`,
    }),
  };
}

export function patternPage(lang: Lang, info: PatternInfo): Page {
  const t = TEXT[lang];
  const p = t.pattern;
  const e = info.entry;
  const path = patternPath(lang, e);
  const root = up(path);
  const assets = `${root}patterns/${e.slug}/`;
  const name = e.title[lang];
  const number = (n: number) => n.toLocaleString(lang === 'it' ? 'it-IT' : 'en-GB');
  const [cw, ch] = info.finishedCm;
  const [iw, ih] = info.finishedIn;
  const finished =
    lang === 'it'
      ? `${number(cw)} × ${number(ch)} cm`
      : `${number(cw)} × ${number(ch)} cm (${number(iw)} × ${number(ih)} in)`;
  const downloads: [string, string][] =
    lang === 'en'
      ? [
          [p.a4, info.files.a4],
          [p.letter, info.files.letter],
          [p.patternKeeper, info.files.patternKeeper],
        ]
      : [
          [p.a4, info.files.a4It],
          [p.patternKeeper, info.files.patternKeeper],
        ];
  const open = info.files.source
    ? `${root}#/new?src=${encodeURIComponent(`patterns/${e.slug}/${info.files.source}`)}&w=${info.settings.width}&colors=${info.settings.colors}&title=${encodeURIComponent(name)}`
    : '';
  const rows = info.threads
    .map(
      (th) =>
        `<tr><td><span class="swatch" style="background:${th.hex}"></span>${esc(th.label)}</td><td>${esc(th.name)}</td><td class="num">${number(th.stitches)}</td></tr>`,
    )
    .join('\n');
  const credit = e.creditUrl
    ? `<a href="${esc(e.creditUrl)}">${esc(e.credit[lang])}</a>`
    : esc(e.credit[lang]);
  const ratio = `width="${info.width * 10}" height="${info.height * 10}"`;
  const body = `<article class="pattern">
<p class="kicker">${esc(p.kicker)}</p>
<h1>${esc(name)}</h1>
<p class="lead">${esc(e.description[lang])}</p>
<div class="pair">
${info.files.source ? `<figure><img src="${assets}${info.files.source}" alt="${esc(p.original)}"><figcaption>${esc(p.original)}</figcaption></figure>` : ''}
<figure><img src="${assets}${info.files.preview}" alt="${esc(p.stitched)}" ${ratio}><figcaption>${esc(p.stitched)}</figcaption></figure>
</div>
<dl class="facts">
<div><dt>${esc(p.size)}</dt><dd>${esc(t.patterns.size(info.width, info.height))}</dd></div>
<div><dt>${esc(p.finished)}</dt><dd>${esc(finished)}</dd></div>
<div><dt>${esc(p.colours)}</dt><dd>${info.threads.length} ${esc(info.brand)}</dd></div>
<div><dt>${esc(p.stitches)}</dt><dd>${number(info.stitches)}</dd></div>
</dl>
<h2>${esc(p.download)}</h2>
<p class="actions">${downloads.map(([label, file]) => `<a class="button" href="${assets}${file}" download>${esc(label)}</a>`).join(' ')}</p>
${open ? `<p class="actions"><a class="button secondary" href="${esc(open)}">${esc(p.customize)}</a></p>\n<p class="hint">${esc(p.customizeHint)}</p>` : ''}
<h2>${esc(p.threads)}</h2>
<table class="threads">
<thead><tr><th>${esc(p.threadColumns[0])}</th><th>${esc(p.threadColumns[1])}</th><th class="num">${esc(p.threadColumns[2])}</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<p class="hint">${credit}</p>
<p class="hint">${esc(p.licence)}</p>
<p class="support">${esc(p.supportText)} <a href="${LINKS.kofi}">${esc(p.supportLink)}</a></p>
<p><a href="${root}${PATHS.patterns[lang]}">← ${esc(p.more)}</a></p>
</article>`;
  return {
    path,
    html: shell({
      lang,
      path,
      alternates: { en: patternPath('en', e), it: patternPath('it', e) },
      title: p.title(name),
      description: p.description(name, info.width, info.height, info.threads.length, info.brand),
      image: `patterns/${e.slug}/${info.files.preview}`,
      body,
    }),
  };
}

export function sitemap(paths: string[], date: string): string {
  const urls = paths.map(
    (p) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${date}</lastmod></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}
