// Apple's on-device speech recognition and translation for OpenCaptions' local mode (src/local/apple.js,
// docs/local.md). Compiled on first use with the Mac's own swiftc; macOS 26 or later. One JSON object per line out.
//
//   opencaptions-apple check [--lang en] [--to es,fr]   what this Mac can do (languages installed, downloadable)
//   opencaptions-apple listen --lang en [--vocab '["Name"]']
//       stdin: 16 kHz mono PCM16LE. stdout: {"partial":…,"w":…} while a sentence is spoken, {"final":…,"start":s,"end":s,"w":…}
//       when it is settled (w: each word and when it was said, [[text, start, end], …]). SIGUSR1 = the room went quiet:
//       settle what was heard. End of stdin: settle and exit.
//   opencaptions-apple translate
//       stdin: {"id":1,"text":…,"from":"en","to":"es"} per line. stdout: {"id":1,"text":…} or {"id":1,"error":…}
//   opencaptions-apple speak
//       stdin: {"id":1,"text":…,"lang":"es","rate":1} per line, read aloud one at a time with the Mac's best voice for
//       the language. stdout: {"id":1,"pcm":base64} (24 kHz mono PCM16LE, the phones' 🎧 format) as it's made, then
//       {"id":1,"done":true,"voice":…} or {"id":1,"error":…}
import AVFoundation
import Foundation
import Speech
import Translation

let out = FileHandle.standardOutput
func emit(_ o: [String: Any]) {
  guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.withoutEscapingSlashes]) else { return }
  out.write(d + Data([10]))
}
func arg(_ k: String) -> String? {
  let a = CommandLine.arguments
  guard let i = a.firstIndex(of: "--\(k)"), i + 1 < a.count else { return nil }
  return a[i + 1]
}
func code(_ l: Locale) -> String { l.language.languageCode?.identifier ?? l.identifier }

@available(macOS 26, *)
func speechLocale(_ lang: String) async -> Locale? {
  // "en" alone matches any English (en-NZ, seen): prefer this Mac's region, then the language's main one (en-US, es-ES).
  let l = Locale.Language(identifier: lang)
  let ids = await SpeechTranscriber.supportedLocales.map { $0.identifier(.bcp47) }
  let base = l.languageCode?.identifier ?? lang
  for r in [l.region?.identifier, Locale.current.region?.identifier, l.maximalIdentifier.split(separator: "-").last.map(String.init)] {
    if let r, ids.contains("\(base)-\(r)") { return Locale(identifier: "\(base)-\(r)") }
  }
  return await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: lang))
}

// ---------- check ----------
@available(macOS 26, *)
func check() async {
  let lang = arg("lang") ?? "en"
  var o: [String: Any] = ["speech": SpeechTranscriber.isAvailable]
  o["installed"] = Array(Set(await SpeechTranscriber.installedLocales.map(code))).sorted()
  o["supported"] = Array(Set(await SpeechTranscriber.supportedLocales.map(code))).sorted()
  if let loc = await speechLocale(lang) {
    o["locale"] = loc.identifier
    let st = await AssetInventory.status(forModules: [SpeechTranscriber(locale: loc, preset: .progressiveTranscription)])
    o["status"] = "\(st)" // installed | supported (downloadable) | downloading | unsupported
  }
  let la = LanguageAvailability()
  var tr: [String: String] = [:]
  for to in (arg("to") ?? "").split(separator: ",") where to != lang {
    tr[String(to)] = "\(await la.status(from: Locale.Language(identifier: lang), to: Locale.Language(identifier: String(to))))"
  }
  o["translation"] = tr // installed | supported (System Settings → General → Language & Region → Translation Languages) | unsupported
  emit(o)
}

// ---------- listen ----------
/// Each piece of the text with its own time range (about a word) and when it was said: [[text, start, end], …] in
/// seconds of the sound sent. Lets two helpers listening to the same sound hand over at an exact moment.
@available(macOS 26, *)
func timedWords(_ text: AttributedString) -> [[Any]] {
  var out: [[Any]] = []
  for run in text.runs {
    guard let range = run[AttributeScopes.SpeechAttributes.TimeRangeAttribute.self] else { continue }
    let piece = String(text[run.range].characters)
    if piece.trimmingCharacters(in: .whitespaces).isEmpty { continue }
    out.append([piece, range.start.seconds, range.end.seconds])
  }
  return out
}

