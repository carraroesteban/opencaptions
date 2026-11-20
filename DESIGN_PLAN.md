# Design 2.0 rollout plan (2026-10-31)

Approved look: the mock in the session scratchpad (`proto3/`, "Qronos" direction) with:
- the **lines** wallpaper (fine horizontal lines that bend with a voice), our own code (React Bits can't be used: Pro forbids
  public repos, free is MIT + Commons Clause "no ported versions");
- **follow the device** for light/dark everywhere (website too), except projector screen and livestream overlay (dark);
- **no monospace capitals**: labels, buttons, menu, tags in the text font, sentence case. Monospace only for timestamps,
  logs and aligned numbers;
- light headlines (Inter 300), black/white pill buttons, hairline borders, panels instead of tinted cards, lime only
  as a small dot (logo line, "live"), no gradients/glows/tinted cards/coloured initials/drifting marquee, no AI photos.

Rules: keep every CSS variable name (pages use them); change values first, then page by page. Render-check each page in
light, dark, phone and es-AR ([[ui-polish-checks]], [[consistency-every-page]]). `npm test` + `node scripts/a11y.js`
after each phase. Generic examples only. No commits unless asked.

## Phase 0 · Foundation
- [x] fonts: Inter 300..800 (scripts/fetch-fonts.js range), interface font = Inter, display = Inter 300
- [x] public/tokens.css: new palette light + dark (follow device), radii (12/18, pills), no shadows/glows, lime only `--accent` dot
- [x] public/style.css + controls.css: buttons (outline pill / solid), tags, panels, headings 300, kickers sentence case
- [x] public/lines.js: the wallpaper (reduced motion = still frame, pauses when hidden), shared by site and app

## Phase 1 · Website (site/)
- [x] site.css + index.html (EN) + es/index.html: hero with lines + live caption, sections as the mock, copy changes
      (limits next to price, CART-only comparison, audio/transcripts + accessibility answers, "Cost")
- [x] guide layout (scripts/site.js) + site/pages/*: new header, TOC, on-this-page
- [x] AI photos gone from the home (drawn screens instead) and hidden on guides (.doc-pic)
- [x] AI pictures deleted (public/art, site/media/home) and every reference removed (guides, docs headers, 404, tests); screenshots regenerated

## Phase 2 · App pages (public/)
- [x] welcome.html (setup) · admin.html (dashboard, settings, transcripts list) · ingest.html (sound)
- [x] watch.html + audience.css (phone) · index.html (audience home) · talk.html / talks.html (transcripts)
- [x] screen.html (projector, dark) · overlay.html (dark) · me.html (Just for me) · report.html · kit.html · style.html · demo.html

## Phase 3 · Finish
- [x] tests 339/339, a11y clean, pages render-checked, README hero + og.png + docs screenshots new, website checked at phone size

## Log
- 2026-10-31: Phase 0 + website home (EN/ES, generated from one template: scratchpad gen-home.py) + guides done; 339/339 tests pass. Next: Phase 2, app pages, starting with welcome/admin/ingest.
- 2026-10-31: Phase 2 done: every app page swept (no capitals, lighter weights, no gradients/glows/lime fills, room colour as a thin underline/dot), AI pictures replaced (setup: drawings + lines; audience home: lines unless the event uploads its own picture; empty states: text; poster: drawn icon). 339/339 tests, a11y clean (site + app, light/dark, EN/ES). Left: delete unused public/art + site/media/home pictures, regenerate README/docs screenshots, phone-size pass on the website.
