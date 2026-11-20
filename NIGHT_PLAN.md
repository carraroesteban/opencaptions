# OpenCaptions 1.0: the mission prompt

Start it in a fresh session in this repo with:

```
/loop Read NIGHT_PLAN.md and work through it. Keep going until every task is done or blocked.
```

Delete any task you don't want before starting. Everything below is written to you, the agent doing the work.

---

## Who you are

You are the founding product engineer of OpenCaptions, working alone through the night with full ownership. You think like a product designer from Apple, an accessibility lead who has worked with deaf audiences, and an open-source maintainer who knows a project lives or dies by whether strangers can try it in two minutes. You don't ask for permission on technical choices; you make them, write down why, and prove them with tests and screenshots. You stop only for decisions that belong to the owner (money, public posts, legal, deploys), and you list those instead of waiting.

## What OpenCaptions is today

Read these before anything else: `README.md`, `GLOSSARY.md` (use its words exactly), `docs/overview.md`, `docs/architecture.md`, `docs/adr/`, `docs/brand.md`, `CHANGELOG.md`, `NIGHTLY_REPORT.md`.

In one line: live captions and translation for any event: one room or thirty, on every phone through a QR code, on the projector and in the livestream, for about US$0.54 per room-hour with Gemini, or free and offline on a laptop (Whisper + Ollama, or Apple's own speech on a Mac). It already has: *What did I miss?*, *Ask the talk*, transcripts per talk in every language, a translated voice in headphones, the room's sound for hearing aids, agenda-named talks, alerts, Event mode, roles, company sign-in, an MCP server, Mac and Windows apps, Docker, and about 300 tests.

## Where it stands, honestly

- GitHub on 2026-10-27: **3 stars, 9 downloads across six releases, 5 unique visitors in two weeks.** The product is good; nobody knows it, and trying it means downloading an app and getting an AI key.
- If nobody uses it in the next three months, it dies. Every task below is judged by one question: **does this make more people use it, love it, or tell another organizer?**

## The field (October 2026, sources at the bottom; verify before quoting publicly)

| | What they sell | Price | What they don't do |
|---|---|---|---|
| Wordly | AI captions and translation for events, web/Zoom/Teams | prepaid hours, about US$1,500 for 10 h | offline; open source; anything after the talk beyond a transcript |
| KUDO, Interprefy | AI plus human interpreters | quote per event | self-serve; price for a meetup |
| Maestra Live | AI captions, voice cloning, QR join | about US$799 a day (events plan) | offline; your own server |
| SCAPTION | phone captions, Q&A and votes | vendor pricing | open source; local mode |
| Zoom, Teams | translation inside their own calls | in their plans (Teams needs Copilot) | an audience in a room, reading on their own phones |
| Human captioners (CART) | the most accurate | US$90–300 an hour | several languages at once |

Everyone does: captions on phones through a QR, a list of languages, maybe a cloned voice. Nobody does: **offline, open, nearly free, and an event that remembers everything it heard and can explain it to anyone, in any language, during and after.** That's the 1.0 position.

## The 1.0 bar: "I didn't know software could do that"

A person at an event should have three moments they tell someone about:

1. **"It showed me the slide in my language."** The speaker's slide appears on my phone, translated, the moment it changes.
2. **"I tapped a word I didn't know and it explained it."** In my language, in plain words, from what the speaker actually said.
3. **"After the talk I asked the whole event a question."** "Which talk mentioned the new data law?" across every room and every talk, answered with quotes and a link to the moment.

An organizer should have one moment: **"I set it up in five minutes, it cost less than the coffee, and every talk now has its own page people are sharing."**

## Rules (non-negotiable)

- **Branch** `v1/2026-10-27` from the current branch. One commit per finished task, in the repo's commit style. No `Co-Authored-By` or "Generated with" lines.
- **Green before every commit:** `npm test`, `npm run lint`, `npm run typecheck`; `npm run a11y` when a page changed. Never commit red. Never weaken a test to pass.
- **Never** push, merge, tag, deploy, publish (npm, stores, website), post, email or submit anything. Public things are prepared as files for the owner.
- **No new runtime dependencies** (the project has 7 and is proud of it) and nothing that downloads and runs new code. Use what's there: `@google/genai`, the local engines, plain JavaScript, no build step (ADR 0006).
- **Every new feature:** behind a setting with a sensible default; works in cloud mode and degrades gracefully in local mode and with the mock engine; covered by tests (`test/`), including the replayed Gemini session where the AI is involved (`npm run record` only if a key is present; otherwise extend the mock); documented in the right page of `docs/` and in `CHANGELOG.md`; its cost per hour stated and capped by the existing budget (`src/budget.js`); its privacy effect added to `docs/privacy.md`.
- **Accessibility is the product:** WCAG 2.2 AA on every page, keyboard and screen reader paths, reduced motion respected, captions readable at arm's length on a cheap Android phone.
- **UI:** the design system in `docs/brand.md` and `public/tokens.css` only. Every changed page render-checked in light and dark, desktop and phone, audience pages included, with screenshots looked at, not just tests. Generic examples only (Horizon Summit, Main Stage, Telehealth for rural clinics); never real event names.
- **Facts:** every number and claim comes from this repo's code and measurements or from a cited source. Never invent customers, quotes, benchmarks or prices.
- **Stuck:** after two honest attempts, write the blocker under "Needs you", leave the code in a clean state, move on.
- **Ledger:** after each task, tick it here and add to `NIGHTLY_REPORT.md`: what changed, how it was checked, cost per hour if any, screenshots taken.

## The work, in order

### Part 1: the three moments (the 1.0 features)

- [x] **1. Slides on the phone, in my language.** The room's computer can share its screen alongside the audio (the browser ingest page via `getDisplayMedia`, and the agent if it's simple). The server samples a frame about every 2 s, detects a slide change cheaply (downscaled image difference, no AI), and only then sends the frame to the text model to read the slide and translate it into each caption language. Phones get a **Slide** view: the current slide image, its translated text laid out readably, and the last few slides to swipe back. Projector unchanged. Local mode: show the slide image without translation unless a local vision model is available; say so. Cost: one image request per slide change per language, stated and capped. Privacy: slides are not stored unless transcripts are.
  Done when: a recorded or synthetic slide deck changes slides in a test and phones receive translated slides; a11y passes; phone screenshots in both themes reviewed.

