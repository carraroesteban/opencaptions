# 1.0 night — 2026-10-29 (main, 4 commits, tagged v1.0.0 locally)

## Summary

- **1.0.0 is ready but not pushed.** The project's git hook (`.claude/hooks/block-dangerous-git.sh`) blocks `git push` for me, so it needs one command from you:
  `git push origin main v1.0.0`
  That publishes the website (Pages), the Docker image, and the Mac/Windows downloads (release workflow).
- **The website now looks like the app.** Dark by default (light still on ◐), the photographed 3D objects are gone, and the first screen is a real talk being captioned: a stage screen and a phone, English and Spanish, with the captions the app actually produced at the moment they arrived. Play adds the talk's sound. It's a recording: no AI call, no cost.
- **The app was checked page by page** (14 pages, desktop and phone, dark and light, English and Spanish). It already matched; two small bugs were fixed (the sound check showed other captions under its mic button; a needless 404 in the browser console).
- Checks: tests 324/324 (twice in a row; one earlier run had a single intermittent failure I couldn't catch again), lint, typecheck, accessibility clean.

## Needs you

1. Run `git push origin main v1.0.0`. Once the Docker image is built (~10 min), update the sandbox:
   `ssh -p5281 root@149.50.150.140 'cd /opt/oc-sandbox && docker compose pull && docker compose up -d'`
2. Look at the new home page: `npm run site`, or the live site after the push. If you don't like the hero, `git revert d34b5a0` brings the old one back.

## Decisions I made (reverse any of them)

- Same colours as before (ink, paper, lime); no new palette.
- Website dark by default; the app keeps following the device's light/dark setting (people read captions for hours; their system setting is an accessibility choice).
- The demo talk's one misspelled Spanish word ("Comenzemos") is fixed with the app's own glossary, as an organizer would, not by editing the recording.
- No App Store / Play Store apps: the browser QR flow is the product's advantage.

## Commits

| Commit | What |
|---|---|
| 7868764 | Spanish where Spanish speakers first look: site redirect, Spanish sandbox event, projector without the repeated line |
| d34b5a0 | Website: dark default, no objects, real-talk window (`scripts/site-talk.js` makes `site/media/talk.json` + `talk.m4a`) |
| 5f291d3 | Sound check overlap; empty call-app answer for events (test added) |
| 7ed3fe3 | v1.0.0 version and changelog |

The four rejected hero prototypes are kept on branch `prototype/hero-variants`, not on main.

## Not checked

- A real phone and Safari for the new hero (headless Chrome only); the audio play button was tested in Chrome.
- Whether GitHub's CI passes on its Windows and macOS runners (it runs after your push).

---

# v1 run — 2026-10-27 (branch `v1/2026-10-27`)

## Summary

- **15 commits, 323 tests passing, lint, typecheck and accessibility clean.** Not pushed, merged, tagged, deployed or posted.
- **Three things nobody else does, built and checked with the real AI:** the slide on every phone with its text translated; tap any word to have it explained from what the speaker said; ask the whole event a question, answered with the talk and a link to the moment.
- **Growth built in:** a public demo that runs forever for free (`deploy/hosted/demo`), "Try it live" first on the site and README, a "Live captions by OpenCaptions" line on audience pages (switchable), talk pages worth sharing, one phone can run a room.
- **The first minutes fixed:** no dead-end review step, the free Mac path first on Macs, the API key's cost shown correctly (it said US$ 2/h; it's ~0.50 + 0.50 per language).
- **Ready to post:** website with four new guides in two languages, `docs/launch/` (Show HN, Reddit, Product Hunt, social, video script, 16 organizations with emails, a measuring proposal).

## Needs you

1. **Publish this branch** (merge, release, image), then **deploy the demo** at try-opencaptions.kvza.ar (`deploy/hosted/demo/README.md`): the site's first button points there.
2. **Deploy the website** (the GitHub Pages workflow) once the demo works.
3. **Record the 60-second video** (`docs/launch/demo-video.md`) and **post** the kit yourself — several communities ban AI-written posts.
4. **Decide:** the speaker monitor (task 9) would show audience questions to the speaker, which today only the asker sees; measuring (`docs/launch/measuring.md`).
5. **Not done:** Easy read captions, sound tags (by choice), a per-talk share image, "unpublish one talk", a real phone test of the new phone features.

## Ledger

