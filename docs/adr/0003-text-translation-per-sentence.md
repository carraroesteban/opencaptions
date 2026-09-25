# 0003. Translate captions per sentence with a text model by default

- Status: Accepted
- Date: 2026-09-24

## Context

Live Translate's speech-to-speech output is generated at speaking pace. On long, dense talks, the translated transcript drifted further and further behind the speaker. Running one Live session per target language also multiplies cost. Translating short clauses fixed the delay, but quality dropped and the request rate hit HTTP 429 limits.

## Options considered

1. `live`: use Live Translate's own translation, one session per language.
2. `text`: one Live session for the original, plus Gemini Flash-Lite translating each finished sentence, with provisional translations of the sentence in progress on a timer.
3. Clause-level translation on every fragment.

## Decision

Option 2 is the default (`TRANSLATION_MODE=text`). Options 1 and a `hybrid` mode stay available per room. Protections:

- A global rate limiter (`MT_RPM`).
- Timeouts (`MT_TIMEOUT_MS`) and retries with backoff.
- Provisional updates are sacrificed first under pressure.
- Automatic fallback to Live's own translation for the primary language while throttled.

## Consequences

- Good: translation delay is bounded at about the transcription delay plus one short request (measured 4.6–5.7 s). One streaming session per room regardless of languages. Sentence context and glossary give better translations.
- Bad: extra cost of about US$ 0.4–0.6 per talk-hour per language, mostly from provisional updates. Tunable with `MT_PARTIAL_MS`.
- Bad: translated voice is only available for the primary language in this mode.
