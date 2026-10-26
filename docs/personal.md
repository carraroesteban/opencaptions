# Just for me (personal mode)

OpenCaptions isn't only for events. In **personal mode** it captions, and translates if you like, whatever you're listening to on your own computer: a video call in another language, a class, a video, a conversation in the room. For people who are deaf or hard of hearing, for anyone following a call in their second language, and for anyone who wants a transcript of what they heard.

It's the same download as the event version (the [Mac app or Windows launcher](../README.md#without-the-terminal)). The first time you open it, the welcome screen asks what you want captions for: choose **Just for me**. OpenCaptions remembers it (in its settings, which survive updates): from then on it opens straight to your captions, and never shows the event side unless you ask for it. There's no event name to fill in, and no rooms, QR codes or dashboard: any of those pages leads back to your captions.

## The first time: three short steps

One thing per screen, with **Back** and **Next**. Steps that are already done are skipped (a Gemini key you saved before, for example).

1. **Your AI:** paste a Gemini key (*How to get one (free)* opens Google AI Studio), and it's checked right away. No key? **Run it on this computer (free)** opens the dashboard's AI settings. You can also go on without one: the captions are simulated until you connect an AI.
2. **Your language:** the language to translate into, or *Don't translate*. It starts on the computer's language.
3. **The sound:** **Microphone** (you, or a conversation around you), **Computer sound** (what the computer plays), or **Both** (both sides of a call: what you say and what you hear). With **Both**, use headphones: otherwise the microphone also hears the speakers, and everything is captioned twice. **Test the sound** shows a bar that moves when there's sound; the captions then use that same sound, so the browser doesn't ask twice.

**Start captions** ends the guide. From then on, OpenCaptions opens straight to your captions.

## Use it

The captions fill the window, in big text; when translating, the original runs underneath. A slim bar at the bottom has what you use while captioning:

- **Start captions / Stop**, and how it's going (listening, paused for silence, the delay).
- **The language** to translate into.
- **A− / A+** change the text size.
- **Floating captions** opens a small always-on-top window, to keep the captions over a video call or a movie (Chrome and Edge; other browsers get a picture-in-picture window).
- **Download** saves what was said as text.
- **Settings** reopens one step of the guide (your AI, the language or the sound), and has **Transcript** (what's being said now, to read, search, summarize or ask about) and **Use it for events**.

**My transcripts** (top right) lists all your past ones. On a phone the bar shows icons only.

### Computer sound

Your browser asks what to share:

- **Windows (Chrome or Edge):** choose **Entire screen** and turn on **Share system audio**. Everything the computer plays is captioned: Zoom, Teams, Meet, a video, a class.
- **Mac (Chrome or Edge):** choose the **tab** that's playing (a Meet call, a YouTube video, a web class) and leave **Share tab audio** on. Apple doesn't let browsers share the whole computer's sound; apps outside the browser (the Zoom app, for example) can't be captioned this way yet. The microphone works everywhere.

The picture you share is never used, only its sound.

**A call app open?** When Zoom, Microsoft Teams, Webex, FaceTime, Discord, Skype or GoTo Meeting is running, the page tells you how to caption the call: on Windows, **Both** (one click), sharing the entire screen with its sound; on a Mac, join the call in Chrome or Edge instead (Zoom, Teams and Webex work on the web) and share that tab. OpenCaptions only checks the names of the programs running on this computer, and nothing is sent anywhere. A call in a browser tab (Google Meet, for example) can't be detected: choose **Computer sound** and that tab.

## The AI

- **Gemini** (Google): the best quality and the shortest delay. Paste a key in the first step (or later in **Settings → Your AI**); it's free to create at [Google AI Studio](https://aistudio.google.com/apikey). The free tier has usage limits, and Google may use its audio to improve its products; a paid key costs about US$ 2 per hour of speech (silence isn't billed).
- **On your computer** ([local mode](local.md)): nothing leaves the computer and there's no cost per hour, but it needs a recent computer and a one-time install.

Until one is connected, the captions are simulated, so you can see how it works.

## Privacy

In personal mode nothing is public, not even on your Wi-Fi: the captions, the transcripts, the summaries and the questions can only be read on this computer, or by a device you've signed in with your password (to read on your phone, for example). Transcripts are kept on this computer (Mac: `~/Library/Application Support/OpenCaptions/data`; Windows: `%LOCALAPPDATA%\OpenCaptions\data`); delete one for good with **Delete** on its page, or set `RETENTION_DAYS` to delete them automatically after some days. If you record other people, tell them, as you would with any recording.

## Switch between modes

- **Use it for events** (in **Settings**) switches OpenCaptions to events: rooms, QR codes, the dashboard. First it shows, on the page, what stays (your transcripts, still private; your AI; this page, at `/me.html`) and what changes: OpenCaptions opens on the dashboard, the audience pages can be read by anyone who reaches this computer, and what the AI costs or how many rooms this computer keeps up with. The first time, the event's setup wizard comes next.
- To come back, open **Settings → System → Just for me** in the dashboard. It says so if rooms are live (their audience stops seeing captions), and it's blocked while Event mode is on. Nothing is deleted either way.
