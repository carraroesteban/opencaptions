// The replayed AI (src/replay.js) in the public demo: a room looping its sample talk gets the recording again each
// time the audio starts over, instead of silence until the session is restarted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { replayClient } from '../src/replay.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('audio that keeps coming after the recording ends plays the recording again', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oc-replay-')), 'r.json');
  fs.writeFileSync(file, JSON.stringify({ version: 1, generate: [], sessions: [{ firstAudioAt: 0, messages: [
    { t: 0, m: { serverContent: { inputTranscription: { text: 'one' } } } },
    { t: 100, m: { serverContent: { inputTranscription: { text: 'two' } } } },
  ] }] }));
  const heard = [];
  const live = await replayClient(file).live.connect({ callbacks: { onmessage: (m) => heard.push(m.serverContent.inputTranscription.text) } });
  const audio = { audio: { data: '' } };
  live.sendRealtimeInput(audio);
  await sleep(150);
  live.sendRealtimeInput(audio); // still inside the recording's length + 1.5 s: nothing new
  await sleep(50);
  assert.deepEqual(heard, ['one', 'two']);
  await sleep(1700);
  live.sendRealtimeInput(audio); // the audio looped: the recording starts over
  await sleep(150);
  assert.deepEqual(heard, ['one', 'two', 'one', 'two']);
  live.close();
});