- **1. Slides on the phone — done.** `src/slides.js` (deck, reader, cleaning), Stage `addSlide`, ingest socket `{type:'slide'}`, `GET /api/stages/:id/slides/:slide`, **Share slides** on the room page (sends a slide once the screen changed and held still 1 s), **Slide** sheet on the phone. Checked: `test/slides.test.js` (4 tests: limits, cleaning, model call and cost, room → phone through the real server), full suite 313/313, lint, typecheck, a11y. Render-checked with the real Gemini model on a test slide: Spanish text correct, page number dropped; phone sheet light + dark at 390×844, room page dark. Cost: ≈ US$0.001 a slide (one request for all languages). Not checked: a real phone, Safari's screen sharing.
- **2. Tap a word — done (Easy read not yet).** `explain()` in `src/assist.js` + `POST /api/stages/:id/explain`; tap or select a word on the phone → sheet with the meaning, a general-meaning note when the talk doesn't explain it, and the quote with its time; **Explain a word** in the assistant sheet for keyboards. Checked: `test/explain.test.js` (grounding, cache shared across phones, fallback quotes), 315/315, lint, typecheck, a11y. Render-checked with the real model and 40 s of the sample talk: "videollamadas" and "formularios" explained correctly in Spanish, light and dark. **Easy read** (plain-language caption track) skipped for now: it touches every language list; noted for a later pass.
- **3. Ask the whole event — done.** `askEvent()` in `src/assist.js`, `POST /api/ask-event`, `ask_event` MCP tool, a box on the transcripts page, `talk.html?at=mm:ss`. First real try failed: a Spanish question sharing no words with the talk found nothing, so when keywords find fewer than 3 passages the model now reads every talk (even share of ~60k characters). Checked: `test/ask-event.test.js` (3), `test/mcp.test.js`, 318/318, lint, typecheck, a11y; real model with the sample talk: Spanish and English questions answered correctly with the right moment (phone light, desktop dark). Cost ≤ ~US$0.005 a question. Not checked: an event with dozens of long talks (the 60k share thins each talk).
- **4. Every talk its own page — done, two parts left.** `highlights()` + `GET /api/stages/:id/highlights` (chapters, quotes verified word for word), chapters/quotes on `talk.html`, Share via `navigator.share`, server-side `og:title`/`og:description` for public talks, `noindex` unless `INDEX_TALKS=on`. Checked: tests (highlights, preview + noindex), 320/320, lint, typecheck, a11y; real model on 58 s of the sample talk: 3 sensible chapters and 2 real quotes in Spanish (desktop light) and English (phone dark); fixed "00:13" times and lowercase quote starts after looking. **Left:** a per-talk share image (needs PNG rendering; no new dependency allowed — could reuse headless Chrome at build time) and "unpublish one talk" (today: delete).
- **5. Try it live — done (needs a deploy).** `deploy/hosted/demo/`: compose file, event, a new full-talk recording (`talk-en.json`, 58 s, recorded with the real model for about a cent) and a guide; `src/replay.js` starts the recording over when the audio loops (before: a 30 s gap every loop). Website (EN/ES) and README: **Try it live, nothing to install** is the first button, to `https://try-opencaptions.kvza.ar/s/main`. Checked: watched 3 loops (no gap, no restarts), the demo's home and room pages on a phone, `test/replay.test.js`, 321 tests, a11y. **Needs you:** deploy it (README in the folder) — until then the button opens the current 0.9.2 instance, which has no looping room.
- **6. Where the captions come from — done.** `creditLink()` in `common.js`; home footer, phone Aa and assistant sheets, transcripts list, talk page footer (links with `?ref=home|phone|transcripts|talk`), projector footer text `opencaptions.kvza.ar`; `credit` in `/api/event` and `/api/setup`, Settings → Event switch (History entry). Never on the livestream overlay. Checked: HTTP test for the switch, 322/322, lint, typecheck, a11y (an axe finding on the Event mode switch appeared when the new switch sat above it; fine below it), screenshots: home light, phone sheet dark, projector dark, Settings dark.
- **7. A room from a phone — done (headless only).** The audio page already captured a phone's microphone and kept it awake; added the audience QR card on phones (`pointer: coarse`, or `?qr=1`), a battery warning (`navigator.getBattery`, Android Chrome), and no Share slides on phones. Checked: 322/322, lint, typecheck, a11y, phone screenshots light/dark. Found on the way: changing an inline `<style>` needs a server restart (its CSP hash is computed at start) — fine in releases, a trap in development. **Not checked:** a real iPhone/Android (Safari's mic over HTTPS, screen staying awake).
- **8. Sound tags — skipped, on purpose.** Music and breaks already show a banner on phones and the projector (`pauseInfo`); applause and laughter would need a sound classifier (a new dependency) and the plan forbids showing what isn't measured. Worth revisiting if Gemini starts returning non-speech events.
- **10. First minutes as a stranger — done (automated walk, not a person with a stopwatch).** Fresh server, no key, default config, the wizard clicked through in headless Chrome: 7 steps to the dashboard. Fixed: (1) keeping the defaults ended on a review step with a greyed-out primary button and only a "skip" link — now Continue; (2) on a Mac the free path said "free, slower" and came second — now "Start free on this Mac", primary, and the lede says it (Apple speech is as fast as the cloud per docs/local.md); (3) the API key's cost said "US$ 2 a room-hour", 2–4× the measured cost — now "about US$ 0.50 a room-hour plus about 0.50 per translated language"; (4) the dashboard checklist only offered pasting a key. Not done: timing a real person; the wizard is still 7 steps (could be 3 for "just try it").
- **Order changed:** Part 4 (site, launch kit, outreach) before 9 (speaker monitor), because getting found matters more than another feature this week.
- **11. Website — done.** "New in 1.0 · More than captions" on both home pages with real screens from the running app (real model): the slide translated, a tapped word explained, a whole-event answer. Four new guides × 2 languages: public meetings (ADA Title II, WCAG 2.1 AA 1.2.4; dates April 26 2027/2028 checked on ada.gov), universities, places of worship, meetups. Alternatives page: Wordly ~US$1,500/10 h and Maestra ~US$799/day with two cited 2026 guides. No EU Accessibility Act page: its scope doesn't clearly cover event captions, so no claim was made. Found while taking the screens: an English whole-event answer missed the point because the passage after the matching line wasn't sent — now the two following lines go with each match. Checked: site build (now with the new pages in the footer and sitemap), link check, a11y on every site page, screenshots desktop light and phone dark. Not deployed.
- **12. Launch kit — done.** `docs/launch/`: README with the order and each community's rules (sourced), Show HN title, URL (the live demo, since Show HN must be try-able) and first comment with measured numbers and prepared answers, Reddit posts for r/selfhosted (New Project Megathread: under 3 months old), r/accessibility, r/deaf (ask mods first), r/eventprofs, r/opensource, Product Hunt, LinkedIn and X in EN/ES, a 60-second recording script. **Not drafted on purpose:** awesome-selfhosted (first release must be >4 months old; AI-written entries are banned — write it yourself from February 2027).
- **13. Outreach — 16 of 30.** `docs/launch/outreach.md`: deaf associations (AR, ES ×4, CO, WFD directory), UNAM's disability offices, Python and tech conferences in ES/LATAM/MX/CL, FLISoL — each with a public contact and a source link — plus three emails (deaf associations, universities, conferences). Stopped at 16 rather than pad the list with unverified contacts; the file says where the next 14 come from.
- **14. Measuring — proposal written.** `docs/launch/measuring.md`: (1) read what exists — release downloads, `?ref=` visits, GitHub; (2) a "tell us you used it" line in the event report; (3) an opt-in anonymous count, only if 1–2 leave you blind. Recommendation: 1 now, 2 with 1.0. Nothing built.
- **15. Review — two real problems fixed.** (1) `POST /api/ask-event` read every transcript before the rate limit: a flood would make each refused request still read all talks — now read only after the limits (test). (2) The talk page's link preview put the talk's title into `String.replace` as a string: a title with `$&` or `$'` would splice the page into the preview — now a function. Checked the rest by reading: new public endpoints check `canReadTalk`/private rooms; model prompts treat terms, questions and slide text as data; every AI path is cached, rate-limited and counted against the budget; new UI escapes with `esc()`.
- **16. 1.0 notes — done.** `docs/upgrading.md` (0.9.4 → 1.0: nothing to change, the new settings), README features, a 1.0 summary at the top of the changelog. Version not bumped, nothing tagged.
- **9. Speaker monitor — not done.** Skipped in favour of growth work; showing audience questions to the speaker is also a privacy decision for you (today a question is only seen by the person who asks it).

