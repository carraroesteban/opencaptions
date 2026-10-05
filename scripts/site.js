#!/usr/bin/env node
// Landing page (opencaptions.kvza.ar): copies site/ plus the shared design tokens, stylesheet, brand assets and
// screenshots from the app into one folder, so the site and the app never drift apart. No bundling: files are copied
// as they are, except the guides in site/pages/<lang>/<slug>.html, which get the shared layout (header, footer,
// language switch, search metadata) and land at /<slug>/ and /es/<slug>/. The sitemap lists every page.
//
//   npm run site              # assemble into _site/ and serve it at http://localhost:8081
//   node scripts/site.js      # just assemble (what the GitHub Pages workflow runs)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const BASE = 'https://opencaptions.kvza.ar';
const COPY = [
  ['site', '.'],
  ['public/tokens.css', 'tokens.css'],
  ['public/style.css', 'style.css'],
  ['public/brand', 'brand'],
  ['public/fonts', 'fonts'],
  ['public/art', 'art'],
  ['public/favicon.ico', 'favicon.ico'],
  ['public/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['docs/images', 'images'],
];

fs.rmSync(OUT, { recursive: true, force: true });
for (const [from, to] of COPY) fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });
fs.rmSync(path.join(OUT, 'pages'), { recursive: true, force: true }); // sources, rendered below

// ---------------------------------------------------------------- guides
const UI = {
  en: { home: '/', features: 'Features', how: 'How it works', pricing: 'Pricing', other: 'es', otherName: 'Español', theme: 'Light / dark',
    crumbs: 'Breadcrumb', more: 'More guides', ctaH: 'Try it at your next event', ctaP: 'Free and open source. Install Node.js, download OpenCaptions and the setup wizard does the rest.',
    mac: 'Download for Mac', win: 'Download for Windows', demo: 'Watch the 30-second demo', license: 'Free and open source · MIT license', updated: 'Updated',
    conduct: 'Code of conduct', security: 'Security', mit: 'MIT license' },
  es: { home: '/es/', features: 'Funciones', how: 'Cómo funciona', pricing: 'Precios', other: 'en', otherName: 'English', theme: 'Claro / oscuro',
    crumbs: 'Ruta', more: 'Más guías', ctaH: 'Probalo en tu próximo evento', ctaP: 'Gratis y de código abierto. Instalá Node.js, descargá OpenCaptions y el asistente hace el resto.',
    mac: 'Descargar para Mac', win: 'Descargar para Windows', demo: 'Ver la demo de 30 segundos', license: 'Gratis y de código abierto · licencia MIT', updated: 'Actualizado',
    conduct: 'Código de conducta', security: 'Seguridad', mit: 'Licencia MIT' },
};
const DL = 'https://github.com/carraroesteban/opencaptions/releases/latest/download/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const urlOf = (lang, slug) => (lang === 'en' ? `/${slug}/` : `/es/${slug}/`);

/** site/pages/<lang>/<slug>.html: a JSON header in an HTML comment, then the article body. */
const pages = [];
for (const lang of ['en', 'es']) {
  const dir = path.join(ROOT, 'site', 'pages', lang);
  if (!fs.existsSync(dir)) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html')).sort()) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    const m = src.match(/^<!--(\{[\s\S]*?\})-->\n?/);
    if (!m) throw new Error(`${lang}/${file}: missing the <!--{…}--> header`);
    pages.push({ lang, slug: file.replace(/\.html$/, ''), ...JSON.parse(m[1]), body: src.slice(m[0].length) });
  }
}
const pairOf = (p) => pages.find((q) => q.lang !== p.lang && q.slug === p.pair);
const guidesOf = (lang) => pages.filter((p) => p.lang === lang && !p.legal);
// The footer's second row: the policies (privacy, accessibility as pages here; the rest live on GitHub).
const GH = 'https://github.com/carraroesteban/opencaptions/blob/main';
const legalRow = (lang) => [
  ...pages.filter((p) => p.lang === lang && p.legal).map((p) => `<a href="${urlOf(lang, p.slug)}">${esc(p.label)}</a>`),
  `<a href="${GH}/.github/CODE_OF_CONDUCT.md">${UI[lang].conduct}</a>`,
  `<a href="${GH}/.github/SECURITY.md">${UI[lang].security}</a>`,
  `<a href="${GH}/LICENSE">${UI[lang].mit}</a>`,
].join('');
// Pages can say different things depending on whether visitor statistics are on (SITE_GOATCOUNTER).
const statsOn = /^[a-z0-9-]+$/.test((process.env.SITE_GOATCOUNTER || '').trim());
const withStats = (html) => html.replace(/<!--if-stats-->([\s\S]*?)<!--\/if-stats-->/g, statsOn ? '$1' : '').replace(/<!--if-no-stats-->([\s\S]*?)<!--\/if-no-stats-->/g, statsOn ? '' : '$1');

