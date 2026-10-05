// Brand guardrails: shared tokens on every page, the lime colour rule, logo paths unchanged, website wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const pages = fs.readdirSync(path.join(ROOT, 'public')).filter((f) => f.endsWith('.html'));

test('tokens define the palette and both themes', () => {
  const css = read('public/tokens.css');
  for (const c of ['--ink: #111014', '--paper: #FAF8F3', '--lime: #D4FF3A', '--graphite: #2B2A31', '--fog: #E8E5DD']) assert.ok(css.includes(c), c);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:root\[data-theme='dark'\]/);
  assert.match(css, /Bricolage\+Grotesque/);
  assert.match(css, /Atkinson\+Hyperlegible\+Next/);
});

test('every page uses the shared tokens', () => {
  assert.match(read('public/style.css'), /@import url\('\/tokens\.css'\)/);
  for (const f of pages) assert.match(read(`public/${f}`), /href="\/(style|tokens)\.css"/, f);
});

test('lime is never used as a text colour', () => {
  // Lime is a fill only (ink on lime). The exceptions are prompts that sit on ink: the $ in the website's code block
  // and the ❯ in its announcement ticker.
  const css = (f) => (f.endsWith('.html') ? [...read(f).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') : read(f)).replace(/\/\*[\s\S]*?\*\//g, '');
  const files = [...pages.map((f) => `public/${f}`), 'public/style.css', 'public/tokens.css', 'site/site.css'];
  for (const f of files) {
    for (const line of css(f).split('\n')) {
      if (/^(pre|\.ticker) \.p \{/.test(line.trim()) && f === 'site/site.css') continue;
      for (const [, prop, val] of line.matchAll(/(?<![-\w])(color|stroke)\s*:\s*([^;}]+)/g)) assert.doesNotMatch(val, /lime|d4ff3a|212,\s*255,\s*58/i, `${f}: ${prop}: ${val}`);
    }
  }
});

test('derived logo files reuse the approved paths unchanged', () => {
  const paths = (svg) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).filter((d) => !d.startsWith('M 0 0 L 2048'));
  const approved = paths(read('public/brand/logo-ink.svg'));
  assert.equal(approved.length, 2);
  assert.deepEqual(paths(read('public/brand/logo-dark.svg')), approved);
  for (const f of ['mark-ink.svg', 'mark-dark.svg', 'icon.svg', 'maskable.svg', 'avatar.svg', 'sprite.svg']) assert.deepEqual(paths(read(`public/brand/${f}`)), approved, f);
});

test('website: both languages, hreflang, custom domain', () => {
  assert.equal(read('site/CNAME').trim(), 'opencaptions.kvza.ar');
  for (const [f, lang] of [['site/index.html', 'en'], ['site/es/index.html', 'es']]) {
    const html = read(f);
    assert.match(html, new RegExp(`<html lang="${lang}">`), f);
    assert.match(html, /hreflang="en" href="https:\/\/opencaptions\.kvza\.ar\/"/, f);
    assert.match(html, /hreflang="es" href="https:\/\/opencaptions\.kvza\.ar\/es\/"/, f);
    for (const [, src] of html.matchAll(/(?:href|src)="\/([^"#]+)"/g)) {
      const local = [`site/${src}`, `public/${src}`, `docs/${src}`].some((p) => fs.existsSync(path.join(ROOT, p)) || fs.existsSync(path.join(ROOT, p, 'index.html')));
      assert.ok(local || src === 'es/', `${f} links to missing /${src}`);
    }
  }
});

test('pages use the line icon set, not emoji', () => {
  // Buttons, toolbars and headings use the SVG icons in public/illustrations.js. Typographic signs (→ ✓ ⚠ ◐) are fine.
  const emoji = /[\u{1F300}-\u{1FAFF}]/u;
  const files = [...pages.map((f) => `public/${f}`), ...fs.readdirSync(path.join(ROOT, 'public/pages')).map((f) => `public/pages/${f}`), 'public/assist-ui.js', 'public/common.js'];
  for (const f of files) {
    const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = code.match(emoji);
    assert.equal(m, null, `${f} uses an emoji as an icon: ${m?.[0]}`);
  }
});

test('every page people read has a language switch', () => {
  for (const f of ['index', 'watch', 'talk', 'talks', 'admin', 'welcome', 'kit', 'style', 'ingest', 'demo', 'report']) {
    assert.match(read(`public/pages/${f}.js`), /prefsControls\(/, `${f}: no language switch`);
  }
});
