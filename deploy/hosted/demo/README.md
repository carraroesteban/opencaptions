# The public demo

One room, **Main Stage**, captioning the sample talk (`samples/talk-en.wav`, inside the image) on a loop in English and Spanish. The AI's answers are replayed from `talk-en.json`, recorded once from the real model with `node scripts/record-e2e.js --seconds 60 --out deploy/hosted/demo/talk-en.json`. The demo needs no API key, costs nothing to run, and nothing a visitor does reaches an AI. Transcripts stay in memory (`STORE_TRANSCRIPTS=false`), so the disk never fills.

Visitors are the audience: from the website's **Try it live** button they land on `/s/main`, the room's phone page, and can switch languages, change the text size, open the transcript and the transcripts page. *What did I miss?* answers from the recording; tapping a word or asking the whole event shows the matching moments (there's no model to explain or answer).

## Run it

On the server (Docker, 512 MB of memory is plenty):

```
cd deploy/hosted/demo
PUBLIC_URL=https://try-opencaptions.kvza.ar docker compose up -d
```

It listens on `127.0.0.1:8090`. Put the public address in front of it the way the server already does for its other sites (Caddy: `try-opencaptions.kvza.ar { reverse_proxy 127.0.0.1:8090 }`; or a Cloudflare Tunnel to `http://localhost:8090`).

Check: `https://try-opencaptions.kvza.ar/s/main` shows captions arriving within a minute, in English and Spanish; the loop starts again every minute without a gap.

## Update it

`docker compose pull && docker compose up -d`. The demo needs a release from 2026-10-27 or later (the replay restarts with the looping audio; older ones leave a 30-second gap every loop).
