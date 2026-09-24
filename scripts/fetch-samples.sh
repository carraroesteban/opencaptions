#!/usr/bin/env bash
# Download a few minutes of real Nerdearla talks from YouTube as 16 kHz WAV test audio.
# Requires yt-dlp + ffmpeg (macOS: brew install yt-dlp ffmpeg).
#   ./scripts/fetch-samples.sh <youtube-url> <name> [start-seconds] [duration-seconds]
#   ./scripts/fetch-samples.sh https://www.youtube.com/watch?v=XXXX nerdearla-en 300 180
set -euo pipefail
url="${1:?youtube url}"; name="${2:?output name}"; start="${3:-120}"; dur="${4:-180}"
mkdir -p samples
src=$(yt-dlp -f bestaudio -g "$url" | head -1)
ffmpeg -y -loglevel error -ss "$start" -t "$dur" -i "$src" -vn -ac 1 -ar 16000 "samples/$name.wav"
echo "✓ samples/$name.wav — try: npm run feed -- --stage main --input samples/$name.wav"
