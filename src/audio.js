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
