// Is it a voice or music? Rooms play music between talks (walk-in music, sponsor videos, breaks), and captioning a
// song costs money and fills the screens with lyrics or nonsense. This tells speech from music in a room's audio, on
// the server, whatever sends it (the room's browser, the agent, a stream).
//
// The feature: how much the sound's brightness (spectral centroid) moves within 2 seconds. Speech jumps all the time
// (vowels, then s, t, f, then a pause), even over background music; music keeps a steadier timbre. Measured on
// talks in English, Spanish and Portuguese (real recordings and four synthetic voices, alone and over music) and on
// 19 pieces of pop, electronic, orchestral and acoustic music:
//   speech alone: 0.6–1.0 (10th–90th percentile) · music: mostly 0.1–0.4 · speech over loud music: down to 0.2.
// That last one (a live stream walking through a party: 15 minutes of nonstop talk) was half "music" with brightness
// alone. So a 2-second window is music only if the voice's band (300–4000 Hz) is steady too: its loudness swings
// little (std of log energy under 0.45; that stream 0.48–0.99, talks 1–2, songs 0.13–0.64) or its spectrum barely
// changes frame to frame (flux under 0.26; speech 0.26–0.44, songs 0.19–0.30). Retested on those talks, the stream,
// talks mixed with a song, 9 full songs and 25 GarageBand loops: no speech taken for music (the stream peaks at 5 s
// of the 10 needed), every song found, most within 12 s; bare drums and lone instrument loops mostly are not.
// The decision is slow and one-sided on purpose: missing a song is cheap, cutting a speaker's captions is not.

const FRAME = 320; // 20 ms at 16 kHz
const WINDOW = 100; // frames: 2 s
const N = 512; // FFT size (the 320-sample frame, zero-padded)

export const MUSIC_BELOW = 0.4;
export const VOICE_ABOVE = 0.55;
export const SWING_BELOW = 0.45;
export const FLUX_BELOW = 0.26;

// Hann window and twiddle factors, computed once.
const HANN = Float64Array.from({ length: FRAME }, (_, k) => 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (FRAME - 1)));
const COS = Float64Array.from({ length: N / 2 }, (_, k) => Math.cos((-2 * Math.PI * k) / N));
const SIN = Float64Array.from({ length: N / 2 }, (_, k) => Math.sin((-2 * Math.PI * k) / N));

/** In-place radix-2 FFT. */
function fft(re, im) {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const step = N / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = COS[k * step], wi = SIN[k * step];
        const a = i + k, b = a + len / 2;
        const vr = re[b] * wr - im[b] * wi, vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr; im[b] = im[a] - vi;
        re[a] += vr; im[a] += vi;
      }
    }
  }
}

/** The last 2 seconds, frame by frame: energy and spectral centroid. */
export class VoiceFeatures {
  constructor() {
    this.e = new Float64Array(WINDOW);
    this.c = new Float64Array(WINDOW);
    this.s = new Float64Array(WINDOW); // the voice band's log energy
    this.fd = new Float64Array(WINDOW); // its change from the frame before, and its total (flux = sum fd / sum ft)
    this.ft = new Float64Array(WINDOW);
    this.prev = new Float64Array(121); // bins 8–128 of the frame before
    this.n = 0;
    this.i = 0;
    this.rest = new Int16Array(0);
    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
  }