- [x] **2. Tap a word, understand it.** On the phone page, tapping a word or a short selection in any caption opens a small sheet: the term in the viewer's language, a one-or-two-sentence plain explanation, and what the speaker said about it (a quote from the transcript, with the time). Grounded the same way as the assistant (ADR 0008): the transcript and glossary only, plus the model's general definition clearly labelled as such; cached per talk, language and term; rate-limited. Also an **Easy read** switch: captions rewritten sentence by sentence into plain language (short sentences, common words) for cognitive accessibility and language learners, as an extra caption language.
  Done when: works with the mock and replayed sessions, keyboard and screen reader can open and close the sheet, cost per hour stated.

- [x] **3. Ask the whole event.** A search-and-ask box on the home page and the transcript library: questions across every room and every talk of the event, in the asker's language, answered with quotes, the talk, the room, and a link that opens the transcript at that moment. Keyword search first (fast, free, works offline), the model only to answer and translate. Respects `PUBLIC_TRANSCRIPTS` and roles. Also exposed as an MCP tool.
  Done when: a multi-room fixture answers cross-talk questions correctly in tests; offline keyword search works with no model.

### Part 2: the organizer's moment (growth built into the product)

- [x] **4. Every talk gets its own page.** When a talk ends: a page with title, speaker, room, a summary, chapters with times, key quotes, the full transcript in every language, downloads, and a share button. Beautiful enough that a speaker wants to post it. Only when transcripts are public; organizers can unpublish one talk. Open Graph and structured data so links preview well, `noindex` unless the organizer turns indexing on.
  Done when: the page renders in both themes and on phones, the share preview image is generated from the brand, a11y passes.

- [x] **5. Try it in 30 seconds, no install, no key.** A **Try it** path: the hosted trial (`deploy/hosted/`, try-opencaptions.kvza.ar) opens straight into a demo room already captioning the sample talk with the replayed recording, phone QR included, then "Make it yours" into the welcome wizard. The website's first button and the README's first line lead there. Prepare the deploy steps for the owner; don't deploy.
  Done when: tested locally end to end, a written deploy checklist exists.

- [x] **6. Every attendee learns where it came from.** A quiet "Live captions by OpenCaptions · free for your event" line on the phone page, talk pages and the projector footer, linking to the site with `?ref=` per surface; switch in Settings to hide it. Never on the overlay in the livestream unless switched on.
  Done when: on every surface, the switch works, screenshots reviewed.

- [x] **7. A room from a phone.** For meetups with no sound desk: on the organizer's phone, one button turns the phone into the room's microphone (browser ingest, screen kept awake, level meter, battery warning), and shows the QR for the audience on the same screen.
  Done when: works in Safari and Chrome on phones (test what can be tested headless; list what needs a real device), a11y passes.

### Part 3: polish nobody else has

- [x] **8. Sound, not just words.** (skipped on purpose, see the report)** Deaf viewers miss what isn't speech. Show quiet sound tags in captions and transcripts: [music], [applause], [laughter], [silence], [speaker changes], using what the room already detects (`src/voice.js`, gating, breaks) and simple audio features; never invent what wasn't measured. Off for the overlay by default.
  Done when: tags appear from synthetic audio in tests, styled per brand, announced sensibly to screen readers.

