# OpenCaptions 1.0 — one look everywhere, then ship (night of 2026-10-29)

The owner went to sleep after saying: "do something innovative and push 1.0 and use the same colors and designs on
the app and website, i don't want just the hero, i want the whole app, website, everything". They rejected four hero
prototypes (particles, dithered video, language field, voice strip) and like dark, premium sites: designeer.xyz,
motionsites.ai, jetbrains.com, see.io (dark navy with soft colour glows, one accent word in the headline, a big
"prompt" card, a fake browser window showing the product working, numbered steps).

## Decisions taken (write them in the morning summary; the owner can reverse them)

1. **Same colours as today** (`public/tokens.css`): ink #111014, paper #FAF8F3, lime #D4FF3A. Lime only on ink, or
   as a fill with ink on top. No new gradient palette.
2. **The website becomes the app's look**: dark by default (ink), light still on the ◐ button; the realistic 3D
   objects leave the hero; the app's line illustrations, cards, pills and live-caption style are used everywhere.
3. **One shared design layer** for app + site in `public/tokens.css` / `public/style.css` (the site already loads
   both): soft glows behind key areas, 1px hairline cards with large radii, pill chips, monospace eyebrow labels,
   lime "live word" highlight used as the brand's emphasis. Pages pick it up from shared classes, not copies.
4. **The innovative part**: the website's first screen shows a *real* talk being captioned (the recorded talk in
   `test/fixtures/talk-en.json` and its audio), in a product window like see.io's: press play, hear it, watch the
   captions and two translations arrive at the real timing. No AI call, no server: it's a recording.
5. **Ship 1.0 only green**: version 1.0.0, changelog dated, tests + lint + typecheck + a11y green, every page
   render-checked. Then push `main`, tag `v1.0.0`, watch CI/release/docker/pages, update the sandbox. If the redesign
   isn't green by the end, ship 1.0 with what is green and leave the rest on a branch.

## Rules

- No `Co-Authored-By` / "Generated with" lines. Commit per finished task, repo commit style (plain sentence).
- Green before every commit: `npm test`, `npm run lint`, `npm run typecheck`; `npm run a11y` when a page changed.
- Render-check every changed page (desktop 1440 and phone 390, light and dark, English and Spanish), look at the
  screenshots, not just tests. Audience pages too (index, watch, screen, talks, talk, me, overlay). Generic examples.
- No new dependencies, no CDN, CSP stays as is (inline `<style>` needs a server restart: hashes at startup).
- Accessibility is the product: contrast AA, focus visible, ≥24 px targets, reduced motion respected.
- Restart the mock server after CSS edits; driver script: scratchpad `drive.mjs` (url/js/wait/move/key/shot/console).

## Tasks (in order; mark each `[x]` with one line of evidence)

- [x] 0. (7868764 on main; prototypes on branch prototype/hero-variants ef34a1e) Commit the pending fixes (Spanish sandbox/site/projector). Move `prototypes/` to branch
      `prototype/hero-variants` (commit there), remove it and its eslint line from main.
- [x] 1. (not needed as a new layer: app and site already share tokens.css + style.css; the gap was the site's own light layer, fixed in 2) Shared design layer: tokens + components in `public/style.css` (glow, hairline card, pill, eyebrow, live
      word), documented in `docs/brand.md`. Done when: app pages use it without visual regressions (screenshots).
- [x] 2. (d34b5a0: dark default, objects gone, real-talk window EN/ES, glossary-fixed; tests 324/324, a11y clean, render-checked desktop/phone/light/dark/reduced) Website home, all sections, dark by default, EN + ES: hero (headline with the live-word highlight, the two
      buttons, the real-talk product window), live captions, 1.0 moments, features, how it works (numbered steps),
      pricing, FAQ, get started, footer. Done when: both homes render-checked desktop/phone/light/dark, a11y clean.
- [x] 3. (template dark by default; guide render-checked; site test 3/3) Website guides and legal pages pick up the new layout (scripts/site.js template). Done when: every built
      page renders and the site test + link check pass.
- [x] 4. (all 14 pages, desktop+phone, dark+light, EN/ES: consistent; fixed the sound check overlap and a console 404; app keeps following the system theme) App pages, every one: dashboard (admin), welcome, me, index, watch, screen, talks, talk, kit, style,
      report, demo, ingest, overlay, sign-in. Same components, same feel as the site. Done when: each rendered.
- [x] 5. (not needed: the app's look didn't change, the existing screenshots still match) Fresh screenshots of the app for site/README (`npm run screenshots`), docs images if they show old UI.
- [~] 6. (7ed3fe3 version + changelog, tag v1.0.0 local, checks green; the push is BLOCKED by the project's git hook,
      so the owner runs it — see NIGHTLY_REPORT.md) 1.0: package.json 1.0.0, site JSON-LD softwareVersion, CHANGELOG `[1.0.0] - date`, docs/upgrading.
      Full checks green. Push main, tag v1.0.0, push tag. Watch CI, release, docker, pages until green.
- [ ] 7. (blocked on 6: needs the published image) Sandbox on try-opencaptions: `docker compose pull && docker compose up -d` in /opt/oc-sandbox once the
      1.0 image is published; check a Spanish and an English copy start.
- [x] 8. (NIGHTLY_REPORT.md top) Morning summary in `NIGHTLY_REPORT.md` (top): what shipped, links, decisions, what wasn't checked.