  /** @param {Buffer|Int16Array} pcm  16 kHz mono PCM16 */
  push(pcm) {
    // A Buffer from the network can start at an odd byte: an Int16Array view needs an even one, so copy then.
    const s = pcm instanceof Int16Array ? pcm
      : pcm.byteOffset % 2 ? new Int16Array(Uint8Array.prototype.slice.call(pcm, 0, pcm.byteLength & ~1).buffer)
        : new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength >> 1);
    let buf = s;
    if (this.rest.length) { buf = new Int16Array(this.rest.length + s.length); buf.set(this.rest); buf.set(s, this.rest.length); }
    let o = 0;
    for (; o + FRAME <= buf.length; o += FRAME) {
      const { re, im } = this;
      re.fill(0); im.fill(0);
      let e = 0;
      for (let k = 0; k < FRAME; k++) { const v = buf[o + k] / 32768; e += v * v; re[k] = v * HANN[k]; }
      fft(re, im);
      let tot = 0, cen = 0, band = 0, fd = 0, ft = 0;
      for (let k = 0; k <= N / 2; k++) {
        const m = Math.hypot(re[k], im[k]);
        tot += m; cen += k * m;
        if (k >= 10 && k <= 109) band += m * m; // 310–3400 Hz
        if (k >= 8 && k <= 128) { const p = this.prev[k - 8]; fd += Math.abs(m - p); ft += m + p; this.prev[k - 8] = m; } // 250–4000 Hz
      }
      this.e[this.i] = e / FRAME;
      this.c[this.i] = tot ? cen / tot : 0;
      this.s[this.i] = Math.log10(band + 1e-9);
      this.fd[this.i] = fd;
      this.ft[this.i] = ft;
      this.i = (this.i + 1) % WINDOW;
      this.n = Math.min(WINDOW, this.n + 1);
    }
    this.rest = buf.slice(o);
  }

  get ready() { return this.n >= WINDOW; }

  /**
   * Over the last 2 s: { energy: mean square (0..1), spread: centroid's coefficient of variation, swing: std of the
   * voice band's log energy, flux: how much the voice band's spectrum changes frame to frame (0..1) }.
   */
  features() {
    const n = this.n || 1;
    let me = 0, mc = 0, ms = 0, fd = 0, ft = 0;
    for (let k = 0; k < this.n; k++) { me += this.e[k]; mc += this.c[k]; ms += this.s[k]; fd += this.fd[k]; ft += this.ft[k]; }
    me /= n; mc /= n; ms /= n;
    let v = 0, vs = 0;
    for (let k = 0; k < this.n; k++) { v += (this.c[k] - mc) ** 2; vs += (this.s[k] - ms) ** 2; }
    return { energy: me, spread: mc ? Math.sqrt(v / n) / mc : 0, swing: Math.sqrt(vs / n), flux: ft ? fd / ft : 0 };
  }
}

/**
 * Speech/music for a room, 100 ms at a time. state: 'voice', 'music' or 'quiet' (and 'unknown' at first).
 * onChange(state) fires when it changes.
 */
export class VoiceDetector {
  /** @param {{ onChange?: (s: string) => void, musicSec?: number, voiceSec?: number, minEnergy?: number }} [o] */
  constructor({ onChange = () => {}, musicSec = 10, voiceSec = 3, minEnergy = 2e-6 } = {}) {
    this.f = new VoiceFeatures();
    this.onChange = onChange;
    this.state = 'unknown';
    this.musicSec = musicSec;
    this.voiceSec = voiceSec;
    this.minEnergy = minEnergy;
    this.musicMs = 0;
    this.voiceMs = 0;
    this.quietMs = 0;
    this.last = null;
  }

  /** One 2-second window: 'music', 'voice', 'quiet' or 'unsure'. */
  static judge({ energy, spread, swing, flux }, minEnergy = 2e-6) {
    if (energy < minEnergy) return 'quiet';
    // Steady brightness, and a voice band that neither swings in loudness nor changes shape (both would be a voice).
    if (spread < MUSIC_BELOW && (swing < SWING_BELOW || flux < FLUX_BELOW)) return 'music';
    if (spread > VOICE_ABOVE) return 'voice';
    return 'unsure';
  }

  /** @param {Buffer|Int16Array} pcm  100 ms of 16 kHz mono PCM16 */
  push(pcm, ms = 100) {
    this.f.push(pcm);
    if (!this.f.ready) return this.state;
    const v = VoiceDetector.judge((this.last = this.f.features()), this.minEnergy);
    this.musicMs = v === 'music' ? this.musicMs + ms : v === 'voice' ? 0 : Math.max(0, this.musicMs - ms);
    this.voiceMs = v === 'voice' ? this.voiceMs + ms : v === 'music' ? 0 : Math.max(0, this.voiceMs - ms / 2);
    this.quietMs = v === 'quiet' ? this.quietMs + ms : 0;
    let next = this.state;
    if (this.musicMs >= this.musicSec * 1000) next = 'music';
    else if (this.voiceMs >= this.voiceSec * 1000) next = 'voice';
    else if (this.quietMs >= 3000) next = 'quiet';
    if (next !== this.state) { this.state = next; this.onChange(next); }
    return this.state;
  }
}
