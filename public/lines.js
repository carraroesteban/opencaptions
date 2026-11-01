// The wallpaper: a field of fine horizontal lines that bend in the middle with a speech-like rhythm (syllables,
// words, pauses), like sound becoming text. Drawn in the canvas's own text colour, so it follows light and dark.
// Still with prefers-reduced-motion or <html data-still> (a pause button); paused while off screen or in a background tab.

/** Loudness 0..1 of a made-up voice at time t (seconds). */
const voice = (t) => {
  const syl = Math.abs(Math.sin(t * 9.3)) * .6 + Math.abs(Math.sin(t * 4.1 + 1)) * .4;
  const word = (Math.sin(t * 1.7) + 1) / 2;
  const pause = Math.sin(t * .45) > -.55 ? 1 : .15;
  return syl * word * pause;
};

/** @param {HTMLCanvasElement} cv  sized by CSS; its `color` is the lines' colour */
export function lines(cv, { rows = 46 } = {}) {
  const cx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isStill = () => reduce || 'still' in document.documentElement.dataset;
  let W = 0, H = 0, rgb = '128,128,128', visible = true, raf = 0;
  const size = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
    rgb = (getComputedStyle(cv).color.match(/\d+(\.\d+)?/g) || [128, 128, 128]).slice(0, 3).join(',');
  };
  const draw = (ms) => {
    const t = ms / 1000;
    cx.clearRect(0, 0, W, H);
    for (let k = 0; k < rows; k++) {
      const depth = k / rows, y0 = H * (.18 + depth * .8);
      cx.strokeStyle = `rgba(${rgb},${.05 + depth * .16})`;
      cx.lineWidth = .8;
      cx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const u = x / W, bell = Math.exp(-((u - .5) ** 2) / .03);
        const amp = (16 + depth * 120) * bell * (.3 + voice(t * .9 - k * .045 + u * .6) * 1.1);
        const y = y0 - amp * (.6 + .4 * Math.sin(u * 22 + t * 1.3 + k * .4)) - Math.sin(u * 3 + t * .2 + k * .3) * 6;
        if (x) cx.lineTo(x, y); else cx.moveTo(x, y);
      }
      cx.stroke();
    }
  };
  const loop = (ms) => { draw(ms); raf = visible && !document.hidden && !isStill() ? requestAnimationFrame(loop) : 0; };
  const wake = () => { if (!raf && visible && !document.hidden && !isStill()) raf = requestAnimationFrame(loop); };
  size();
  new ResizeObserver(() => { size(); if (isStill()) draw(4000); }).observe(cv);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(cv);
  document.addEventListener('visibilitychange', wake);
  // Light/dark can change while the page is open: pick up the new colour.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { size(); if (isStill()) draw(4000); });
  new MutationObserver(() => { size(); if (isStill()) draw(4000); else wake(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-still'] });
  if (isStill()) draw(4000); else wake();
}
