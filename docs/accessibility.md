# Accessibility

OpenCaptions exists so that everyone in the room can follow the talk. Its own pages have to be usable by everyone too: people who read captions because they're deaf or hard of hearing, people who use a screen reader, a keyboard or a magnifier, and people reading in a second language.

## What's checked automatically

`npm run a11y` opens every page in headless Chrome and runs [axe-core](https://github.com/dequelabs/axe-core) against **WCAG 2.2 level AA** plus axe's best practices: colour contrast, names and labels for every control, headings and landmarks, ARIA use, and more. It runs each page in light and dark themes, in Spanish and English, and CI runs it on every push. It also builds the website ([opencaptions.kvza.ar](https://opencaptions.kvza.ar)) and checks every page in its sitemap (`npm run a11y -- site:` checks only the website). Every page passes. The public [accessibility statement](https://opencaptions.kvza.ar/accessibility/) summarizes this page for readers.

| Page | What it is |
|---|---|
| `/`, `/watch.html`, `/talk.html`, `/talks.html` | The audience: room list, live captions, transcripts |
| `/admin.html` (Live, Rooms, Settings), `/welcome.html`, `/report.html` | The dashboard, the setup wizard and the event report |
| `/screen.html`, `/overlay.html`, `/kit.html` | The stage screen, the stream overlay and the QR posters |
| `/ingest.html`, `/demo.html`, `/style.html` | Room audio, the demo and the caption style editor |

```bash
npm run a11y            # every page
npm run a11y -- watch   # only pages whose address contains "watch"
```

Automated tools find roughly a third to a half of real accessibility problems. The rest needs people.

## What the pages do for people

- **Captions that screen readers read once.** The caption area is a live region, but the line being spoken (rewritten as the speaker talks) is hidden from screen readers. They read each finished sentence once, instead of every word several times.
- **Reading preferences** on phones: text size, line spacing, high-legibility fonts (Atkinson Hyperlegible, Lexend), light and dark themes, and floating captions over other apps. They're remembered on the device.
- **Who is speaking**: when the crew sets it, captions and transcripts name the speaker, and WebVTT exports carry standard voice tags.
- **Colour is never the only signal:** room states have text ("LIVE", "NO AUDIO"), alerts have words, checklists strike through what's done.
- **Keyboard:** every control is a real button, link or form field; focus is always visible (ink in light mode, lime in dark mode); dialogs are native `<dialog>` elements, so focus stays inside them and Esc closes them (except the sign-in screen, which must be completed).
- **Motion:** captions don't blink or move at the end of the line: each new word fades in once, and a paragraph is never redrawn while you read it. The fade and page animations stop with the system's "reduce motion" setting.
- **Contrast:** text meets 4.5:1 (large text 3:1) on every surface, in both themes.

## Hearing the room on a phone

Some people hear a talk better with its sound in their ears than from the room's speakers: people whose hearing aids or cochlear implants stream from a phone, people who use earbuds to cut out the room's echo and chatter, and people sitting far from a speaker. Venues often provide an assistive listening system for them (a hearing loop, or FM or infrared receivers). OpenCaptions can also send each room's own sound to phones, as some captioning services do.

- **Turn it on per room:** **Rooms → Edit → The room's sound on phones**. It's off by default.
- **On the phone:** pick **Original**, then 🎧 **Listen**. The sound plays in earbuds, headphones or hearing aids paired with the phone (Bluetooth, Made for iPhone, Android's hearing aid streaming). On iPhone it plays with the silent switch on, like the translated voice.
- **Privacy:** anyone with the room's link can listen, even from outside the venue if the server has a public address. Turn it on only in rooms whose talks are public, not in closed-door sessions. The sound isn't recorded, and it never plays in Just for me (its room is someone's own calls). See [who can see what](security-guide.md#who-can-see-what).
- **Breaks and music:** it keeps playing. It's the room's sound, not the captions.
- **Delay:** about a quarter of a second from the room's microphone to the phone's speaker (measured below), so the sound stays with the speaker's lips. Bluetooth earbuds and hearing aids add their own delay, often 100–200 ms. A phone on a weak connection skips a little audio rather than falling behind the room.
- **A limit per room:** 100 phones at once by default (**Most people listening at once** in the room's dialog, or `ROOM_SOUND_MAX`). The next phone is told the room's sound is full and that captions keep working. The dashboard shows how many are listening (🎧 on the room's card).
- **What it doesn't replace:** it depends on the venue's Wi-Fi and on people's phones and batteries. Where a venue has to provide an assistive listening system (for example under the ADA in the United States), keep it: this adds to it.

### What it costs

Each phone gets the room's audio as it reaches the server, 16 kHz mono in [μ-law](https://en.wikipedia.org/wiki/%CE%9C-law_algorithm) (8 bits a sample, as phone networks use): **128 kbit/s**, half of the 16-bit audio the server receives. Speech keeps about 37 dB of signal-to-noise ratio. Each 100 ms of audio is encoded once per room (about 5 µs) and sent to every phone listening.

Measured with `npm run loadtest -- --stages 1 --listeners N --seconds 60 --cleanup` (`samples/talk-en.wav`, simulated AI, server and phones on one MacBook Pro M3 Pro, Node.js 22, October 2026):

| Phones listening to one room | Server CPU (% of one core) | Sent by the server | Ingest → phone (p50 / p99) |
|---|---|---|---|
| 0 | 1.2 % | — | — |
| 50 | 1.8 % (2.0 % as 16-bit) | 6.4 Mbit/s (12.8 as 16-bit) | 1.1 / 11 ms |
| 200 | 3.1 % (3.2 % as 16-bit) | 25.6 Mbit/s (51.1 as 16-bit) | 2.5 / 35 ms |

Sending the 16-bit audio as it arrives took the same CPU and twice the network, so the room's sound goes as μ-law. Memory didn't grow (about 50 MB). At 200 phones, 57 of 119,800 frames arrived more than 150 ms after the previous one, with the 200 test phones on the same laptop as the server. The server barely notices; **the venue's Wi-Fi is the limit**. 100 phones in a room need about 13 Mbit/s of it. Before raising a room's limit, ask the venue what its Wi-Fi can carry (see [networking](networking.md)). On a server in the cloud, the same goes for its outbound bandwidth.

### Delay, end to end

Measured in Chrome on the same MacBook, with the server on `localhost` and one page acting as both the room's audio source and the phone: a click went into the room every second, timed from when a microphone would have picked it up to when it left the computer's speakers. **238 ms** at the median, 253 ms at most, over 30 seconds that included four network stalls of 0.8 s.

| Step | Time |
|---|---|
| The room's computer fills 100 ms of audio before sending it | 100 ms |
| Network and server (on `localhost`; a venue's Wi-Fi adds a few to a few tens of ms) | about 1 ms |
| Queued on the phone, to ride out network jitter (the same cushion as the translated voice) | about 105 ms |
| The device's audio output (Chrome's `outputLatency`) | 32 ms |

After a stall, the phone skips the audio that arrived late instead of playing it late: once more than 0.4 s is queued, it drops back to 0.15 s. So the delay is back to normal within a second, and two pieces of audio never play at once. The microphone, Bluetooth earbuds and hearing aids add their own delay.


Before a large event, ask someone who uses these tools every day to try it, and pay them for their time. A quick check you can do yourself:

1. **Keyboard only:** unplug the mouse. On the audience page, choose a room and a language, open the transcript, search it, and change the text size with Tab, Shift+Tab, Enter and Space. On the dashboard, start the next talk and open Settings. You should always see where you are.
2. **Screen reader:** VoiceOver on a Mac or iPhone (Cmd+F5, or triple-click the side button if enabled), TalkBack on Android, NVDA on Windows (free). Follow live captions for a minute: each sentence should be read once, in order. Every button should say what it does.
3. **Zoom:** at 200% browser zoom and on a phone with the largest system text, nothing should be cut off or overlap.
4. **Projector from the back row:** stand at the back of the actual room and read the stage screen for a minute. If it's hard, make the text bigger or show fewer lines in the style editor (`/style.html`).

## Known gaps

- The **stream overlay** and the **stage screen** are visual by design: people who use a screen reader follow on their phone instead (the stage screen shows the QR code).
- **Captions are written by AI.** They're fast, but not as accurate as a professional human captioner, especially with strong accents, names and crosstalk. The glossary helps. For events where exact wording matters (legal, medical), plan human review of transcripts.
- **Sign language** isn't produced; captions don't replace interpreters for people whose first language is a sign language.
- The dashboard and wizard are tested less with screen readers than the audience pages.

Report an accessibility problem as a GitHub issue with the label "accessibility": it's treated as a bug.
