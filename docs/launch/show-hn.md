# Show HN

**Title** (no adjectives; the label is the only rule):

> Show HN: OpenCaptions – open-source live captions and translation for events

**URL:** `https://try-opencaptions.kvza.ar/s/main` (the live demo: people can try it, which Show HN requires). The repository goes in the first comment.

**First comment** (post it yourself right after submitting):

> Hi HN, I built OpenCaptions because commercial captioning for events is priced per room and per hour, and I wanted every talk at small events captioned and translated.
>
> What it does: a room's audio goes to one Node.js server (a laptop is enough), a speech model transcribes it, each sentence is translated as text, and every phone in the room reads it in its own language after scanning a QR code. Also the stage screen and an OBS/vMix overlay. The demo link is one room playing a recorded talk on a loop, with the AI's answers replayed from a recording, so it costs nothing to keep up.
>
> New in 1.0: the speaker's slide on every phone with its text translated; tap any word in the captions to have it explained from what the speaker said; and a question box across every room and talk of the event, answered with links to the exact moment.
>
> Numbers, measured: first words about 1 s after they're said, the finished sentence about 3 s; translations 3–6 s. About US$0.54 per room-hour of speech with Gemini, plus about 0.50 per extra language, nothing while the room is silent. 30 simultaneous rooms on one laptop in a test. On a Mac with macOS 26 it can run entirely on Apple's own speech recognition and translation: free per hour, nothing leaves the building.
>
> Stack: plain JavaScript, no build step, no database (JSONL files per talk), 7 runtime dependencies, over 320 tests, every page checked against WCAG 2.2 AA. MIT.
>
> What I'd love feedback on: the setup wizard (7 steps today), and what you'd need before using it at a real event. Repo: https://github.com/carraroesteban/opencaptions

**Answers ready for the obvious questions** (in your own words when they come):

- *Why not Zoom's or Teams' captions?* They caption their own calls; this is for an audience in a room reading on their own phones, plus the projector and the stream.
- *Accuracy?* It's automatic: names and jargon go wrong without the glossary; for court-grade exactness, book a human captioner. The docs say so.
- *Privacy?* Self-hosted; audio is never written to disk; local mode keeps everything on the machine. `docs/privacy.md` lists every request that leaves the computer.
- *Why Gemini?* One Live session per room transcribes; translation is a cheap text request per sentence, so adding a language doesn't add a streaming session (ADR 0002, 0003). Other OpenAI-compatible text APIs can do the translations.
