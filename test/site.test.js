// The website builds, and what search engines read is valid: every guide in site/pages renders with its pair in the
// other language, every internal link resolves, the structured data parses and the sitemap lists every page.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT = '_site';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let html = [];
before(() => {
  execFileSync(process.execPath, ['scripts/site.js'], { stdio: 'ignore' });
  html = walk(OUT).filter((f) => f.endsWith('.html'));
});

test('every guide has its pair in the other language', () => {
  for (const lang of ['en', 'es']) {
    for (const f of fs.readdirSync(`site/pages/${lang}`)) {
      const pair = JSON.parse(fs.readFileSync(`site/pages/${lang}/${f}`, 'utf8').match(/^<!--(\{[\s\S]*?\})-->/)[1]).pair;
      assert.ok(fs.existsSync(`site/pages/${lang === 'en' ? 'es' : 'en'}/${pair}.html`), `${lang}/${f} → ${pair}`);
    }
  }
});

test('internal links resolve and structured data parses', () => {
  const broken = [];
  for (const f of html) {
    const s = fs.readFileSync(f, 'utf8');
    for (const [, json] of s.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(json); } catch { broken.push(`${f}: invalid JSON-LD`); }
    }
    for (const [, href] of s.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
      const p = path.join(OUT, href.endsWith('/') ? href + 'index.html' : href);
      if (!fs.existsSync(p)) broken.push(`${f} → ${href}`);
    }
  }
  assert.deepEqual(broken, []);
});

test('the sitemap lists every page', () => {
  const map = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
  for (const f of html.filter((x) => x.endsWith('index.html'))) {
    const url = '/' + path.relative(OUT, f).split(path.sep).join('/').replace(/index\.html$/, ''); // web paths, also on Windows
    assert.ok(map.includes(`<loc>https://opencaptions.kvza.ar${url}</loc>`), `missing ${url}`);
  }
});