function render(p) {
  const t = UI[p.lang], url = urlOf(p.lang, p.slug), pair = pairOf(p);
  const otherUrl = pair ? urlOf(pair.lang, pair.slug) : UI[t.other].home;
  const en = p.lang === 'en' ? p : pair, es = p.lang === 'es' ? p : pair;
  const alternates = [en && `<link rel="alternate" hreflang="en" href="${BASE}${urlOf('en', en.slug)}" />`, es && `<link rel="alternate" hreflang="es" href="${BASE}${urlOf('es', es.slug)}" />`,
    en && `<link rel="alternate" hreflang="x-default" href="${BASE}${urlOf('en', en.slug)}" />`].filter(Boolean).join('\n  ');
  /** @type {Record<string, any>[]} */
  const graph = [
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'OpenCaptions', item: BASE + t.home }, { '@type': 'ListItem', position: 2, name: p.label, item: BASE + url }] },
    { '@type': 'Article', headline: p.h1, description: p.description, inLanguage: p.lang, dateModified: p.updated, mainEntityOfPage: BASE + url, image: `${BASE}/brand/og.png`,
      author: { '@type': 'Organization', name: 'OpenCaptions', url: BASE + t.home }, publisher: { '@type': 'Organization', name: 'OpenCaptions', logo: { '@type': 'ImageObject', url: `${BASE}/brand/icon-512.png` } } },
  ];
  if (p.faq) {
    // Questions are the <h3>s; each answer is the paragraphs and lists that follow it.
    const qa = [...p.body.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23][^>]*>|$)/g)].map(([, q, a]) => ({ '@type': 'Question', name: text(q), acceptedAnswer: { '@type': 'Answer', text: text(a) } }));
    graph.push({ '@type': 'FAQPage', mainEntity: qa });
  }
  const more = guidesOf(p.lang).filter((q) => q !== p).map((q) => `<li><a href="${urlOf(q.lang, q.slug)}">${esc(q.label)}</a></li>`).join('');
  return `<!doctype html>
<html lang="${p.lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}" />
  <meta name="theme-color" content="#FAF8F3" />
  <link rel="canonical" href="${BASE}${url}" />
  ${alternates}
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" href="/brand/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="OpenCaptions" />
  <meta property="og:url" content="${BASE}${url}" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.description)}" />
  <meta property="og:image" content="${BASE}/brand/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:locale" content="${p.lang === 'en' ? 'en_US' : 'es_AR'}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })}</script>
  <script>let t = 'light'; try { t = JSON.parse(localStorage.getItem('oc.theme')) || t; } catch {} document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]').content = t === 'dark' ? '#111014' : '#FAF8F3';</script>
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/site.css" />
</head>
<body>
  <nav class="nav">
    <div class="wrap">
      <a class="brand" href="${t.home}">OpenCaptions</a>
      <div class="links">
        <a class="hide-sm" href="${t.home}#features">${t.features}</a>
        <a class="hide-sm" href="${t.home}#how">${t.how}</a>
        <a class="hide-sm" href="${t.home}#pricing">${t.pricing}</a>
        <a class="hide-sm" href="https://github.com/carraroesteban/opencaptions">GitHub</a>
        <a class="lang" href="${otherUrl}" hreflang="${t.other}" lang="${t.other}" title="${t.otherName}">${t.other.toUpperCase()}</a>
        <button id="theme" type="button" aria-label="${t.theme}" title="${t.theme}">◐</button>
      </div>
    </div>
  </nav>

  <main class="doc">
    <article class="wrap narrow">
      <nav class="crumbs" aria-label="${t.crumbs}"><a href="${t.home}">OpenCaptions</a> <span aria-hidden="true">›</span> <span>${esc(p.label)}</span></nav>
      <h1>${p.h1}</h1>
      <p class="lede">${p.lede}</p>
      <p class="updated">${t.updated}: <time datetime="${p.updated}">${p.updated}</time></p>
${withStats(p.body).trim().split('\n').map((l) => '      ' + l).join('\n')}
      ${p.legal ? '' : `<aside class="doc-cta">
        <h2>${t.ctaH}</h2>
        <p>${t.ctaP}</p>
        <div class="cta"><a class="btn primary" href="${DL}OpenCaptions-mac.zip">${t.mac}</a><a class="btn primary" href="${DL}OpenCaptions-windows.zip">${t.win}</a><a class="btn" href="${t.home}#screens">${t.demo}</a></div>
      </aside>
      <nav class="doc-more" aria-label="${t.more}"><h2>${t.more}</h2><ul>${more}</ul></nav>`}
    </article>
  </main>

  <footer class="site">
    <div class="wrap">
      <a class="brand" href="${t.home}">OpenCaptions</a>
      <span>${t.license}</span>
      <a href="https://github.com/carraroesteban/opencaptions">GitHub</a>
      <a href="${otherUrl}" hreflang="${t.other}">${t.otherName}</a>
      <span class="legal">${legalRow(p.lang)}</span>
    </div>
  </footer>
  <script src="/site.js" defer></script>
</body>
</html>
`;
}
for (const p of pages) {
  const dir = path.join(OUT, ...urlOf(p.lang, p.slug).split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), render(p));
}

