// Friendly line illustrations (inline SVG, so they follow the theme): strokes use currentColor, the highlighter
// uses --hl with ink strokes on top (lime only ever sits under ink).
const svg = (vb, body, label = '') => `<svg class="illo" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

/** A speaker on stage, their words landing as captions on a phone. */
export const stage = svg('0 0 280 160', `
  <circle cx="58" cy="44" r="15"/>
  <path d="M30 118c0-20 12-34 28-34s28 14 28 34"/>
  <path d="M80 70l14-6M84 80l16 0M80 90l14 6" opacity=".55"/>
  <path d="M20 118h84"/>
  <path d="M96 118v26M60 118v26" opacity=".55"/>
  <rect x="160" y="14" width="88" height="136" rx="16"/>
  <path d="M192 24h24"/>
  <rect x="172" y="88" width="34" height="13" rx="4" fill="var(--hl)" stroke="none"/>
  <path d="M174 56h60M174 72h44" opacity=".5"/>
  <path d="M174 94.5h30" stroke="var(--hl-ink)"/><path d="M212 94.5h22"/>
  <path d="M174 116h52" opacity=".45"/>
  <path d="M174 128h36" opacity=".45"/>
  <path d="M116 66c10-10 22-12 34-6" stroke-dasharray="2 6"/>`);

/** An open book of transcripts. */
export const library = svg('0 0 64 48', `
  <path d="M32 10c-6-4-15-5-24-4v34c9-1 18 0 24 4 6-4 15-5 24-4V6c-9-1-18 0-24 4z"/>
  <path d="M32 10v34"/>
  <rect x="13" y="19" width="12" height="6" rx="2" fill="var(--hl)" stroke="none"/>
  <path d="M14 22h10" stroke="var(--hl-ink)"/><path d="M14 30h12M38 16h12M38 22h12M38 28h9" opacity=".55"/>`);

/** Quiet room: nothing said yet. */
export const quiet = svg('0 0 120 80', `
  <rect x="14" y="14" width="92" height="52" rx="12"/>
  <path d="M30 34h34M30 46h22" opacity=".45"/>
  <path d="M84 30v20" opacity=".8"/>`);

/** Small line icons for buttons (16px, currentColor). */
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-1.4-1.2-1.6-1.2-2.9 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5C21 6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  pin: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  newtalk: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.1-7.5 9.5-4.3-1.4-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12.2l2.2 2.2 4.3-4.4"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  sliders: '<path d="M6 4v16M12 4v16M18 4v16"/><rect x="4" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="16" y="15" width="4" height="3" rx="1"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  wand: '<path d="M4 20L15 9M13 7l4 4"/><path d="M18 3v3M16.5 4.5h3M20 9v2M19 10h2M9 3v2M8 4h2"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1-.5 9.5z"/>',
  offline: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 2-3.4M12.3 3.1A6 6 0 0 1 18 8.5a4.8 4.8 0 0 1 2.2 8.6M17.5 18H7"/><path d="M3 3l18 18"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.5c-.4-.9-1.4-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2.1-.6-2.5-1.5M12 6.5v1.5M12 16v1.5"/>',
};
export const icon = (k) => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;
/** Put an icon in front of every [data-icon] element. */
export const mountIcons = (root = document) => root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); el.dataset.iconDone = ''; });