@available(macOS 26, *)
func listen() async throws {
  let lang = arg("lang") ?? "en"
  guard SpeechTranscriber.isAvailable, let locale = await speechLocale(lang) else {
    return try await legacyListen(lang) // older Mac, or a language SpeechTranscriber doesn't know
  }
  let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults, .fastResults], attributeOptions: [.audioTimeRange])
  if let req = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
    emit(["log": "downloading Apple's speech model for \(locale.identifier) (once)"])
    try await req.downloadAndInstall()
  }
  let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  let (inputs, feed) = AsyncStream.makeStream(of: AnalyzerInput.self)
  let analyzer = SpeechAnalyzer(modules: [transcriber], options: .init(priority: .userInitiated, modelRetention: .processLifetime))
  if let vocab = arg("vocab").flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String] }), !vocab.isEmpty {
    let ctx = AnalysisContext()
    ctx.contextualStrings[.general] = vocab
    try await analyzer.setContext(ctx)
  }
  try await analyzer.prepareToAnalyze(in: format)
  let results = Task {
    for try await r in transcriber.results {
      let text = String(r.text.characters).trimmingCharacters(in: .whitespaces)
      let words = timedWords(r.text)
      if r.isFinal {
        if !text.isEmpty { emit(["final": text, "start": r.range.start.seconds, "end": r.range.end.seconds, "w": words]) }
        continue
      }
      emit(["partial": text, "w": words])
    }
  }
  try await analyzer.start(inputSequence: inputs)
  emit(["ready": locale.identifier, "engine": "SpeechAnalyzer"])

  // The room went quiet: settle the words heard so far instead of waiting for more audio.
  signal(SIGUSR1, SIG_IGN)
  let quiet = DispatchSource.makeSignalSource(signal: SIGUSR1)
  quiet.setEventHandler { Task { try? await analyzer.finalize(through: nil) } }
  quiet.resume()

  try readPCM(format) { feed.yield(AnalyzerInput(buffer: $0)) }
  feed.finish()
  try await analyzer.finalizeAndFinishThroughEndOfInput()
  try await results.value
}

/** Reads stdin as PCM16 until it closes, 100 ms at a time. */
func readPCM(_ format: AVAudioFormat, _ each: (AVAudioPCMBuffer) -> Void) throws {
  let stdin = FileHandle.standardInput
  var pending = Data()
  while true {
    let d = stdin.availableData
    if d.isEmpty { break }
    pending.append(d)
    let frames = pending.count / 2
    if frames < 1600 { continue }
    let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames))!
    buf.frameLength = AVAudioFrameCount(frames)
    pending.withUnsafeBytes { src in
      buf.int16ChannelData![0].update(from: src.bindMemory(to: Int16.self).baseAddress!, count: frames)
    }
    pending.removeFirst(frames * 2)
    each(buf)
  }
}

// Fallback: the older recognizer, on device only. It needs the speech-recognition permission (the first time macOS
// asks, on behalf of the app that started OpenCaptions) and restarts every minute (its limit per request).
@available(macOS 26, *)
func legacyListen(_ lang: String) async throws {
  guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)), rec.supportsOnDeviceRecognition else {
    throw NSError(domain: "apple", code: 2, userInfo: [NSLocalizedDescriptionKey: "Apple can't recognise '\(lang)' on this Mac"])
  }
  let ok = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) } }
  if !ok { throw NSError(domain: "apple", code: 3, userInfo: [NSLocalizedDescriptionKey: "speech recognition permission denied (System Settings → Privacy & Security → Speech Recognition)"]) }
  let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true)!
  var req: SFSpeechAudioBufferRecognitionRequest?
  var started = Date()
  var offset = 0.0, fed = 0.0
  func begin() {
    let r = SFSpeechAudioBufferRecognitionRequest()
    r.requiresOnDeviceRecognition = true
    r.shouldReportPartialResults = true
    r.addsPunctuation = true
    if let v = arg("vocab").flatMap({ try? JSONSerialization.jsonObject(with: Data($0.utf8)) as? [String] }) { r.contextualStrings = v }
    let base = offset
    rec.recognitionTask(with: r) { res, _ in
      guard let res else { return }
      let text = res.bestTranscription.formattedString
      if res.isFinal { if !text.isEmpty { emit(["final": text, "start": base, "end": base + (res.bestTranscription.segments.last.map { $0.timestamp + $0.duration } ?? 0)]) } }
      else { emit(["partial": text]) }
    }
    req = r
    started = Date()
    offset = fed
  }
  signal(SIGUSR1, SIG_IGN)
  let quiet = DispatchSource.makeSignalSource(signal: SIGUSR1)
  quiet.setEventHandler { req?.endAudio(); begin() }
  quiet.resume()
  begin()
  emit(["ready": lang, "engine": "SFSpeechRecognizer"])
  try readPCM(format) { buf in
    req?.append(buf)
    fed += Double(buf.frameLength) / 16000
    if Date().timeIntervalSince(started) > 50 { req?.endAudio(); begin() }
  }
  req?.endAudio()
  try await Task.sleep(for: .seconds(2)) // the last result arrives after endAudio
}

