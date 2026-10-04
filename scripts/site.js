#!/usr/bin/env node
// Landing page (opencaptions.kvza.ar): copies site/ plus the shared design tokens, stylesheet, brand assets and
// screenshots from the app into one folder, so the site and the app never drift apart. No bundling, no build step:
// files are copied as they are.
//
//   npm run site              # assemble into _site/ and serve it at http://localhost:8081
//   node scripts/site.js      # just assemble (what the GitHub Pages workflow runs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const COPY = [
  ['site', '.'],
  ['public/tokens.css', 'tokens.css'],
  ['public/style.css', 'style.css'],
  ['public/brand', 'brand'],
  ['public/art', 'art'],
  ['public/favicon.ico', 'favicon.ico'],
  ['public/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['docs/images', 'images'],
];

fs.rmSync(OUT, { recursive: true, force: true });
for (const [from, to] of COPY) fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });
console.log(`site assembled in ${path.relative(process.cwd(), OUT) || '.'}`);

if (process.argv.includes('--serve')) {
  const { default: express } = await import('express');
  const port = Number(process.env.PORT || 8081);
  express().use(express.static(OUT, { extensions: ['html'] })).listen(port, () => console.log(`http://localhost:${port}`));
}