// The home pages link to the guides in their own language (between the <!--guides--> markers in the footer).
for (const lang of ['en', 'es']) {
  const file = path.join(OUT, lang === 'en' ? 'index.html' : 'es/index.html');
  const links = guidesOf(lang).map((p) => `<a href="${urlOf(lang, p.slug)}">${esc(p.label)}</a>`).join('');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/<!--guides-->[\s\S]*?<!--\/guides-->/, `<!--guides--><span class="guides">${links}</span><span class="legal">${legalRow(lang)}</span><!--/guides-->`));
}

// ---------------------------------------------------------------- sitemap
const today = new Date().toISOString().slice(0, 10);
const alt = (en, es) => [en && `<xhtml:link rel="alternate" hreflang="en" href="${BASE}${en}" />`, es && `<xhtml:link rel="alternate" hreflang="es" href="${BASE}${es}" />`,
  en && `<xhtml:link rel="alternate" hreflang="x-default" href="${BASE}${en}" />`].filter(Boolean).map((l) => `    ${l}`).join('\n');
const video = `    <video:video>
      <video:thumbnail_loc>${BASE}/media/demo-poster.jpg</video:thumbnail_loc>
      <video:title>OpenCaptions: a talk captioned live, on the stage screen and on a phone</video:title>
      <video:description>A real 30-second talk captioned live in Spanish by OpenCaptions, the free, open-source live captioning and translation app for events.</video:description>
      <video:content_loc>${BASE}/media/demo.mp4</video:content_loc>
      <video:duration>34</video:duration>
    </video:video>`;
