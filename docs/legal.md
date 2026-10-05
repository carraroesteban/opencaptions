# Licenses, third parties and your responsibilities

This page lists what OpenCaptions is made of, under which licenses, and what an organizer is responsible for when using it at an event. It's practical information, not legal advice: for your situation, ask a lawyer.

## OpenCaptions itself

OpenCaptions is released under the [MIT license](../LICENSE). Anyone may use, copy, modify and sell it, including commercially, as long as the copyright and license notice stay with it. The software is provided **"as is", without warranty of any kind**, and the authors aren't liable for any claim or damage arising from its use. That includes captions that are wrong, late or missing during an event.

## Third-party components

| Component | What it's for | License | Notes |
|---|---|---|---|
| npm dependencies (`express`, `ws`, `qrcode`, `dotenv`, `@google/genai` and what they use) | The server | MIT, ISC, BSD and Apache-2.0 | All allow commercial use. `npm ls --all` lists them. |
| [ffmpeg](https://ffmpeg.org/legal.html), through `ffmpeg-static` (optional) | Reading streams and non-WAV files | GPL | Downloaded by `npm install` on your machine, not bundled with OpenCaptions. OpenCaptions runs it as a separate program. |
| ffmpeg in the Docker image | Same | GPL / LGPL, from Debian | Installed from Debian's packages; their sources are at [sources.debian.org](https://sources.debian.org/src/ffmpeg/). |
| [cloudflared](https://github.com/cloudflare/cloudflared) | The one-click public address | Apache-2.0 | Downloaded on first use, or included in the Docker image. Using Cloudflare's tunnel means accepting [Cloudflare's terms](https://www.cloudflare.com/website-terms/). |
| Fonts: Atkinson Hyperlegible Next, Bricolage Grotesque, and the caption fonts Inter, Atkinson Hyperlegible, Lexend, Roboto, Open Sans and Montserrat | Interface and captions | SIL Open Font License 1.1 | Included in `public/fonts/`, each with its license and copyright ([list](../public/fonts/README.md)). Served by OpenCaptions itself, so pages don't contact Google. |
| Illustrations and animations in `public/art/` and `site/media/` | Interface and website | Part of this repository | Generated for OpenCaptions with Higgsfield (GPT Image 2.5 and Kling), from prompts and drawings made for the project. |

## The AI you connect

OpenCaptions doesn't include an AI model or an account. You choose one, and its terms apply between you and its provider:

- **Gemini (Google AI Studio or Vertex AI):** you accept the [Gemini API terms](https://ai.google.dev/gemini-api/terms) when you create a key. Read the section on data use. With the **free tier**, Google may use what you send (the room's audio and the text) to improve its products, and people may review it. With a **paid** key (billing enabled) or Vertex AI, it isn't used that way. For events where speakers or the audience share personal information, use a paid key or Vertex AI. Google's terms also limit where and by whom the free tier can be used; check them for your country.
- **Local mode:** Whisper (MIT) recognizes speech, and an open model through Ollama translates. The default, Gemma, comes with the [Gemma terms of use](https://ai.google.dev/gemma/terms) and its prohibited use policy. Other models have their own licenses. Nothing is sent to anyone.

## Your responsibilities as an organizer

When you run OpenCaptions at an event, you're the one deciding what is recorded, where it's processed and who can read it. In data protection terms you are usually the *data controller*: in Argentina under Law 25.326, in the EU under the GDPR, and similar rules elsewhere.

- **Tell people.** Let speakers know before the event that their talk will be transcribed by AI, where the audio is processed (Google, or a computer at the venue) and whether transcripts will be published. Tell the audience too, on the QR posters, the event website or the registration page. A template is below.
- **Get speakers' agreement to publish transcripts.** The talk in progress is public on the captions page by default; past talks are only public if you set `publicTranscripts` to `all`. Turn it off for talks that shouldn't be published.
- **Questions from the audience are speech too.** Microphones used for Q&A are captioned like everything else.
- **Keep only what you need.** Transcripts stay in your `data/` folder until you delete them. Audio is never written to disk.
- **Don't promise what AI can't do.** AI captions contain mistakes, and the captions pages say so. Where accuracy is required by law or contract (courts, hearings, medical settings, some education and public-sector duties), use professional human captioning or review the transcripts. Captions don't replace sign language interpretation.
- **If you offer captioning as a paid service** to other organizers, put the scope, the expected accuracy and the limits of your liability in your contract with them. The MIT license protects the authors of OpenCaptions, not your business.

### Notice template

Adapt it to your event and put it on the registration page, the event website or the QR posters.

> **Live captions.** Talks at this event are captioned and translated live by artificial intelligence with OpenCaptions. The room's audio is processed by [Google's Gemini service / a computer at the venue] only to produce the captions; it isn't recorded. Written transcripts of the talks are kept by [organizer] and [published on the event website / not published]. Captions may contain mistakes. Questions: [contact].

> **Subtítulos en vivo.** Las charlas de este evento se subtitulan y traducen en vivo con inteligencia artificial mediante OpenCaptions. El audio de la sala lo procesa [el servicio Gemini de Google / una computadora en el lugar] solo para generar los subtítulos; no se graba. Las transcripciones escritas las conserva [organizador] y [se publican en el sitio del evento / no se publican]. Los subtítulos pueden contener errores. Consultas: [contacto].

## Names used in examples

The example event (Horizon Summit), its speakers and its talks are fictional. Any resemblance to real events or people is unintended.
