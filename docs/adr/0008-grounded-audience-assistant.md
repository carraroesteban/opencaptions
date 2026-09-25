# 0008. A grounded, cached audience assistant

- Status: Accepted
- Date: 2026-09-25

## Context

Live captions help people who are in the room and paying attention. They don't help:

- people who walk in late;
- people who got distracted for a few minutes;
- people who want to check something that was said.

The transcript already exists, in several languages, and the translation model (Gemini Flash-Lite) is already configured. The audience endpoints are public, so anything we add must have a bounded cost and resist abuse and prompt injection.

## Options considered

1. No assistant: captions and downloads only.
2. A free-form chatbot about the talk, with general knowledge.
3. Two narrow features grounded in the transcript: a summary (last 5 minutes or the whole talk) in the viewer's language, and question answering that must quote the transcript or say the answer isn't there.

## Decision

Option 3 (`src/assist.js`), with these rules:

- The model receives only the transcript (at most about 60 000 characters) and the question. It has no tools and no web access. It must return JSON with quotes and timestamps, or `found: false`.
- Summaries are cached per room, language and scope, and shared by every viewer: 45 s (last 5 minutes) or 2 min (whole talk) while live, 24 h after.
- Questions are rate-limited per client (6/min) and globally (30/min). Both limits are configurable, and `AUDIENCE_AI=off` disables model calls.
- Access follows the transcript rules (`PUBLIC_TRANSCRIPTS`).
- Without a model (mock mode, errors, quota), the assistant falls back to extractive highlights and keyword quotes, so the UI always answers something useful.

## Consequences

- Good: a visible, genuinely useful feature for latecomers and for accessibility, in any caption language.
- Good: a summary of a one-hour talk costs well under one US cent, and caching makes the cost independent of audience size.
- Bad: answers are only as good as the recognized transcript. The glossary and pinned languages help.
- Bad: the shared per-IP question limit can throttle many phones behind one venue NAT. The global limit protects the budget either way.
