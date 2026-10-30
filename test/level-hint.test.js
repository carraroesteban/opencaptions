// The sound page's level line: steady through the pauses of a talk, a warning only for a real problem that lasts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelHint } from '../public/capture.js';

const secs = (n, fn) => Array.from({ length: n * 10 }, (_, i) => fn(i)); // 100 ms levels
const room = (i) => -62 + (i % 7) * 0.5; // a quiet room's noise floor, around -60 dB
const talk = (i) => (i % 10 < 6 ? -24 - (i % 3) : -55); // a speaker at a good level, with breaths between words

test('a pause between sentences, even 9 s of it, keeps "Good level"; nobody speaking for 10 s is just listening, not a warning', () => {
  assert.deepEqual(levelHint(secs(1, talk)), ['lvGood', 'ok'], 'good news at once');
  assert.deepEqual(levelHint([...secs(1, talk), ...secs(9, room)]), ['lvGood', 'ok']);
  assert.deepEqual(levelHint(secs(10, room)), ['lvWait', '']);
  assert.deepEqual(levelHint(secs(3, room)), ['lvWait', ''], 'the first seconds say nothing alarming');
  const cough = secs(10, (i) => (i >= 40 && i < 43 ? -40 : room(i)));
  assert.deepEqual(levelHint(cough), ['lvWait', ''], 'a cough in a quiet room isn\'t a voice too low');
});

test('warnings only after 10 s of them: no signal at all, a voice that stays too low to caption, or clipping', () => {
  assert.deepEqual(levelHint(secs(9, () => -100)), ['lvWait', ''], 'not yet');
  assert.deepEqual(levelHint(secs(10, () => -100)), ['lvSilent', 'warn'], 'a muted microphone');
  assert.deepEqual(levelHint(secs(10, (i) => talk(i) - 22)), ['lvQuiet', 'warn'], 'someone talking at about -46 dB');
  assert.deepEqual(levelHint(secs(2, (i) => (i % 10 < 4 ? -3 : -20))), ['lvLoud', 'bad']);
  assert.deepEqual(levelHint(secs(10, (i) => (i === 50 ? -4 : talk(i)))), ['lvGood', 'ok'], 'one loud clap isn\'t "too loud"');
});