// ---------- translate ----------
@available(macOS 26, *)
func translate() async {
  var sessions: [String: TranslationSession] = [:]
  while let line = readLine() {
    guard let o = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
          let text = o["text"] as? String, let from = o["from"] as? String, let to = o["to"] as? String else { continue }
    let id = o["id"] ?? 0
    do {
      let key = "\(from)>\(to)"
      if sessions[key] == nil {
        let st = await LanguageAvailability().status(from: Locale.Language(identifier: from), to: Locale.Language(identifier: to))
        if st != .installed {
          throw NSError(domain: "apple", code: 4, userInfo: [NSLocalizedDescriptionKey: st == .supported
            ? "\(from)→\(to) is not downloaded: System Settings → General → Language & Region → Translation Languages"
            : "Apple can't translate \(from)→\(to)"])
        }
        sessions[key] = TranslationSession(installedSource: Locale.Language(identifier: from), target: Locale.Language(identifier: to))
      }
      emit(["id": id, "text": try await sessions[key]!.translate(text).targetText])
    } catch {
      emit(["id": id, "error": error.localizedDescription])
    }
  }
}

// ---------- speak ----------
/** The best voice installed for a language: premium, then enhanced, then the system's default for it. */
func voice(_ lang: String) -> AVSpeechSynthesisVoice? {
  let base = Locale.Language(identifier: lang).languageCode?.identifier ?? lang
  let dflt = AVSpeechSynthesisVoice(language: lang)?.identifier
  let rank = { (v: AVSpeechSynthesisVoice) in v.quality.rawValue * 2 + (v.identifier == dflt ? 1 : 0) }
  return AVSpeechSynthesisVoice.speechVoices()
    .filter { ($0.language == base || $0.language.hasPrefix("\(base)-")) && $0.voiceTraits.isDisjoint(with: [.isNoveltyVoice, .isPersonalVoice]) }
    .max { rank($0) < rank($1) }
}

func speak() async {
  let synth = AVSpeechSynthesizer()
  let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 24000, channels: 1, interleaved: true)!
  while let line = readLine() {
    guard let o = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
          let text = o["text"] as? String, let lang = o["lang"] as? String else { continue }
    let id = o["id"] ?? 0
    guard let v = voice(lang) else {
      emit(["id": id, "error": "this Mac has no voice for '\(lang)' (System Settings → Accessibility → Spoken Content → System voice → Manage Voices)"])
      continue
    }
    let u = AVSpeechUtterance(string: text)
    u.voice = v
    u.rate = AVSpeechUtteranceDefaultSpeechRate * Float(o["rate"] as? Double ?? 1)
    var conv: AVAudioConverter?
    var done = false
    await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
      synth.write(u) { buf in
        guard !done else { return }
        guard let pcm = buf as? AVAudioPCMBuffer, pcm.frameLength > 0 else { done = true; c.resume(); return } // empty = the end
        conv = conv ?? AVAudioConverter(from: pcm.format, to: format) // the voice's own rate (often 22.05 kHz) → 24 kHz
        let dst = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(Double(pcm.frameLength) * 24000 / pcm.format.sampleRate) + 64)!
        var fed = false
        conv?.convert(to: dst, error: nil) { _, st in
          if fed { st.pointee = .noDataNow; return nil }
          fed = true
          st.pointee = .haveData
          return pcm
        }
        if dst.frameLength > 0 { emit(["id": id, "pcm": Data(bytes: dst.int16ChannelData![0], count: Int(dst.frameLength) * 2).base64EncodedString()]) }
      }
    }
    emit(["id": id, "done": true, "voice": v.name])
  }
}

@main struct Main {
  static func main() async {
    guard #available(macOS 26, *) else { emit(["error": "needs macOS 26 or later"]); exit(2) }
    do {
      switch CommandLine.arguments.dropFirst().first {
      case "check": await check()
      case "listen": try await listen()
      case "translate": await translate()
      case "speak": await speak()
      default: emit(["error": "usage: opencaptions-apple check|listen|translate|speak"]); exit(2)
      }
    } catch {
      emit(["error": error.localizedDescription])
      exit(1)
    }
  }
}
