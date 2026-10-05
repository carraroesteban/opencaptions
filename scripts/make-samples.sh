#!/usr/bin/env bash
# Rebuild the demo recordings in samples/ from their scripts (samples/talk-*.txt) with Kokoro, an open text-to-speech
# model (Apache-2.0: the recordings can be shared and used commercially). The talks are fictional: a made-up speaker at
# the example event, read by a synthetic voice.
#
#   ./scripts/make-samples.sh
#
# Needs Python 3 and ffmpeg. The first run downloads Kokoro (about 350 MB) into local/samples-tts/, which git ignores.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=local/samples-tts
MODELS=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
mkdir -p "$DIR"
[ -x "$DIR/venv/bin/python" ] || { python3 -m venv "$DIR/venv" && "$DIR/venv/bin/pip" install -q kokoro-onnx soundfile; }
for f in kokoro-v1.0.onnx voices-v1.0.bin; do [ -s "$DIR/$f" ] || curl -fL --progress-bar -o "$DIR/$f" "$MODELS/$f"; done

make() { # <lang> <voice> <kokoro language>
  "$DIR/venv/bin/python" - "$DIR" "samples/talk-$1.txt" "$2" "$3" "$DIR/talk-$1.wav" <<'PY'
import sys, soundfile
from kokoro_onnx import Kokoro
d, text, voice, lang, out = sys.argv[1:]
k = Kokoro(f"{d}/kokoro-v1.0.onnx", f"{d}/voices-v1.0.bin")
audio, rate = k.create(open(text, encoding="utf-8").read(), voice=voice, speed=1.0, lang=lang)
soundfile.write(out, audio, rate)
PY
  # What OpenCaptions reads natively: 16 kHz, mono, 16-bit WAV.
  ffmpeg -hide_banner -loglevel error -y -i "$DIR/talk-$1.wav" -ar 16000 -ac 1 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact "samples/talk-$1.wav"
  echo "✓ samples/talk-$1.wav"
}
make en am_michael en-us
make es ef_dora es
