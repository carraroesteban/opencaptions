# 0002. Gemini Live Translate for recognition, with echo enabled

- Status: Accepted
- Date: 2026-09-24

## Context

We need streaming speech recognition with language detection, low latency and good handling of technical vocabulary and English–Spanish code-switching. The Vibeathon recommends Gemini audio models. Gemini 3.5 Live Translate returns, in one streaming session, the input transcription (with detected language), a translation transcript and translated speech.

## Options considered

1. Gemini Live Translate (`gemini-3.5-live-translate-preview`).
2. A general Gemini Live model prompted to transcribe.
3. A dedicated speech-to-text API, or local Whisper.

## Decision

Option 1, using `inputAudioTranscription` as the source of truth for the original captions. `echoTargetLanguage` stays **enabled**. In tests, sessions with echo disabled and an automatically detected source language almost stopped transcribing (17 s delays). With echo on, we ignore the parroted output when the speaker already uses the target language and pass the transcription through instead.

## Consequences

- Good: about 3 s to the first original-language words, automatic language detection, vocabulary hints, session resumption for long talks.
- Bad: it's a preview model, so behaviour and quotas can change. Mitigated by config fallback levels and the engine interface, which allows swapping engines.
- Bad: interim transcription isn't delivered by this model today, so partial captions depend on how often the model emits text.
- Follow-up: a local engine (Gemma) for offline events, behind the same interface.
