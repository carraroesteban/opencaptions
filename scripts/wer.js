// Word error rate against a reference script (scripts/check-local.js, scripts/compare-transcribe.js).

export function words(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean); }

/** Word error rate against the part of the script that was played (best-matching prefix length). */
export function bestPrefixWer(ref, h) {
  let best = 1;
  for (let n = Math.max(1, h.length - 25); n <= Math.min(ref.length, h.length + 25); n++) best = Math.min(best, editDistance(ref.slice(0, n), h) / n);
  return best;
}
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
