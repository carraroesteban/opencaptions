# Every page polished for 1.0, one by one (2026-10-29)

The owner: "commit everything, do the readme, every page that an end-user can reach, update it, all polished with the
1.0 … every page, go 1 by 1" and "re-do the horizon summit ai voice with the new one" (Horizon Summit is a real event).

## Per-page checklist (each page, then tick it with one line of evidence)

Render desktop 1440 + phone 390, dark + light, English + Spanish; look at the screenshots. Then: no console errors or
404s; content current for 1.0 (no removed features, no stale numbers, no "Horizon Summit" or real event names); same
design language as the new website (type, eyebrows, cards, buttons, focus, reduced motion); Spanish spelled right
(accents, voseo); a11y audit clean. Fix what's wrong, re-render, tick.

## A. The example event's name and voice
- [x] A1 (new voice 59.3 s / 48.0 s) samples/talk-en.txt, talk-es.txt: "thanks for coming to OpenCaptions Live"; `./scripts/make-samples.sh`
- [x] A2 (both recorded; replay stitches joined pieces; e2e 3/3 stable) re-record the AI: test/fixtures/talk-en.json (30 s), deploy/hosted/demo/talk-en.json (whole talk)
- [x] A3 (324/324) fixtures, glossary example, tests, scripts, docs: Horizon Summit → OpenCaptions Live; tests green
- [x] A4 (4 script shots; kit/hero/style by hand: in B1) screenshots again (`npm run screenshots`): docs/images, site/media/screens

## B. README
- [x] B1 (banner top, 1.0 lines EN/ES, real-app shots, kit by script, og + social preview; style.png waits for D13) README.md (English and the Spanish section): 1.0, new website look, images, links

## C. Website (25 pages) — all rendered desktop+phone, no console errors, width 390 on phones, a11y clean, 324/324
- [x] C0 (picture headers, contents list, dark panel, picture cards, FAQ in menu) guide template (scripts/site.js) in the new design language
- [x] / · /es/ (7ca63a3)
- [x] /faq/ · /es/preguntas-frecuentes/
- [x] /how-to-caption-an-event/ · /es/como-subtitular-un-evento/
- [x] /alternatives/ · /es/alternativas/
- [x] /live-captions-for-conferences/ · /es/subtitulos-en-vivo-para-congresos/
- [x] /live-captions-for-meetups/ · /es/subtitulos-en-vivo-para-meetups/
- [x] /live-captions-for-places-of-worship/ · /es/subtitulos-en-vivo-para-celebraciones/
- [x] /live-captions-for-public-meetings/ · /es/subtitulos-en-vivo-para-sesiones-publicas/
- [x] /live-captions-for-universities/ · /es/subtitulos-en-vivo-para-universidades/
- [x] /live-captions-for-video-calls/ · /es/subtitulos-en-vivo-para-videollamadas/
- [x] /privacy/ · /es/privacidad/
- [x] /accessibility/ · /es/accesibilidad/
- [x] /404.html

## D. The app, every page (audience first)
- [x] D1 / (room list) · D2 /s/main → watch (phone) · D3 screen (projector) · D4 overlay (livestream)
- [x] D5 talks (transcripts) · D6 talk (one talk) · D7 me (just me) · D8 kit (QR posters)
- [x] D9 welcome (setup) · D10 admin (dashboard, sign-in) · D11 demo (sound check) · D12 ingest (room audio)
- [x] D13 style (caption style) · D14 report (event report)

## E. Docs an organizer reads (GitHub)
- [x] (swept for stale names, pictures, website, 1.0; FAQ gained the audience question) getting-started, first-launch, personal, faq, overview, requirements, deployment, local, recording,
      integrations, networking, latency, privacy, accessibility, upgrading, security-guide,
      operations/day-of-event, operations/event-day.es, operations/runbook, operations/troubleshooting, legal

## F. Ship
- [x] full checks (324/324, lint, a11y), commits per group, report
