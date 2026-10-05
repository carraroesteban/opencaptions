# Just for me (personal mode)

OpenCaptions isn't only for events. In **personal mode** it captions, and translates if you like, whatever you're listening to on your own computer: a video call in another language, a class, a video, a conversation in the room. For people who are deaf or hard of hearing, for anyone following a call in their second language, and for anyone who wants a transcript of what they heard.

It's the same download as the event version (the [Mac app or Windows launcher](../README.md#without-the-terminal)). The first time you open it, the welcome screen asks what you want captions for: choose **Just for me**. OpenCaptions remembers it (in its settings, which survive updates): from then on it opens straight to your captions, and never shows the event side unless you ask for it.

## Use it

1. **Listen to:** **Microphone** (you, or a conversation around you), **Computer sound** (what the computer plays), or **Both** (both sides of a call: what you say and what you hear). With **Both**, use headphones: otherwise the microphone also hears the speakers, and everything is captioned twice.
2. **Translate to:** a language, or *Don't translate*.
3. **Start captions.** Captions appear in big text; when translating, the original runs underneath.
4. **Floating captions** opens a small always-on-top window, to keep the captions over a video call or a movie (Chrome and Edge; other browsers get a picture-in-picture window).
5. **A− / A+** change the text size. **Transcript** opens what's being said now, to read, search, summarize or ask about; **Download** saves it as text. **My transcripts** (top right) lists all your past ones.

### Computer sound

Your browser asks what to share:

- **Windows (Chrome or Edge):** choose **Entire screen** and turn on **Share system audio**. Everything the computer plays is captioned: Zoom, Teams, Meet, a video, a class.
- **Mac (Chrome or Edge):** choose the **tab** that's playing (a Meet call, a YouTube video, a web class) and leave **Share tab audio** on. Apple doesn't let browsers share the whole computer's sound; apps outside the browser (the Zoom app, for example) can't be captioned this way yet. The microphone works everywhere.

The picture you share is never used, only its sound.

## The AI

- **Gemini** (Google): the best quality and the shortest delay. Paste a key on the page the first time; it's free to create at [Google AI Studio](https://aistudio.google.com/apikey). The free tier has usage limits, and Google may use its audio to improve its products; a paid key costs about US$ 2 per hour of speech (silence isn't billed).
- **On your computer** ([local mode](local.md)): nothing leaves the computer and there's no cost per hour, but it needs a recent computer and a one-time install.

Until one is connected, the captions are simulated, so you can see how it works.

## Privacy

In personal mode nothing is public, not even on your Wi-Fi: the captions, the transcripts, the summaries and the questions can only be read on this computer, or by a device you've signed in with your password (to read on your phone, for example). Transcripts are kept on this computer (Mac: `~/Library/Application Support/OpenCaptions/data`; Windows: `%LOCALAPPDATA%\OpenCaptions\data`); delete one for good with **Delete** on its page, or set `RETENTION_DAYS` to delete them automatically after some days. If you record other people, tell them, as you would with any recording.

## Switch between modes

- **Use it for events** (top right) switches OpenCaptions to events: rooms, QR codes, the dashboard. It asks first; your transcripts stay where they are, but the event side never shows them.
- To come back, open **Settings → Setup wizard** in the dashboard and choose **Just for me**.
