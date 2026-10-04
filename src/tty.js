// Terminal output for the server and the command-line tools: the brand badge, colours, spinners and progress bars
// (think Homebrew). No dependencies, so scripts/start.js can use it before `npm install`. When the output isn't a
// terminal (a log file, Docker, CI) or NO_COLOR is set, everything degrades to plain lines: no escape codes, no
// animation, one line per step.
const out = process.stdout;
const env = process.env;
export const isTTY = !!out.isTTY && env.TERM !== 'dumb';
export const useColor = isTTY && !('NO_COLOR' in env) && !env.CI;
const truecolor = /truecolor|24bit/i.test(env.COLORTERM || '') || !!env.WT_SESSION;
// The classic Windows console may lack the braille and box glyphs; Windows Terminal (WT_SESSION) has them.
const fancy = process.platform !== 'win32' || !!env.WT_SESSION || env.TERM_PROGRAM === 'vscode';

const sgr = (open, close = 0) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
export const c = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  italic: sgr(3, 23),
  underline: sgr(4, 24),
  red: sgr(31, 39),
  green: sgr(32, 39),
  yellow: sgr(33, 39),
  cyan: sgr(36, 39),
  gray: sgr(90, 39),
  // Spinners and bars: the terminal's own green, readable on light and dark themes. (Lime as text would vanish on a
  // light terminal; the brand keeps lime behind ink, see badge().)
  accent: sgr(32, 39),
};

/** Ink on lime, the only way the brand shows lime as a background. Reads the same on light and dark terminals. */
export function badge(text) {
  if (!useColor) return `[ ${text} ]`;
  const bg = truecolor ? '\x1b[48;2;212;255;58m\x1b[38;2;17;16;20m' : '\x1b[48;5;191m\x1b[38;5;233m';
  return `${bg}\x1b[1m ${text} \x1b[0m`;
}

export const sym = fancy
  ? { ok: c.green('✔'), warn: c.yellow('▲'), fail: c.red('✖'), info: c.cyan('•'), arrow: c.accent('➜'), dot: c.gray('·') }
  : { ok: c.green('√'), warn: c.yellow('!'), fail: c.red('×'), info: c.cyan('-'), arrow: c.accent('>'), dot: c.gray('-') };

export const ok = (s) => console.log(`${sym.ok} ${s}`);
export const info = (s) => console.log(`${sym.info} ${s}`);
export const warn = (s) => console.log(`${sym.warn} ${s}`);
export const fail = (s) => console.log(`${sym.fail} ${s}`);

/** "OpenCaptions" with its mark, for the top of every tool's output. */
export const title = (subtitle = '') => `${badge('O━ OpenCaptions')}${subtitle ? ` ${c.bold(subtitle)}` : ''}`;

const frames = fancy ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : ['-', '\\', '|', '/'];
let hidden = false;
const hideCursor = () => { if (isTTY && !hidden) { out.write('\x1b[?25l'); hidden = true; } };
const showCursor = () => { if (hidden) { out.write('\x1b[?25h'); hidden = false; } };
process.on('exit', showCursor);

const secs = (ms) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);

/**
 * A line with a spinner while something runs; it turns into ✔ / ▲ / ✖ when it ends. After a few seconds it shows
 * how long it has been going, so a slow step never looks frozen.
 * @param {string} text
 */
export function spinner(text) {
  const t0 = Date.now();
  let label = text, i = 0, timer = null;
  const draw = () => {
    const el = Date.now() - t0 > 3000 ? c.gray(` ${secs(Date.now() - t0)}`) : '';
    out.write(`\r\x1b[2K${c.accent(frames[i++ % frames.length])} ${label}${el}`);
  };
  if (isTTY) { hideCursor(); draw(); timer = setInterval(draw, 80); timer.unref?.(); } else console.log(`${sym.info} ${text}…`);
  const end = (mark, s) => {
    if (timer) { clearInterval(timer); timer = null; out.write('\r\x1b[2K'); showCursor(); }
    if (s !== null) console.log(`${mark} ${s ?? label}`);
  };
  return {
    /** @param {string} s */ update(s) { label = s; if (!isTTY) console.log(`  ${s}`); },
    /** @param {string} [s] */ succeed(s) { end(sym.ok, s); },
    /** @param {string} [s] */ warn(s) { end(sym.warn, s); },
    /** @param {string} [s] */ fail(s) { end(sym.fail, s); },
    /** Clear the line without printing anything (the caller prints its own result). */ stop() { end('', null); },
    elapsed: () => Date.now() - t0,
  };
}

const size = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.max(0, Math.round(n / 1e6))} MB`);

/**
 * A download progress bar: ▕██████░░░░▏ 42 %  1.2 GB / 2.9 GB · 12 MB/s · 2 min left
 * @param {string} text
 */
export function progress(text) {
  const t0 = Date.now();
  let last = 0, label = text, shown = false;
  if (!isTTY) console.log(`${sym.info} ${text}…`);
  else hideCursor();
  const width = () => Math.max(10, Math.min(30, (out.columns || 80) - 60));
  return {
    /** @param {number} got @param {number} [total] @param {string} [status] */
    update(got, total = 0, status) {
      if (status) label = status;
      if (!isTTY || Date.now() - last < 100) return;
      last = Date.now();
      const rate = got / Math.max(0.5, (Date.now() - t0) / 1000);
      let line = `${c.accent(frames[Math.floor(Date.now() / 80) % frames.length])} ${label}  `;
      if (total) {
        const w = width(), f = Math.min(w, Math.round((got / total) * w));
        const left = rate > 0 ? (total - got) / rate * 1000 : 0;
        line += `${c.gray('▕')}${c.accent('█'.repeat(f))}${c.gray('░'.repeat(w - f))}${c.gray('▏')} ${String(Math.floor((got / total) * 100)).padStart(3)} %  ${c.gray(`${size(got)} / ${size(total)} · ${size(rate)}/s${left > 3000 ? ` · ${secs(left)} left` : ''}`)}`;
      } else line += c.gray(`${size(got)} · ${size(rate)}/s`);
      out.write(`\r\x1b[2K${line}`);
      shown = true;
    },
    /** @param {string} [s] */ succeed(s) { if (shown) out.write('\r\x1b[2K'); showCursor(); console.log(`${sym.ok} ${s ?? text}${c.gray(` (${secs(Date.now() - t0)})`)}`); },
    /** @param {string} [s] */ fail(s) { if (shown) out.write('\r\x1b[2K'); showCursor(); console.log(`${sym.fail} ${s ?? text}`); },
  };
}

/**
 * Aligned "label   value" rows, for summaries like the server's ready screen.
 * @param {Array<[string, string] | null>} rows  null = blank line
 */
export function table(rows, { indent = 2 } = {}) {
  const w = Math.max(...rows.filter(Boolean).map((r) => r[0].length));
  for (const r of rows) console.log(r ? `${' '.repeat(indent)}${c.gray(r[0].padEnd(w))}   ${r[1]}` : '');
}
