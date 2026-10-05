# Just for me (personal mode)

OpenCaptions isn't only for events. In **personal mode** it captions, and translates if you like, whatever you're listening to on your own computer: a video call in another language, a class, a video, a conversation in the room. For people who are deaf or hard of hearing, for anyone following a call in their second language, and for anyone who wants a transcript of what they heard.

It's the same download as the event version (the [Mac app or Windows launcher](../README.md#without-the-terminal)). The first time you open it, choose **Just for me** on the welcome screen. From then on, OpenCaptions opens straight to your captions.

## Use it

1. **Listen to:** **Microphone** (you, or a conversation around you) or **Computer sound** (what the computer plays).
2. **Translate to:** a language, or *Don't translate*.
3. **Start captions.** Captions appear in big text; when translating, the original runs underneath.
4. **Floating captions** opens a small always-on-top window, to keep the captions over a video call or a movie (Chrome and Edge; other browsers get a picture-in-picture window).
5. **A− / A+** change the text size. **Transcript** opens everything said, to read, search, summarize or ask about it; **Download** saves it as text.

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

In personal mode nothing is public, not even on your Wi-Fi: the captions, the transcripts, the summaries and the questions can only be read on this computer, or by a device you've signed in with your password (to read on your phone, for example). Transcripts are kept on this computer (Mac: `~/Library/Application Support/OpenCaptions/data`; Windows: `%LOCALAPPDATA%\OpenCaptions\data`); delete one for good from the dashboard (**Event dashboard → Transcripts → Delete**), or set `RETENTION_DAYS` to delete them automatically after some days. If you record other people, tell them, as you would with any recording.

## Switch between modes

- **Event dashboard** (top right) opens the event dashboard without leaving personal mode.
- To go back to events for good, open **Settings → Setup wizard** in the dashboard and finish it: OpenCaptions opens the dashboard again from then on.
