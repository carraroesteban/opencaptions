// Process & host resource metrics for the dashboard, /healthz and /metrics.
import os from 'node:os';
import { execFile } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const RES = 10; // ms; the histogram measures timer ticks, so subtract the resolution to get the extra lag
const loop = monitorEventLoopDelay({ resolution: RES });
loop.enable();
let lag = { p50: 0, p99: 0, max: 0 };
const ms = (ns) => Math.max(0, ns / 1e6 - RES);
let lastCpu = process.cpuUsage();
let lastAt = process.hrtime.bigint();
let cpuPct = 0;

// Sample CPU every 2 s: % of ONE core used by this process (can exceed 100 % with worker threads).
setInterval(() => {
  const now = process.hrtime.bigint();
  const cpu = process.cpuUsage(lastCpu);
  const elapsedUs = Number(now - lastAt) / 1000;
  cpuPct = elapsedUs > 0 ? ((cpu.user + cpu.system) / elapsedUs) * 100 : 0;
  lastCpu = process.cpuUsage();
  lastAt = now;
  if (loop.count) lag = { p50: ms(loop.percentile(50)), p99: ms(loop.percentile(99)), max: ms(loop.max) };
  loop.reset();
}, 2000).unref();

// macOS counts its file cache as used, so os.freemem() reads ~0 and "memory used" ~100 %. There, ask vm_stat for
// what's really available (free + inactive + speculative + purgeable pages), every 10 s in the background.
let macFree = null;
function readVmStat() {
  execFile('vm_stat', (err, out) => {
    if (err) return;
    const page = Number(/page size of (\d+)/.exec(out)?.[1] || 4096);
    const pages = (k) => Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(out)?.[1] || 0);
    macFree = (pages('free') + pages('inactive') + pages('speculative') + pages('purgeable')) * page;
  });
}
if (process.platform === 'darwin') { readVmStat(); setInterval(readVmStat, 10_000).unref(); }
const freeMem = () => macFree ?? os.freemem();

export function systemStats() {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  return {
    cpuPct: +cpuPct.toFixed(1),
    rssMB: Math.round(mem.rss / 1048576),
    heapMB: Math.round(mem.heapUsed / 1048576),
    sysMemPct: +(((total - freeMem()) / total) * 100).toFixed(0),
    sysMemGB: +(total / 1073741824).toFixed(1),
    load1: +os.loadavg()[0].toFixed(2),
    cores: os.cpus().length,
    loopLagMs: { p50: +lag.p50.toFixed(1), p99: +lag.p99.toFixed(1), max: +lag.max.toFixed(1) },
    node: process.version,
  };
}