# Nightly report — 2026-10-26 — long session

Branch `nightly/2026-10-26-long-session` (from `origin/main` 127b277). Not pushed, not merged, nothing released or deployed.

## Summary

- **Server:** no memory growth found. Over a 90-minute soak, the lowest heap stayed flat at 18–26 MB. RSS climbed in steps from 48 to 117 MB, then held at 117 MB for the last 20 minutes. Loop lag p99 stayed at or under 5 ms. No server code changed.
- **Phones:** there were four real bugs, all on the phone page. They're fixed and tested:
  1. A phone only reconnected after more than 20 s in the background. A quick trip to the lock screen could leave it on a dead socket.
  2. Coming back from the back/forward cache didn't reconnect at all.
  3. Reconnecting replaced the reader's 200 lines of scrollback with the server's last 40.
  4. Speech that never ended a sentence grew one paragraph forever.
- Review then found more problems, also fixed: the page jumped to the bottom on return, a bfcache restore opened two sockets, and a pending retry could replace the new socket.
- `npm test` passes 309/309. `npm run a11y` finds no problems. Lint and typecheck are clean.

## Commits

| Commit | What |
|---|---|
| 3080d2f | `npm run soak` (scripts/soak.js): a mock-engine server, rooms that hear speech all the time, phones that come and go, heap/RSS/lag every 2 s, MB/h after warm-up |
| ade946b | Phone page: reconnects on any return over 1 s and on bfcache `pageshow`. Dims the text and says "Reconnecting" until live. `CaptionState.load(history, partial, keep)` merges by id in the same talk. Paragraphs break at 4× line length. No status timer while hidden |
| 356813d | Docs: architecture failure row and quality table, configuration (`npm run soak`), CHANGELOG |
| 3955263 | Review fixes: keep the reader's place (and show "back to live"). One reconnect per return. Listen-to-room retries its own ghost connection for 60 s. A new talk while away clears every language. `#status` is `role="status"` |
| e058ef3 | Soak: 2 s sampling, survives a failed sample, reports if the server dies |
| 2f25a75 | Changelog wording |

