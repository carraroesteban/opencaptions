// Offline backup: rooms move to the local engine when the internet goes down, and back once it's stable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Failover } from '../src/failover.js';

function rig({ online = true, local = true, mode = 'auto' } = {}) {
  const net = { online, local };
  const applied = [];
  const f = new Failover({ mode, downAfter: 3, upAfter: 4, probe: async () => net.online, localReady: async () => net.local, apply: (e) => applied.push(e) });
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) await f.check(); };
  return { f, net, applied, tick };
}

test('switches to local after a few failed checks, and back after a stable connection', async () => {
  const { f, net, applied, tick } = rig();
  await tick(5);
  assert.deepEqual(applied, []);
  net.online = false;
  await tick(2);
  assert.equal(f.active, 'gemini'); // one blip is not an outage
  await tick(1);
  assert.equal(f.active, 'local');
  net.online = true;
  await tick(3);
  assert.equal(f.active, 'local'); // wait for a stable connection before switching back
  await tick(1);
  assert.equal(f.active, 'gemini');
  assert.deepEqual(applied, ['local', 'gemini']);
});

test('stays on Gemini when there is no local engine to fall back to', async () => {
  const { f, applied, tick } = rig({ online: false, local: false });
  await tick(10);
  assert.equal(f.active, 'gemini');
  assert.deepEqual(applied, []);
  assert.equal(f.status().online, false);
});

test('manual modes from the dashboard', async () => {
  const { f, net, applied, tick } = rig({ mode: 'cloud' });
  net.online = false;
  await tick(5);
  assert.equal(f.active, 'gemini'); // cloud: never switches by itself
  f.setMode('local');
  assert.equal(f.active, 'local');
  net.online = true;
  await tick(10);
  assert.equal(f.active, 'local'); // local: stays put
  f.setMode('auto'); // online again → back to Gemini right away
  assert.equal(f.active, 'gemini');
  assert.deepEqual(applied, ['local', 'gemini']);
  net.local = false;
  await tick(1);
  assert.throws(() => f.setMode('local'), /not running/);
  assert.throws(() => f.setMode('nope'), /auto\|cloud\|local/);
});
