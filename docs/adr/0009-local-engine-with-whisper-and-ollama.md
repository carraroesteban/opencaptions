# 0009. A local engine: streaming Whisper and a local text model, behind HTTP

- Status: Accepted
- Date: 2026-09-25

## Context

OpenCaptions depended on Gemini for everything: recognition, translation and the audience assistant. Some events can't or won't use a cloud service: venues without reliable internet, talks under NDA, organizers without a billing account, or people who just want to try the project. [ADR 0002](0002-gemini-live-translate-for-recognition.md) left a local engine as a follow-up, behind the engine interface.

Constraints:

- It has to run on the laptops organizers already have (mostly Macs, some Linux and Windows), without a GPU.
- Installing it must not be harder than installing Ollama. The main `npm install` must stay small and free of native builds.
- The rest of the product (captions, tracks, agenda, transcripts, dashboard) must not change.
- Captions must still appear while the speaker talks, not only at the end of each sentence.

## Options considered

1. **A speech model inside the Node.js process** (native bindings to whisper.cpp or ONNX Runtime). One process, but a native dependency in every install, and a slow or crashing model would take the whole server down with it.
2. **A true streaming recognizer** (for example sherpa-onnx's streaming Zipformer models). Low latency, but English- or Chinese-centric models, no good multilingual option for Spanish, English and Portuguese with automatic language detection.
3. **Whisper behind HTTP, made to stream by OpenCaptions**, plus a local text model behind HTTP for translation and the assistant. The speech server can be whisper.cpp, WhisperKit, any OpenAI-compatible transcription server, or a small bundled one. The text model can be Ollama or any OpenAI-compatible chat server.

## Decision

Option 3, as `ENGINE=local`:

- `src/engines/local.js` implements the engine interface. It cuts audio into utterances with an energy detector, re-transcribes the utterance in progress about once a second, commits the words two consecutive passes agree on ("local agreement") and shows the rest as provisional text. A final pass completes each utterance. Monologues are cut at the quietest moment after 12 s.
- `src/local/asr.js` speaks two dialects: whisper.cpp's `/inference` and OpenAI's `/v1/audio/transcriptions`. It removes Whisper's known hallucinations and queues requests so final passes are never delayed by provisional ones.
- `src/local/llm.js` speaks Ollama's API (with `keep_alive` and `num_ctx`) and OpenAI-compatible chat. Final translations get priority; provisional ones are skipped while the model is busy. An optional separate translation model (`LOCAL_MT_MODEL`, for example TranslateGemma) gets the prompt it was trained on.
- `scripts/local-asr-server.js` is a bundled speech server on sherpa-onnx's prebuilt packages (macOS, Linux, Windows; CPU). It's installed into `local/runtime` on first use, not as a dependency of the project.
- `npm run local` finds or starts the speech server, starts Ollama, downloads models once, and runs the server or an end-to-end check.

## Consequences

- Good: OpenCaptions runs with no account, no internet after setup, and no cost per hour. Audio never leaves the machine.
- Good: the servers are replaceable. A GPU machine, WhisperKit on the Neural Engine, or a hosted OpenAI-compatible endpoint all plug in with one URL, and several OpenCaptions servers can share them.
- Good: the main install is unchanged. Tests cover the streaming logic with a fake Whisper, both HTTP dialects and the translation prompts.
- Bad: higher delay on a CPU, about 4–5 s behind the speaker with Whisper `small`, against 2–3 s with Gemini. Each pass re-transcribes the whole utterance, which costs more than a streaming model would.
- Bad: one speech server handles one request at a time, so capacity is about one room per laptop today. Sharding rooms across machines (`STAGES`) and GPU servers with `LOCAL_ASR_CONCURRENCY` are the ways to scale.
- Bad: no translated voice, and accuracy depends on the chosen models.
- Follow-ups: measure the Neural Engine and GPU backends; per-room speech servers; a streaming text-to-speech voice with a local model.
