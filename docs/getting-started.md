# Getting started

In this tutorial you run OpenCaptions on your own computer, watch simulated captions, then connect it to Gemini and caption two rooms at once. It takes about 10 minutes.

**You need:**

- A computer running macOS, Linux or Windows.
- [Node.js](https://nodejs.org/) 20 or later. Version 22 LTS is recommended. Check with `node --version`.
- [Git](https://git-scm.com/).
- For the second half: a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

## 1. Install

```bash
git clone https://github.com/carraroesteban/opencaptions.git
cd opencaptions
npm install
```

`npm install` also downloads a small ffmpeg binary (`ffmpeg-static`), so you don't need to install ffmpeg yourself.

## 2. Run without an API key

```bash
npm run mock
```

The server prints its URLs. Mock mode generates realistic fake captions whenever a room receives audio. You can build and test everything without spending money. (Mock mode defaults to the `live` translation mode so every language has a simulated voice track; the real engine defaults to `text`.)

Open these pages in your browser:

| Page | What you see |
|---|---|
| http://localhost:8080/ | The audience page. Pick a room and a language. |
| http://localhost:8080/admin.html | The production dashboard with every room's status. |

Nothing is captioned yet, because no room is receiving audio.

## 3. Send audio to a room

Open a second terminal in the same folder and play the bundled English sample into the room called `main`:

```bash
npm run feed -- --stage main --input samples/talk-en.wav
```

On the audience page, open **main**. Captions start after a few seconds. Switch between **Original** and **Español** to see the translation track. On the dashboard, the room turns live and shows an audio meter and latency.

Stop the feed with Ctrl+C. Stop the server with Ctrl+C in the first terminal.

## 4. Connect Gemini

The quickest way is the setup wizard, which also names your event and rooms and generates access tokens:

```bash
npm run setup
```

Or do it by hand:


1. Copy the example configuration:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env`.

2. Open `.env` in a text editor and set your key:

   ```
   GEMINI_API_KEY=<your-key>
   ```

3. Run the built-in check. It streams 25 seconds of the sample to Gemini and reports what came back and how long it took:

   ```bash
   npm run check
   ```

   If it fails, see [Troubleshooting](operations/troubleshooting.md#gemini-connection).

4. Start the real server:

   ```bash
   npm start
   ```

## 5. Caption two rooms at once

In two more terminals, run one feed per room:

```bash
npm run feed -- --stage main   --input samples/talk-en.wav
```

```bash
npm run feed -- --stage sala-b --input samples/talk-es.wav
```

Room `main` receives English and shows Spanish captions. Room `sala-b` receives Spanish and shows English captions. The dashboard shows both rooms, their latency and the estimated cost so far.

## 6. Catch up and ask

On the audience page, tap **✨ What did I miss?**. You get a summary of the last five minutes in the language you're reading, and a box to **ask the talk** a question ("which tool did they use for traces?"). The answer comes only from the transcript, with quotes and timestamps. Tap **📄** to open the full transcript: search it, switch language, download it.

In mock mode (no API key) the summary shows transcript highlights and the answers show matching quotes; with a Gemini key they're written by the model.

## 7. Try a live microphone

Open http://localhost:8080/demo.html?mode=mic, allow the microphone and speak. You see your words and their translation in large text, with a level meter and the measured delay. This is the page you use for sound checks.

Browsers only allow microphone access on `localhost` or over HTTPS. To use the microphone from another device, read [Deployment](deployment.md#https).

## What you did

You ran the server, fed it audio from a file and a microphone, and watched captions and translations in two rooms at the same time. The same pieces run at a real event:

- Each room's audio arrives through the **headless agent**, a browser page or a stream the server pulls.
- The audience follows on their phones with a QR code.
- The projector and the vMix/OBS overlay use the same captions.

## Next steps

- [Requirements](requirements.md): check what an event needs.
- [Deployment](deployment.md): choose where the server runs.
- [Security](security-guide.md): read this before exposing the server to a network.
- [Event-day runbook](operations/runbook.md): run it at a conference.
