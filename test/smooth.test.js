// Smooth captions (public/smooth.js): words at the speaker's pace, revisions in place, catching up after a burst.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pacer, tokens } from '../public/smooth.js';

/** A pacer on a fake clock: returns it, what it emitted, and a function that advances time in 40 ms steps. */
function paced() {
  let t = 1000;
  const out = [];
  const p = new Pacer((seg) => out.push(seg), { now: () => t, auto: false });
  const run = (ms) => { for (let x = 0; x < ms; x += 40) { t += 40; p.step(); } };
  return { p, out, run, shownText: () => p.shown().map((c) => c.text).join(' ') };
}
const count = (s) => s.split(/\s+/).filter(Boolean).length;

test('tokens keep the text exactly and split languages written without spaces', () => {
  assert.deepEqual(tokens('Hello there,  world'), ['Hello ', 'there,  ', 'world']);
  assert.equal(tokens('Hola a todos. ¿Cómo están?').join(''), 'Hola a todos. ¿Cómo están?');
  const zh = tokens('今天我们来谈谈远程医疗');
  assert.ok(zh.length > 2, 'Chinese is split into small groups');
  assert.equal(zh.join(''), '今天我们来谈谈远程医疗');
  assert.deepEqual(tokens(''), []);
});

test('a burst of words comes out a word at a time, at about the speaking pace', () => {
  const { p, run, shownText } = paced();
  p.push({ id: 'a', text: 'we gave each clinic a simple tablet and a', final: false });
  assert.equal(shownText(), '', 'nothing yet: the first word comes on the next step');
  const seen = [];
  for (let i = 0; i < 40; i++) { run(80); seen.push(count(shownText())); }
  assert.equal(seen.at(-1), 9, 'everything shown in the end');
  const jumps = seen.map((n, i) => n - (seen[i - 1] ?? 0));
  assert.ok(jumps.every((j) => j <= 2), `never more than two words at once: ${jumps}`);
  assert.ok(seen.findIndex((n) => n === 9) * 80 >= 1000, 'spread over time, not shown at once');
  assert.ok(seen.findIndex((n) => n === 9) * 80 <= 2200, 'never far behind (~1.2 s of words waiting at most)');
});

test('final only once every word is out; history is shown at once', () => {
  const { p, out, run } = paced();
  p.push({ id: 'a', text: 'one two three four', final: true });
  run(100);
  assert.ok(!out.some((s) => s.final && s.text !== 'one two three four'), 'no early final');
  run(3000);
  assert.deepEqual(out.at(-1), { id: 'a', text: 'one two three four', final: true });
  const h = paced();
  h.p.load([{ id: 'x', text: 'said before', final: true }, { id: 'y', text: 'still going', final: false }]);
  assert.equal(h.shownText(), 'said before still going');
});

test('a rewritten word on screen is replaced in place, and the unstable tail waits a moment', () => {
  const { p, run, shownText } = paced();
  p.push({ id: 'a', text: 'the cat sat on', final: false });
  run(3000);
  assert.equal(shownText(), 'the cat sat on');
  p.push({ id: 'a', text: 'the hat sat on the mat today', final: false });
  assert.equal(shownText(), 'the hat sat on', 'corrected at once, nothing new yet');
  run(400);
  assert.ok(count(shownText()) <= 5, 'the last two words of a caption that changed wait for it to settle');
  run(3000);
  assert.equal(shownText(), 'the hat sat on the mat today');
});

test('the last word growing ("conf" → "conference") is not a correction', () => {
  const { p, run, shownText } = paced();
  p.push({ id: 'a', text: 'welcome to the conf', final: false });
  run(3000);
  p.push({ id: 'a', text: 'welcome to the conference and', final: false });
  assert.equal(shownText(), 'welcome to the conference', 'the grown word replaces its start at once');
  run(450); // one word at speaking pace; a correction would hold the tail back for 700 ms
  assert.equal(shownText(), 'welcome to the conference and', 'no hold-back: the text only grew');
});

test('far behind (a reconnect sends a lot at once): jumps ahead, leaving a few words to flow', () => {
  const { p, run, shownText } = paced();
  const long = Array.from({ length: 60 }, (_, i) => `w${i}`).join(' ');
  p.push({ id: 'a', text: long, final: true });
  run(40);
  assert.ok(count(shownText()) >= 50, 'most of it at once');
  run(3000);
  assert.equal(count(shownText()), 60);
});

test('captions come out in order', () => {
  const { p, run, out } = paced();
  p.push({ id: 'a', text: 'first sentence here.', final: true });
  p.push({ id: 'b', text: 'second one', final: false });
  run(200);
  assert.ok(out.every((s) => s.id === 'a'), 'the second waits for the first');
  run(3000);
  assert.equal(out.at(-1).id, 'b');
});
