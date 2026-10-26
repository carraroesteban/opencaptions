// The oldest Node.js OpenCaptions runs on: each supported line's release with the October 2026 security fixes
// (CVE-2026-111497 in zlib's Brotli decoder, among others). Keep in sync with package.json's "engines".
// No dependencies: scripts/start.js and the desktop launchers use it before `npm install`. The launchers run this file
// directly (`node src/node-version.js`): it prints "ok" when this Node is fine (anything else, or nothing, is not).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const FIXED = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }; // major: [minor, patch]
const NEWEST = 26; // later lines came out after the fix

/** Plain-language reason this Node.js can't run OpenCaptions, or '' when it can. */
export function nodeProblem(version = process.versions.node) {
  const [major, minor, patch] = version.split('.').map(Number);
  const fixed = FIXED[major];
  if (major > NEWEST || (fixed && (minor > fixed[0] || (minor === fixed[0] && patch >= fixed[1])))) return '';
  return `OpenCaptions needs a Node.js with the October 2026 security fixes: 22.23.4, 24.22.1, 26.12.1 or newer `
    + `(this computer has ${version}). Install the current LTS version from https://nodejs.org/en/download `
    + `(or run "nvm install --lts", "brew upgrade node" or "winget upgrade OpenJS.NodeJS.LTS"), then start OpenCaptions again.`;
}

let main = false;
try { main = fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported, e.g. by node -e */ }
if (main) console.log(nodeProblem() || 'ok');
