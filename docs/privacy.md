# Privacy and data: what leaves the machine

OpenCaptions runs on your own computer or server and never reports to its authors. This page lists every time something leaves that machine, so you can tell speakers, the audience and your IT team exactly where their words go. For who can read what inside OpenCaptions, see [Security → Who can see what](security-guide.md#who-can-see-what); for what to tell people, with a ready-made notice, see [Licenses and responsibilities](legal.md).

## Always kept on your machine

- **Transcripts, rooms, the agenda, the glossary, the History and your passwords** are files in the data folder (`data/` in a clone or Docker, `~/Library/Application Support/OpenCaptions/data` with the Mac app, `%LOCALAPPDATA%\OpenCaptions\data` on Windows). They stay until you delete them; `RETENTION_DAYS` deletes old transcripts by itself.
- **Audio is never written to disk.** A recording you upload to caption is kept only while it's being captioned, then deleted ([Caption a recording](recording.md)).
- **Nothing about the audience** is collected: no accounts, cookies, analytics or logs of who read what. A phone remembers its own choices (language, text size, theme) in its browser. The audience pages carry a quiet link, "Live captions by OpenCaptions · free for your event", to the OpenCaptions website; it only leaves the event's pages if someone taps it (**Settings → Event → Say where the captions come from** hides it).

## What leaves, and when

| What | Goes to | When | How to avoid it |
|---|---|---|---|
| The room's audio | Google (Gemini) | While a room is captioning with Gemini. It stops after 30 s of silence, and during breaks and music. | [Local mode](local.md): speech recognition on your own computer. |
| Caption text, for translations, *What did I miss?*, *Ask the talk* and words tapped to be explained | Google (Gemini), or the AI you set in **Settings → AI** (OpenAI, OpenRouter, Groq, Mistral…) | For each sentence to translate, and each summary or question | Local mode, or a translation service you run yourself |
| The slide on the room's screen, as a picture | Google (Gemini) | Only when the room's computer shares its slides, once per new slide | Don't share slides, or `SLIDES=off` |
| Captions, to Zoom, YouTube Live, Microsoft Teams or a webhook | The service you connected | Only for integrations you set up | Don't connect them |
| Alerts (room names and what went wrong, never captions) | ntfy, Telegram, Slack, Discord or a webhook | Only for the channels you set up | Don't set up alerts |
| The pages and captions, for phones outside your network | Cloudflare, through the tunnel | Only with **Settings → Public address** | Your own HTTPS, or only the venue's Wi-Fi |
| A request for the latest version number | GitHub (`api.github.com`) | At start and once a day. It carries nothing about you or the event. | **Settings → System → New versions**, or `UPDATE_CHECK=0` |
| A new version's download | GitHub | Only when you click **Update and Restart** (or the dashboard's **Update…**) | Don't click |
| One-time downloads: Node.js, the libraries, `cloudflared`, local models | nodejs.org, npm, GitHub, Hugging Face, Ollama | The first time each one is needed | Install them yourself beforehand |

## With Gemini

The room's audio and the caption text are processed by Google under the [Gemini API terms](https://ai.google.dev/gemini-api/terms). On the **free tier**, Google may use them to improve its products, and people may review them. With a **paid** key (billing enabled) or **Vertex AI**, they aren't used that way. For talks with personal or confidential information, use a paid key or Vertex AI, or local mode. The comparison is in [Security → Choosing the AI backend](security-guide.md#choosing-the-ai-backend).

## In local mode

Speech recognition and translation run on your computer (on a Mac, Apple's own; elsewhere Whisper and a model through Ollama). No audio or text leaves it, and nothing is billed per minute. The only traffic is the one-time model download, the version check and anything in the table above that you turn on yourself.

## Just for me

Everything above applies, and nothing is public, not even on your Wi-Fi: only this computer, or a device you sign in with your password, can read your captions and transcripts. [Just for me](personal.md).
