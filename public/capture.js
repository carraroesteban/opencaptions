// Audio capture shared by the audio page (ingest.html) and the personal page (me.html): a microphone, or the sound of a
// tab or the whole computer (screen sharing with audio), turned into 16 kHz PCM16 chunks by /pcm-worklet.js.

/** A microphone. `raw`: no voice processing (a sound desk); otherwise the browser cleans up a laptop mic. */
export async function openMic(ctx, { deviceId = '', raw = false } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw, channelCount: raw ? 2 : 1,
  } });
  return { stream, src: ctx.createMediaStreamSource(stream) };
}

/**
 * What the computer plays: the browser asks which tab, window or screen to share. Chrome and Edge on Windows can
 * share the whole computer's sound ("Share system audio"); elsewhere, a tab's sound (a call or video in a tab).
 * Throws `no-audio` when the person shared without sound.
 */
export async function openScreenAudio(ctx) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // required by browsers to show the picker; the picture is never used
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: 'include', windowAudio: 'system', selfBrowserSurface: 'exclude',
  });
  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw Object.assign(new Error('no-audio'), { code: 'no-audio' });
  }
  stream.getVideoTracks().forEach((t) => (t.enabled = false));
  return { stream, src: ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())) };
}

/**
 * Start capturing `source`: 'mic', 'screen' (what the computer plays) or 'both'. `onPcm(ArrayBuffer)` gets 100 ms
 * of 16 kHz mono PCM16; `onEnded()` runs when a source goes away (a mic unplugged, "Stop sharing" clicked).
 * Returns { stop(), setGain(g), levels(), stream, ctx }; levels() is each source's level now, for a meter per source:
 * [{ kind: 'screen' | 'mic', db }], the computer's sound first.
 */
export async function capture({ source, deviceId = '', raw = false, channel = 'mix', gain = 1, onPcm, onEnded }) {
  const ctx = new AudioContext();
  try {
    // "both": the computer's sound and the microphone, mixed. The screen picker first, before anything else: browsers
    // only show it right after a click, and the microphone prompt would use that moment up.
    const inputs = [];
    const release = () => inputs.forEach((x) => x.stream.getTracks().forEach((tk) => tk.stop()));
    try {
      if (source === 'screen' || source === 'both') inputs.push({ kind: 'screen', ...await openScreenAudio(ctx) });
      if (source !== 'screen') inputs.push({ kind: 'mic', ...await openMic(ctx, { deviceId, raw }) });
      await ctx.audioWorklet.addModule('/pcm-worklet.js');
    } catch (e) { release(); throw e; }
    const node = new AudioWorkletNode(ctx, 'pcm-capture', { processorOptions: { channel, gain } });
    for (const x of inputs) {
      const level = ctx.createGain();
      level.gain.value = inputs.length > 1 ? 0.7 : 1; // two sources add up: leave headroom so they don't clip
      x.src.connect(level).connect(node);
      x.meter = ctx.createAnalyser(); x.meter.fftSize = 2048; x.buf = new Float32Array(2048);
      x.src.connect(x.meter);
    }
    const stream = new MediaStream(inputs.flatMap((x) => x.stream.getTracks()));
    const mute = ctx.createGain(); mute.gain.value = 0; node.connect(mute).connect(ctx.destination); // keeps the graph pulling
    node.port.onmessage = (e) => onPcm(e.data);
    stream.getAudioTracks().forEach((t) => { t.onended = () => onEnded?.(); });
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch { /* needs a click */ } }
    return {
      ctx, stream,
      setGain: (g) => node.port.postMessage({ gain: g }),
      levels: () => inputs.map(({ kind, meter, buf }) => {
        meter.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        return { kind, db: 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-6) };
      }),
      stop: () => { stream.getTracks().forEach((t) => t.stop()); ctx.close(); },
    };
  } catch (e) { ctx.close(); throw e; }
}

/** Level of one PCM16 chunk in dBFS (-∞…0), for a meter. */
export function levelDb(buf) {
  const i16 = new Int16Array(buf);
  let sum = 0;
  for (let i = 0; i < i16.length; i++) sum += (i16[i] / 32768) ** 2;
  return 20 * Math.log10(Math.sqrt(sum / i16.length) || 1e-6);
}
