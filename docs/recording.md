# Caption a recording

Turn an audio or video file into captions and translations, much faster than real time. The result is a normal transcript of a room, the same as a live talk's. You can read it, search it, fix captions, download SRT, VTT and TXT in each language, include it in **Download all (.zip)** and the event report, and ask for an AI summary.

Use it for a talk recorded without OpenCaptions, a video to publish with subtitles, or a session whose live captions you want to redo. Live rooms are unaffected: the file never goes through a room.

## From the dashboard

1. Open **Transcripts** and click **Caption a recording**. You can also drop a file anywhere on the Transcripts view.
2. Choose or drop the file: any audio or video, such as MP3, M4A, WAV, MP4, MOV, MKV or WebM. It starts uploading right away.
3. Pick the **room** the transcript belongs to, the **spoken language** (or *Detect automatically*), a **title** (the file's name by default) and the **caption languages** (the room's, by default).
4. Read the estimate: how long the recording is, roughly how long captioning will take and, with Gemini, about what it costs. Then click **Caption it**.
5. A progress bar shows each step: reading the audio, transcribing, translating, saving. **Keep going in the background** closes the dialog; the job then shows above the list of transcripts, with **Stop**.
6. When it's done, **Open the transcript**, or find it in the room's list marked **Recording**.

Only admins can do this. A file is kept only while it's being captioned: its temporary folder is deleted once the job ends, fails, is stopped, or isn't started within 30 minutes.

## From the command line

`npm run subtitle` uses the same path and writes subtitle files next to the recording, ready for YouTube Studio → Subtitles → Upload:

```bash
npm run subtitle -- ~/Movies/talk.mp4 --source es --langs en,pt
```

It writes `talk.original.srt`, `talk.en.srt`, `talk.pt.srt` and their `.vtt`. Add `--room main` to also keep the transcript in that room. Against another server, add `--server https://subs.example.com --admin-token …`. All options are in the [configuration reference](reference/configuration.md#command-line-tools).

## How fast, and what it costs

| AI | How | A 1-minute talk | Cost |
|---|---|---|---|
| Simulated (`--mock`, no key) | Made-up talk timed on the recording's own speech, for trying the feature and for tests | under 1 s | none |
| On your own computer ([local mode](local.md)) | Whisper in pieces of up to 25 s cut at pauses, one after another, and the local model translating each finished sentence meanwhile | 17 s for the English sample (58 s) on a MacBook Pro M3 Pro with whisper-small on the CPU and gemma3:4b; a 3-minute video took 73 s | none |
| In the cloud (Gemini) | Pieces of up to 5½ minutes, cut at pauses and sent four at a time as Opus to the regular Gemini API (not Live), which returns subtitle lines with timestamps; sentences translated 25 per request | about 15 s; an hour, a few minutes | about US$ 0.11 an hour to transcribe, plus US$ 0.05 an hour per caption language, with `gemini-3.5-flash-lite` |

Gemini's prices are from its pricing page in October 2026: audio is 32 tokens a second. The dashboard's estimate uses the configured models' prices and records what the job really cost (its `costUsd`, also in the event report). In local mode the estimate learns from the machine's last recordings. Whisper is the slow part there: whisper.cpp with Metal on a Mac, or a GPU, is several times faster than the bundled CPU server ([local mode](local.md)).

While a live room is captioning, a recording yields to it. In local mode a live room's speech goes to Whisper before the recording's next piece, and its sentences go to the local model first. With Gemini, half as many pieces are sent at once.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `RECORDING_MODEL` | `gemini-3.5-flash-lite` (or `event.json`'s `recordingModel`) | The Gemini model that transcribes, with timestamps. `gemini-3.8-flash` is more accurate on hard audio and costs about twice as much. Translation uses `TEXT_MODEL`. |
| `RECORDING_MAX_MB` | `2048` | The biggest file accepted. |
| `RECORDING_CONCURRENCY` | `4` | Pieces sent to Gemini at once (half while a live room is captioning). Lower it on the free tier. |

## What's checked, and the limits

- **Admin only**, in both the dashboard and the API (`/api/recordings`, see the [API reference](reference/api.md#caption-a-recording)).
- The file is uploaded in pieces of 16 MB. That keeps each request within Node's 5-minute limit and under the 100 MB a Cloudflare tunnel accepts, and a broken upload resumes where it stopped.
- **ffmpeg reads the file's header** before anything else. Only audio and video containers are accepted: playlists and other formats that could make ffmpeg open other files or addresses are refused. A file without an audio track is refused too. Without ffmpeg, only 16 kHz mono WAV files can be read.
- Nothing is fetched from an address: you upload the file itself.
- The whole file is uploaded, video included. For a long video on a remote server over a slow connection, you can export the audio first (any audio-only file works the same).
- One recording is captioned at a time, and at most four can wait or run at once.
- One spoken language per recording. With *Detect automatically*, the language heard most is used for the whole recording.
- The timing of each line comes from the AI (Gemini) or from the pauses inside each piece (local Whisper). It's good enough for subtitles but not frame-exact. Fix any line in the transcript page, as with a live talk.
