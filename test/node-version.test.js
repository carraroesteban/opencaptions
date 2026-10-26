import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeProblem } from '../src/node-version.js';

test('only a Node.js with the October 2026 security fixes runs OpenCaptions', () => {
  for (const v of ['22.23.4', '22.24.0', '24.22.1', '24.23.0', '26.12.1', '26.13.0', '28.0.0']) assert.equal(nodeProblem(v), '', v);
  for (const v of ['20.19.5', '22.23.3', '22.9.0', '23.11.0', '24.21.0', '24.22.0', '25.9.0', '26.12.0', '18.20.0']) {
    assert.match(nodeProblem(v), new RegExp(`this computer has ${v.replace(/\./g, '\\.')}.*nodejs\\.org`), v);
  }
});
