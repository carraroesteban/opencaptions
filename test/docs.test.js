// The documentation's links work: every relative link in every Markdown file points to a file that exists, and every
// #anchor to a heading in it (GitHub's rules for heading anchors). Also the README's and website's own links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.md'));

/** GitHub's heading anchors: lower case, spaces → -, punctuation dropped; repeats get -1, -2… */
function anchors(md) {
  const seen = new Map(), out = new Set();
  let fence = false;
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const text = m[1].replace(/<[^>]+>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '');
    const base = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    out.add(n ? `${base}-${n}` : base);
  }
  for (const [, id] of md.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) out.add(id);
  return out;
}

test('every relative link and anchor in the Markdown files works', () => {
  const broken = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, ''); // code isn't links
    for (const [, raw] of md.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(?:src|href)="([^"]+)"/g).map((m) => [m[0], m[1] || m[2]])) {
      if (/^(https?:|mailto:|data:)/.test(raw) || raw.startsWith('/')) continue;
      const [target, hash] = raw.split('#');
      const file = target ? path.normalize(path.join(path.dirname(f), decodeURIComponent(target))) : f;
      if (target && !fs.existsSync(path.join(ROOT, file))) { broken.push(`${f}: ${raw} (no such file)`); continue; }
      if (hash && file.endsWith('.md') && !anchors(fs.readFileSync(path.join(ROOT, file), 'utf8')).has(decodeURIComponent(hash))) broken.push(`${f}: ${raw} (no such heading)`);
    }
  }
  assert.deepEqual(broken, []);
});
