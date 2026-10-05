// ⧉ Floating captions: an always-on-top window over a video call, a livestream, slides or a movie. Shared by the
// audience page (watch.html) and the personal page (me.html).
// Chrome/Edge desktop: Document Picture-in-Picture (resizable, styled like the page). Elsewhere: a canvas drawn into a
// picture-in-picture video.
import { liveText } from '/common.js';

const canDocPip = 'documentPictureInPicture' in window;
const canVidPip = !canDocPip && document.pictureInPictureEnabled && 'captureStream' in HTMLCanvasElement.prototype;
export const floatingSupported = canDocPip || canVidPip;

/**
 * @param {{ button: HTMLElement, text: () => string, live: () => boolean, onError?: () => void }} o
 *   text: what to show (the last ~220 characters); live: true while the last word is still being spoken.
 * @returns {{ render: () => void, toggle: () => Promise<void> }}
 */
export function floatingCaptions({ button, text, live, onError }) {
  let pipWin = null, pipVid = null, pipCv = null;
  button.classList.toggle('hidden', !floatingSupported);

  function draw() {
    const g = pipCv.getContext('2d'), W = pipCv.width, H = pipCv.height, pad = 24, lh = 46;
    g.fillStyle = '#111014'; g.fillRect(0, 0, W, H); // ink
    g.font = "700 36px 'Atkinson Hyperlegible Next', system-ui, -apple-system, sans-serif"; g.textBaseline = 'top';
    const lines = [];
    let cur = '';
    for (const w of text().split(/\s+/)) {
      const next = cur ? `${cur} ${w}` : w;
      if (cur && g.measureText(next).width > W - pad * 2) { lines.push(cur); cur = w; } else cur = next;
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(-3);
    shown.forEach((l, i) => {
      const y = pad + i * lh;
      const cut = i === shown.length - 1 && live() ? l.lastIndexOf(' ') + 1 : l.length;
      g.fillStyle = '#FAF8F3'; g.fillText(l.slice(0, cut), pad, y); // paper
      if (cut < l.length) { // live word: ink on a lime highlighter
        const x = pad + g.measureText(l.slice(0, cut)).width, w = g.measureText(l.slice(cut)).width;
        g.fillStyle = '#D4FF3A'; g.fillRect(x - 4, y - 3, w + 8, lh - 4);
        g.fillStyle = '#111014'; g.fillText(l.slice(cut), x, y);
      }
    });
  }

  function render() {
    if (pipWin) liveText(pipWin.document.getElementById('t'), text(), !live());
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
        pipWin.addEventListener('pagehide', () => { pipWin = null; button.setAttribute('aria-pressed', 'false'); });
        button.setAttribute('aria-pressed', 'true');
        render();
      } else {
        pipCv = Object.assign(document.createElement('canvas'), { width: 960, height: 186 });
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
