// AudioWorklet: capture → mono → 16 kHz PCM16, posted in 100 ms chunks.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channel = options.processorOptions?.channel || 'mix'; // 'mix' | 'left' | 'right'
    this.gain = options.processorOptions?.gain || 1;
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.acc = 0;
    this.accN = 0;
    this.out = new Int16Array(1600);
    this.outI = 0;
    this.port.onmessage = (e) => { if (e.data?.gain) this.gain = e.data.gain; };
  }

  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const L = inp[0];
    const R = inp[1] || inp[0];
    for (let i = 0; i < L.length; i++) {
      const s = this.channel === 'left' ? L[i] : this.channel === 'right' ? R[i] : (L[i] + R[i]) * 0.5;
      // Box-filter decimation: average all input samples that fall in one output sample.
      this.acc += s;
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let v = (this.acc / this.accN) * this.gain;
        this.acc = 0;
        this.accN = 0;
        v = Math.max(-1, Math.min(1, v));
        this.out[this.outI++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.outI === this.out.length) {
          const buf = this.out.buffer;
          this.port.postMessage(buf, [buf]);
          this.out = new Int16Array(1600);
          this.outI = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
