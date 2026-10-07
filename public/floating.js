// ⧉ Floating captions: an always-on-top window over a video call, a livestream, slides or a movie. Shared by the
// audience page (watch.html) and the personal page (me.html).
// Chrome/Edge desktop: Document Picture-in-Picture (resizable, styled like the page). Elsewhere: a canvas drawn into a
// picture-in-picture video.
import { liveText } from '/common.js';
import { RollUp, tokens } from '/smooth.js';

const canDocPip = 'documentPictureInPicture' in window;
const canVidPip = !canDocPip && document.pictureInPictureEnabled && 'captureStream' in HTMLCanvasElement.prototype;
export const floatingSupported = canDocPip || canVidPip;

/**
 * @param {{ button: HTMLElement, text: () => string, live: () => boolean, caps?: () => any[], onError?: () => void }} o
 *   text: what to show (the last ~220 characters); live: true while the last word is still being spoken.
 *   caps: the paced captions (smooth.js Pacer.shown()): with them, lines roll up like TV captions and never re-wrap.
 * @returns {{ render: () => void, toggle: () => Promise<void> }}
 */
export function floatingCaptions({ button, text, live, caps, onError }) {
  let pipWin = null, pipVid = null, pipCv = null, roll = null;
  let cvStart = null; // canvas: the first word drawn, always the start of a line, so older lines go without re-wrapping
  button.classList.toggle('hidden', !floatingSupported);

  function draw() {
    const g = pipCv.getContext('2d'), W = pipCv.width, H = pipCv.height, pad = 24, lh = 46;
    g.fillStyle = '#111014'; g.fillRect(0, 0, W, H); // ink
    g.font = "700 36px 'Atkinson Hyperlegible Next', system-ui, -apple-system, sans-serif"; g.textBaseline = 'top';
    // Words with where they come from, so the first line can be pinned to a word (see cvStart).
    const list = caps ? caps() : [{ id: 't', text: text(), final: !live() }];
    const words = list.flatMap((c) => tokens(c.text).map((w, i) => ({ id: c.id, i, w: w.trim() })));
    let k = cvStart ? words.findIndex((x) => x.id === cvStart.id && x.i === cvStart.i) : 0;
    if (k < 0) k = Math.max(0, words.length - 40);
    const lines = [];
    let cur = null;
    for (const x of words.slice(k)) {
      const next = cur ? `${cur.text} ${x.w}` : x.w;
      if (cur && g.measureText(next).width > W - pad * 2) { lines.push(cur); cur = { text: x.w, first: x }; } else cur = cur ? { ...cur, text: next } : { text: x.w, first: x };
    }
    if (cur) lines.push(cur);
    if (lines.length > 6) cvStart = lines[lines.length - 4].first; // old lines leave whole: the rest wraps the same
    lines.slice(-3).forEach(({ text: l }, i) => { g.fillStyle = '#FAF8F3'; g.fillText(l, pad, pad + i * lh); }); // paper on ink
  }

  function render() {
    if (pipWin && roll) roll.render(caps());
    else if (pipWin) liveText(pipWin.document.getElementById('t'), text(), !live());
    else if (pipCv) draw();
  }

  async function toggle() {
    try {
      if (pipWin) return pipWin.close();
      if (document.pictureInPictureElement) return await document.exitPictureInPicture();
      if (canDocPip) {
        pipWin = await documentPictureInPicture.requestWindow({ width: 560, height: 170 });
        const d = pipWin.document, root = document.documentElement;
        d.documentElement.style.cssText = root.style.cssText; // accent, text size, reading font
        if (root.dataset.theme) d.documentElement.dataset.theme = root.dataset.theme;
        for (const l of document.querySelectorAll('link[rel="stylesheet"]')) d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: l.href }));
        d.head.append(Object.assign(d.createElement('link'), { rel: 'stylesheet', href: new URL('/pip.css', location.href).href }));
        d.body.className = 'pip-cap';
        d.title = document.title;
        d.body.innerHTML = '<div id="t" aria-live="polite"></div>';
        if (caps) { d.body.classList.add('rolling'); roll = new RollUp(d.getElementById('t')); }
        pipWin.addEventListener('pagehide', () => { pipWin = null; roll = null; button.setAttribute('aria-pressed', 'false'); });
        button.setAttribute('aria-pressed', 'true');
        render();
      } else {
        pipCv = Object.assign(document.createElement('canvas'), { width: 960, height: 186 });
        cvStart = null;
        draw();
        pipVid ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true });
        pipVid.srcObject = pipCv.captureStream();
        await pipVid.play();
        await pipVid.requestPictureInPicture();
        pipVid.addEventListener('leavepictureinpicture', () => { pipCv = null; pipVid.srcObject = null; }, { once: true });
      }
    } catch (e) {
      console.warn('floating captions', e);
      pipWin = null; pipCv = null;
      onError?.();
    }
  }

  button.onclick = toggle;
  return { render, toggle };
}
