# Reddit

One community a day, after Hacker News. Say you're the author in the first line, answer every comment, and read each sidebar again before posting: rules change.

## r/selfhosted — New Project Megathread (the project is under 3 months old)

> **OpenCaptions — self-hosted live captions and translation for events** (I'm the author)
>
> One Node.js server (laptop, mini PC or Docker), no database. Each room's audio comes from a computer by the sound desk, a browser tab, or an SRT/RTMP/HLS stream; phones scan a QR code and read the captions in their language. Transcripts are JSONL files on your disk; audio is never stored. Cloud AI is Gemini (about US$0.54 a room-hour) or fully local: Whisper + Ollama, or Apple's speech on a Mac. MIT, Docker image, `docker compose up -d`.
> Live demo (a recorded talk on a loop): https://try-opencaptions.kvza.ar/s/main · Repo: https://github.com/carraroesteban/opencaptions

## r/accessibility

> **I built free, open-source live captions for in-person events — feedback from people who use captions welcome**
>
> Phones read the captions after scanning a QR code: text size, high-legibility fonts, light/dark, whole sentences instead of word by word. The room's own sound can go to hearing aids through the phone. New: tap any word to have it explained in plain words, and the slide's text on the phone. Every page is checked against WCAG 2.2 AA, but automated checks catch only part of it: what would make it work for you?

## r/deaf

> Ask the moderators first if posts about your own project are OK. If they are: lead with what it is not (it's automatic, not CART; it doesn't replace sign language interpreters) and ask what would make captions at events usable for them.

## r/eventprofs

> **Captioning every room of a conference for about US$0.54 per room-hour — open-source tool, AMA**
>
> For organizers: QR posters per room, captions on the projector and in the OBS/vMix stream, alerts on your phone when a room loses its sound, an agenda that names the transcripts, an event report with each talk's audience and cost. Runs on a laptop at the venue. What would you need to try it at your next event?

## r/opensource

> **OpenCaptions 1.0: live captions and translation for events, MIT, no build step, no database**
>
> Plain JavaScript, 7 runtime dependencies, over 320 tests, decision records for every big choice (`docs/adr/`). Contributions welcome, especially translations of the interface and testing on Windows.
