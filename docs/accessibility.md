# Accessibility

OpenCaptions exists so that everyone in the room can follow the talk. Its own pages have to be usable by everyone too: people who read captions because they're deaf or hard of hearing, people who use a screen reader, a keyboard or a magnifier, and people reading in a second language.

## What's checked automatically

`npm run a11y` opens every page in headless Chrome and runs [axe-core](https://github.com/dequelabs/axe-core) against **WCAG 2.2 level AA** plus axe's best practices: colour contrast, names and labels for every control, headings and landmarks, ARIA use, and more. It runs each page in light and dark themes, in Spanish and English, and CI runs it on every push. As of version 0.2.0 every page passes.

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
- **Motion:** the highlighter on the live word and page animations stop with the system's "reduce motion" setting.
- **Contrast:** text meets 4.5:1 (large text 3:1) on every surface, in both themes.

## Testing with people

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
