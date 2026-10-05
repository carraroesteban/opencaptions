// Checks that run before anything else starts, so a broken setup ends with one clear sentence and the fix, not a
// stack trace (and not Docker restarting the container forever without saying why).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.js';
import * as tty from './tty.js';

/** The data folder (transcripts, settings, passwords) must be writable. */
function checkDataDir(dir = config.dataDir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe);
    return;
  } catch (e) {
    const docker = !!process.env.OC_DOCKER;
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    console.error(`\n${tty.sym.fail} OpenCaptions can't write to its data folder ${tty.c.bold(dir)} (${e.code || e.message}).`);
    console.error(tty.c.gray('  It keeps the transcripts, the settings and the passwords there.\n'));
    if (docker) {
      console.error(`  In Docker on Linux, the folder you mounted must belong to the container's user (${uid ?? 1000}). On the server:`);
      console.error(`\n    ${tty.c.bold(`sudo chown -R ${uid ?? 1000}:${uid ?? 1000} ./data`)}\n`);
      console.error(tty.c.gray('  Or use a named volume instead of a folder (-v opencaptions-data:/app/data), which Docker sets up by itself.'));
    } else {
      console.error(`  Give your user (${os.userInfo().username}) write access to it, or point DATA_DIR at a folder you can write to.`);
    }
    console.error('');
    process.exit(78); // EX_CONFIG: a setup problem, not a crash
  }
}

checkDataDir();
