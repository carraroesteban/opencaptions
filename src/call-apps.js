// Just for me: is a call app open on this computer (Zoom, Teams, Webex…)? The personal page then suggests capturing
// the call. Only the names of running programs are read, matched against this list, and nothing leaves the computer.
// A call in a browser tab (Google Meet, Zoom or Teams on the web) can't be seen from here.
import { execFile } from 'node:child_process';

/** Program names (macOS, Windows, Linux) → the app's name. Lowercase, without .exe. */
const APPS = {
  'zoom.us': 'Zoom', zoom: 'Zoom', cpthost: 'Zoom',
  msteams: 'Microsoft Teams', 'ms-teams': 'Microsoft Teams', teams: 'Microsoft Teams', 'microsoft teams': 'Microsoft Teams',
  webex: 'Webex', ciscocollabhost: 'Webex', webexmta: 'Webex', 'cisco webex meetings': 'Webex',
  facetime: 'FaceTime', discord: 'Discord', skype: 'Skype', gotomeeting: 'GoTo Meeting', g2mcomm: 'GoTo Meeting',
};

/** The call apps among these program names, each once. */
export function callApps(names) {
  const found = new Set();
  for (const n of names) {
    const key = n.trim().replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
    if (APPS[key]) found.add(APPS[key]);
  }
  return [...found];
}

/** The program names running now (empty if they can't be read). */
function processNames() {
  const [cmd, args] = process.platform === 'win32' ? ['tasklist', ['/fo', 'csv', '/nh']] : ['ps', ['-axco', 'comm']];
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 5000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve([]);
      resolve(process.platform === 'win32'
        ? out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean)
        : out.split('\n').slice(1));
    });
  });
}

let cache = { at: 0, apps: [] };
/** Call apps open now; read at most every 10 s. */
export async function openCallApps() {
  if (Date.now() - cache.at > 10_000) cache = { at: Date.now(), apps: callApps(await processNames()) };
  return cache.apps;
}