const entries = [
  `  <url>\n    <loc>${BASE}/</loc>\n    <lastmod>${today}</lastmod>\n${alt('/', '/es/')}\n${video}\n  </url>`,
  `  <url>\n    <loc>${BASE}/es/</loc>\n    <lastmod>${today}</lastmod>\n${alt('/', '/es/')}\n  </url>`,
  ...pages.map((p) => {
    const pair = pairOf(p), en = p.lang === 'en' ? p : pair, es = p.lang === 'es' ? p : pair;
    return `  <url>\n    <loc>${BASE}${urlOf(p.lang, p.slug)}</loc>\n    <lastmod>${p.updated}</lastmod>\n${alt(en && urlOf('en', en.slug), es && urlOf('es', es.slug))}\n  </url>`;
  }),
];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries.join('\n')}
</urlset>
`);

// ---------------------------------------------------------------- every page: speed, verification, statistics
// Preload what the first paint needs (the stylesheet chain style.css → tokens.css → fonts/brand.css, and the Latin
// interface fonts), so text shows sooner. Optional, from the environment (GitHub repository variables in the Site
// workflow): search-engine verification and privacy-friendly visitor statistics (GoatCounter: no cookies, no personal
// data). Nothing is added when they aren't set.
const brandCss = fs.readFileSync(path.join(ROOT, 'public/fonts/brand.css'), 'utf8');
const latinFonts = [...brandCss.matchAll(/\/\* latin \*\/\s*@font-face \{[^}]*font-style: normal;[^}]*url\(([^)]+)\)/g)].map((m) => m[1]);
const env = (k) => (process.env[k] || '').trim();
const head = [
  '<link rel="preload" href="/tokens.css" as="style" />',
  '<link rel="preload" href="/fonts/brand.css" as="style" />',
  ...latinFonts.map((u) => `<link rel="preload" href="${u}" as="font" type="font/woff2" crossorigin />`),
  env('SITE_GOOGLE_VERIFICATION') && `<meta name="google-site-verification" content="${esc(env('SITE_GOOGLE_VERIFICATION'))}" />`,
  env('SITE_BING_VERIFICATION') && `<meta name="msvalidate.01" content="${esc(env('SITE_BING_VERIFICATION'))}" />`,
  /^[a-z0-9-]+$/.test(env('SITE_GOATCOUNTER')) && `<script data-goatcounter="https://${env('SITE_GOATCOUNTER')}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`,
].filter(Boolean).join('\n  ');
// Content-Security-Policy (GitHub Pages can't send headers, so a <meta>): everything from this site, plus the
// statistics host when they're on. It enforces what the privacy page promises. Each page's small inline script (the
// theme, set before paint) is allowed by its hash.
const gc = /^[a-z0-9-]+$/.test(env('SITE_GOATCOUNTER')) ? `https://${env('SITE_GOATCOUNTER')}.goatcounter.com` : '';
const csp = (html) => {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  return [
    "default-src 'self'", `script-src 'self' ${hashes.join(' ')}${gc ? ' https://gc.zgo.at' : ''}`, "style-src 'self'", "font-src 'self'",
    `img-src 'self' data:${gc ? ` ${gc}` : ''}`, `connect-src 'self'${gc ? ` ${gc}` : ''}`, "media-src 'self'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ].join('; ');
};
for (const file of fs.readdirSync(OUT, { recursive: true }).map(String).filter((f) => f.endsWith('.html'))) {
  const p = path.join(OUT, file);
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('<link rel="stylesheet" href="/style.css" />')) html = html.replace('<link rel="stylesheet" href="/style.css" />', `${head}\n  <link rel="stylesheet" href="/style.css" />`);
  html = html.replace(/<head>\n?/, (m) => `${m}  <meta http-equiv="Content-Security-Policy" content="${csp(html)}" />\n`);
  fs.writeFileSync(p, html);
}

console.log(`site assembled in ${path.relative(process.cwd(), OUT) || '.'} (${pages.length} pages)`);

if (process.argv.includes('--serve')) {
  const { default: express } = await import('express');
  const port = Number(process.env.PORT || 8081);
  express().use(express.static(OUT, { extensions: ['html'] })).listen(port, () => console.log(`http://localhost:${port}`));
}