Files changed: `public/common.js`, `public/pages/watch.js`, `public/watch.html`, `test/phone.test.js` (new), `scripts/soak.js` (new), `package.json`, `docs/architecture.md`, `docs/reference/configuration.md`, `CHANGELOG.md`.

## Evidence

- **The tests prove the bugs.** Against the `origin/main` phone code, every new test in `test/phone.test.js` fails. On this branch they all pass. The tests use headless Chrome over CDP and skip when there's no Chrome.
- **Full suite:** 309/309, three runs in a row after the last code change, and once more this morning.
- **Soak, 90 min:** 2 rooms, 40 phones, one phone dropping and returning every 5 s. That's 916k caption messages and 1,120 reconnects with history. Heap and RSS by minute:

  | min | 5 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | heap MB (lowest) | 19 | 20 | 18 | 20 | 21 | 26 | 21 | 19 | 22 | 26 |
  | RSS MB | 48 | 62 | 75 | 79 | 109 | 112 | 112 | 117 | 117 | 117 |

  The script's straight-line fit says RSS grows 48 MB/h. That number is misleading. RSS jumps in steps and then holds, which looks like the allocator keeping pages it once used, not a leak: the live heap doesn't grow. Loop lag p99 was 2.5–5.2 ms. The worst single spike was 66 ms.
- **Server buffers are capped** (checked by reading the code): finals 5000, stage logs 100, heard names/words 2000/5000 (reset each talk), preroll, translator queues, rate-limiter times.

## How to check

```
npm test
npm run a11y
npm run soak -- --minutes 480 --out data/soak-8h.json   # the full 8 hours; mock engine, no AI calls
```

## Edge cases

| Case | Status | Proof |
|---|---|---|
| Back after a few seconds (lock screen) | Handled | test "back from a few seconds in the background…" (Reconnecting at once, live ≤ 2 s, no line lost or doubled) |
| Back from bfcache | Handled | test "back from the back/forward cache…" (exactly one new WebSocket) |
| Reader scrolled up | Handled | test "a reader scrolled up…keeps their place" |
| Away longer than the 40-line history | Handled | test "history after a reconnect" (gap → replace, never joins across a gap) |
| New talk started while away | Handled | Reasoning plus a code path that clears every language and shows a toast; no automated test |
| Very long talk, no punctuation | Handled | test "a long talk keeps the page bounded" (≤ 120 paragraphs, 200 finals in memory) |
| Listen-to-room "full" from its own ghost connection | Partly | Reasoning only: retries for 60 s while the server drops the ghost (~50 s); no test |
| Half-dead iOS socket (open but silent) | Partly | Covered by reconnecting on every return; tests fake visibility, not a real iOS socket |
| Real Safari/Chrome bfcache with an open WebSocket | Not verified | Needs a real phone |
| Screen/overlay pages showing "reconnecting" | Not done | Out of scope (phone page only) |
| Floating PiP showing the down state | Not checked | — |

## Not done, and risks

- **The 8-hour objective isn't directly measured.** The longest soak was 90 minutes. Run the 8-hour command above to confirm the RSS plateau holds.
- **No real phones.** iOS Safari and Android Chrome weren't tested on actual hardware: suspend, bfcache eligibility, and how long a ghost socket lingers.
- The test ports are random, with no check for a port already in use, so a test can rarely fail if the port is taken.

## Unrelated problems found

- `src/store.js:59` calls `fs.appendFileSync` for every final caption. That's synchronous disk I/O on the event loop. It's cheap on a fast disk but can stall the loop on a slow one.
- Cloudflare on `kvza.ar` rewrites the JS cache headers to `max-age=14400`, so phones can run old code for up to 4 h after an update. To fix: Cloudflare dashboard → Caching → Configuration → Browser Cache TTL → "Respect Existing Headers".
- i18n has about 70 keys that may be unused.
- In `server.js`, `hueOf` counts the personal room, so room colors are offset by one.