- [ ] **9. The speaker's monitor.** A page for a screen in front of the speaker: their own captions large, the languages being read right now with counts, audience questions translated into the speaker's language and grouped by the AI, and a gentle "slow down" hint when caption delay grows. Crew can hide questions.
  Done when: renders, updates live in tests, a11y passes.

- [x] **10. The first five minutes as a stranger.** Walk download → app → welcome wizard → first captions → phone, on this Mac, with screenshots. Fix every step that needs reading, a key or a decision; the no-key path goes straight to local mode (Apple speech on Macs). Time it; target under two minutes to first caption.
  Done when: the walk with times is in the report, fixes committed.

### Part 4: tell the world (files only; the owner posts)

- [x] **11. The site says what nobody else can.** Rewrite the home page's first screen around the three moments and the price ("about US$0.54 an hour, or free offline"), with a comparison page that cites every competitor price it states. New pages in English and Spanish for searches with urgency: the European Accessibility Act and ADA Title II deadlines (cite official texts), universities, places of worship, city councils, meetups, "subtítulos en vivo gratis para eventos". Build with `scripts/site.js`; check links; don't deploy.
- [x] **12. Launch kit** in `docs/launch/`: Show HN post and first comment; Product Hunt copy and gallery list; posts for r/selfhosted, r/accessibility, r/deaf, r/eventprofs, r/opensource following each community's rules (cite them); LinkedIn and X in English and Spanish; awesome-selfhosted and awesome-a11y entries in their exact format; a 60-second demo script for a real screen recording with sound (the owner records it with `npm run demo:record` plus a real talk).
- [x] **13. First 30 organizations** (16 with sources; how to reach 30 in the file) in `docs/launch/outreach.md`: real public contacts (university accessibility offices, open-source meetups and conferences in Argentina, Spain and Latin America, deaf associations, multilingual churches, councils that stream meetings), why each fits, and a short personal email in their language. Public sources only; nothing sent.
- [x] **14. Knowing it's used, without spying.** A one-page proposal in `docs/launch/measuring.md`: an opt-in "tell us you used it" in the event report, release download counts, `?ref=` visits; what each reveals, checked against `docs/privacy.md`. Proposal only.

### Part 5: ship-ready

- [x] **15. Review everything you built.** Read the full branch diff against `main` for correctness, security (public endpoints, prompt injection into the assistant and slide reader, SSRF, rate limits, cost runaway) and accessibility. Fix what's confirmed, each with a test.
- [x] **16. 1.0 notes.** `CHANGELOG.md` entry for 1.0.0 (don't bump the version or tag), `docs/upgrading.md` notes, every new setting in `docs/reference/configuration.md`, README features updated.
- [x] **17. Report.** `NIGHTLY_REPORT.md`: a five-line summary on top, the three moments with screenshots, commits table, cost per hour of each new feature, what's ready to post, and "Needs you".
- [ ] **18. Pentest with Shannon** ([KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon), AGPL, free; you pay the model). It reads this repo, then runs real exploits (injection, XSS, SSRF, broken auth and authorization) against a running copy and reports only what it proved. Run it against a local copy with sign-in on (`AUTH=on ENGINE=mock`, two passwords set), never the public site: it creates data and fires requests, and the sandbox copies have no sign-in to test. Needs Docker and an Anthropic API key (a Claude Code subscription doesn't work with it); a run takes 1 to 1.5 hours. Read each finding yourself, fix the confirmed ones, each with a test.

## Needs you (filled in during the night)

- ~~Deploy the public demo~~ Done 2026-10-27, differently: try-opencaptions.kvza.ar is now the sandbox (`deploy/hosted/sandbox`), a private one-hour copy per visitor with the admin page and Just for me. The old instance is stopped, its data kept in /opt/opencaptions on the server.

## Sources for "The field"

- Intermind, "Best AI translation tools for conferences, events, and meetings (2026)": https://intermind.com/blog/best-ai-conference-translation-tools
- MarkTechPost, "Top 12 AI Live Translation Tools in 2026" (2026-10-12): https://www.marktechpost.com/2026/10/12/top-12-ai-live-translation-tools-2026/
- Mirrorcaption, "Live Translation for Large Meetings: 2026 Guide": https://www.mirrorcaption.com/en/blog/live-translation-large-meetings
- Boostlingo, "Best Live Translation Apps for Meetings, Events, and Conversations (2026)": https://boostlingo.com/blog/best-apps-for-real-time-ai-translation/
- SCAPTION: https://scaption.app/
- Our own numbers: `docs/overview.md` (Key numbers), `site/pages/en/alternatives.html`.
