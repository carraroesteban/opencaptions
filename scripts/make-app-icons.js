#!/usr/bin/env node
// The launchers' icons, from the brand icon: deploy/desktop/OpenCaptions.icns (macOS: icon-macos.svg, the icon on
// Apple's grid) and deploy/desktop/OpenCaptions.ico (Windows: public/brand/icon.svg, 16 to 256 px). Run it when the
// brand icon changes; the results are committed. Needs macOS (sips, iconutil) and Google Chrome.
//
//   node scripts/make-app-icons.js
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'deploy', 'desktop');
const CHROME = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'].find((p) => p && fs.existsSync(p));
if (process.platform !== 'darwin' || !CHROME) { console.error('✗ needs macOS (sips, iconutil) and Google Chrome'); process.exit(1); }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-icons-'));

/** SVG → transparent PNG, size × size. */
function render(svg, size, out) {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', `--window-size=${size},${size}`, `--screenshot=${out}`, `file://${svg}`], { stdio: 'ignore' });
}
const resize = (src, size, out) => execFileSync('sips', ['-z', String(size), String(size), src, '--out', out], { stdio: 'ignore' });

// macOS: an .iconset with every size, then iconutil.
const big = path.join(tmp, 'mac-1024.png');
render(path.join(OUT, 'icon-macos.svg'), 1024, big);
const set = path.join(tmp, 'OpenCaptions.iconset');
fs.mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  resize(big, s, path.join(set, `icon_${s}x${s}.png`));
  resize(big, s * 2, path.join(set, `icon_${s}x${s}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(OUT, 'OpenCaptions.icns')]);

// Windows: an .ico holding PNGs (supported since Windows Vista), full-bleed like other Windows icons.
const win = path.join(tmp, 'win-512.png');
render(path.join(ROOT, 'public', 'brand', 'icon.svg'), 512, win);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => { const f = path.join(tmp, `win-${s}.png`); resize(win, s, f); return fs.readFileSync(f); });
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e); header.writeUInt8(s >= 256 ? 0 : s, e + 1); // 0 means 256
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(OUT, 'OpenCaptions.ico'), Buffer.concat([header, ...pngs]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log('✓ deploy/desktop/OpenCaptions.icns and OpenCaptions.ico');
