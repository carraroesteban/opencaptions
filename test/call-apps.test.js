// Just for me: which call apps are open (src/call-apps.js), from the names of running programs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callApps } from '../src/call-apps.js';

test('call apps are recognized on macOS and Windows, each once', () => {
  assert.deepEqual(callApps(['launchd', 'zoom.us', 'CptHost', 'Finder']), ['Zoom']);
  assert.deepEqual(callApps(['explorer.exe', 'ms-teams.exe', 'Zoom.exe']), ['Microsoft Teams', 'Zoom']);
  assert.deepEqual(callApps(['/Applications/Webex.app/Contents/MacOS/Webex']), ['Webex']);
});

test('other programs are not reported', () => {
  assert.deepEqual(callApps(['Google Chrome', 'chrome.exe', 'zoomit.exe', 'Safari', '']), []);
});
