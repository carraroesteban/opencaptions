// PCM16LE mono helpers.
export const SAMPLE_RATE = 16000;
export const CHUNK_BYTES = 3200; // 100 ms @ 16 kHz, 16-bit

export function rms(buf) {
  const n = buf.length >> 1;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = buf.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

/** Re-chunks an arbitrary PCM byte stream into fixed 100 ms chunks. */
export class Chunker {
  constructor(onChunk, size = CHUNK_BYTES) {
    this.onChunk = onChunk;
    this.size = size;
    this.pending = Buffer.alloc(0);
  }
  push(buf) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, buf]) : buf;
    while (this.pending.length >= this.size) {
      this.onChunk(this.pending.subarray(0, this.size));
      this.pending = this.pending.subarray(this.size);
    }
  }
}

// G.711 μ-law: 16-bit samples as 8 bits (logarithmic steps, fine for speech), half the bytes of PCM16. The room's
// sound goes to phones in it (src/server.js, docs/accessibility.md); public/common.js decodes it.
const MU_BIAS = 0x84;
const MU_CLIP = 32635;
// Segment (exponent) of a biased magnitude, by its top bits.
const MU_EXP = Uint8Array.from({ length: 256 }, (_, i) => (i ? Math.min(7, Math.floor(Math.log2(i))) : 0));

/** PCM16LE mono → μ-law bytes (one per sample). */
export function muLaw(pcm) {
  const n = pcm.length >> 1;
  const out = Buffer.allocUnsafe(n);
  for (let i = 0; i < n; i++) {
    let s = pcm.readInt16LE(i * 2);
    const sign = s < 0 ? 0x80 : 0;
    if (sign) s = -s;
    if (s > MU_CLIP) s = MU_CLIP;
    s += MU_BIAS;
    const exp = MU_EXP[(s >> 7) & 0xff];
    out[i] = ~(sign | (exp << 4) | ((s >> (exp + 3)) & 0x0f)) & 0xff;
  }
  return out;
}

/** μ-law bytes → Int16Array. */
export function muLawDecode(bytes) {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const u = ~bytes[i] & 0xff;
    const exp = (u >> 4) & 7;
    const s = ((((u & 0x0f) << 3) + MU_BIAS) << exp) - MU_BIAS;
    out[i] = u & 0x80 ? -s : s;
  }
  return out;
}
