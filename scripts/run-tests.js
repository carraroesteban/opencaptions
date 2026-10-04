#!/usr/bin/env node
// npm test: every test/*.test.js with node:test. Listing the files here (instead of a bare `node --test`) keeps the
// runner out of downloaded code in local/ (e.g. a whisper.cpp checkout ships its own test-*.js); a glob argument
// wouldn't work either, because Windows shells and Node 20 don't expand it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
