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
