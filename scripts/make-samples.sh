#!/usr/bin/env bash
# Rebuild the demo recordings in samples/ from their scripts (samples/talk-*.txt) with the voices built into macOS.
# The talks are fictional: a made-up speaker at the example event, read by a synthetic voice.
#   ./scripts/make-samples.sh
set -euo pipefail
cd "$(dirname "$0")/.."
make() { # <lang> <voice>
  say -v "$2" -r 165 -o "samples/talk-$1.aiff" -f "samples/talk-$1.txt"
  afconvert -f WAVE -d LEI16@16000 -c 1 "samples/talk-$1.aiff" "samples/talk-$1.wav"
  rm "samples/talk-$1.aiff"
  echo "✓ samples/talk-$1.wav"
}
make es Paulina
make en Samantha
