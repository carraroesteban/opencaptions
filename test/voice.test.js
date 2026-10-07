// Voice or music (src/voice.js): rooms play music between talks; captions pause for it, never for a speaker.
// The thresholds were measured on real recordings and 19 pieces of music (see the file's header); these tests keep
// the promise that matters most with the talks in this repository: speech is never taken for music, even over music.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VoiceDetector, VoiceFeatures } from '../src/voice.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wav = (name) => { const b = fs.readFileSync(path.join(ROOT, 'samples', name)); return new Int16Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length - ((b.length - 44) % 2))); };

/** Synthetic music: chords with harmonics changing every half second, a soft bass and a little noise (16 kHz). */
function music(sec, gain = 0.25) {
  const out = new Int16Array(sec * 16000);
  const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < out.length; i++) {
    const t = i / 16000, ch = chords[Math.floor(t * 2) % chords.length];
    let v = 0;
    for (const f of ch) for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h * 3);
    v += 0.5 * Math.sin(2 * Math.PI * (ch[0] / 2) * t) + 0.03 * rnd();
    out[i] = Math.max(-32767, Math.min(32767, v * gain * 32767 / 2));
  }
  return out;
}
const mix = (a, b, gb) => Int16Array.from(a, (v, i) => Math.max(-32767, Math.min(32767, v + (b[i % b.length] || 0) * gb)));

/** Runs a detector over audio in 100 ms chunks; returns the states it went through, with the time of each. */
function run(pcm) {
  const d = new VoiceDetector();
  const states = [];
  for (let o = 0; o + 1600 <= pcm.length; o += 1600) {
    const s = d.push(pcm.subarray(o, o + 1600));
    if (s !== states.at(-1)?.s) states.push({ s, at: o / 16000 });
  }
  return states;
}

test('talks are never taken for music (English and Spanish recordings)', () => {
  for (const f of ['talk-en.wav', 'talk-es.wav']) {
    const states = run(wav(f));
    assert.ok(!states.some((x) => x.s === 'music'), `${f}: ${JSON.stringify(states)}`);
    assert.ok(states.some((x) => x.s === 'voice'), `${f} is heard as a voice`);
  }
});

test('a talk over background music is still a voice', () => {
  const states = run(mix(wav('talk-en.wav'), music(40), 0.6));
  assert.ok(!states.some((x) => x.s === 'music'), JSON.stringify(states));
});

test('music is detected after about ten seconds, and a voice brings captions back', () => {
  const m = run(music(30));
  const at = m.find((x) => x.s === 'music')?.at;
  assert.ok(at != null && at >= 10 && at <= 16, `music at ${at}`);
  const both = run(Int16Array.from([...music(20), ...wav('talk-es.wav')]));
  const back = both.findIndex((x) => x.s === 'voice' && x.at > 20);
  assert.ok(back > 0 && both[back].at < 28, `voice again: ${JSON.stringify(both)}`);
});

test('silence is quiet, not music', () => {
  const states = run(new Int16Array(16000 * 20));
  assert.deepEqual(states.map((x) => x.s), ['unknown', 'quiet']);
  const f = new VoiceFeatures();
  f.push(new Int16Array(16000 * 3));
  assert.equal(f.features().energy, 0);
});
