// OpenCaptions.app's program (Contents/MacOS/OpenCaptions): a small native window that runs OpenCaptions and says
// what it's doing — starting, installing what it needs the first time, running — with the dashboard one click away.
// It runs Contents/Resources/launch.sh (Node.js, the app files, then scripts/start.js) and reads its output; quitting
// stops OpenCaptions, after asking, since captions stop in every room. No Terminal window, no permission to control
// Terminal, and macOS's own prompts (speech recognition) name OpenCaptions.
// Built by scripts/package-desktop.js:
//   xcrun swiftc -parse-as-library -O -target arm64-apple-macos11.0 OpenCaptions.swift (and x86_64), then lipo
import AppKit

private let es = Locale.preferredLanguages.first?.hasPrefix("es") ?? false
private func say(_ en: String, _ esp: String) -> String { es ? esp : en }

@main
final class Launcher: NSObject, NSApplicationDelegate, NSWindowDelegate {
  static func main() {
    let app = NSApplication.shared
    let delegate = Launcher()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }

  private var window: NSWindow!
  private let status = NSTextField(labelWithString: say("Starting…", "Iniciando…"))
  private let detail = NSTextField(wrappingLabelWithString: "")
  private let spinner = NSProgressIndicator()
  private let openButton = NSButton()
  private let detailsButton = NSButton()
  private let logView = NSTextView()
  private var logScroll: NSScrollView!
  private var proc: Process?
  private var dashboard: URL?
  private var pending = ""
  private var lastError = ""
  private var elsewhere = false // started twice: the OpenCaptions already running answers
  private let lifeline = Pipe()

  func applicationDidFinishLaunching(_ notification: Notification) {
    buildMenu()
    buildWindow()
    start()
  }

  // MARK: running OpenCaptions

  private func start() {
    lastError = ""
    elsewhere = false
    dashboard = nil
    show(state: .starting)
    let script = Bundle.main.url(forResource: "launch", withExtension: "sh")!
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [script.path]
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = pipe
    p.standardInput = lifeline // closes when this app ends, however it ends: start.js then stops the server
    p.environment = ProcessInfo.processInfo.environment.merging(["OC_STOP_WITH_STDIN": "1"]) { $1 }
    pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let text = String(decoding: h.availableData, as: UTF8.self)
      DispatchQueue.main.async { self?.read(text) }
    }
    p.terminationHandler = { [weak self] p in DispatchQueue.main.async { self?.ended(p.terminationStatus) } }
    do { try p.run(); proc = p } catch {
      lastError = error.localizedDescription
      show(state: .stopped)
    }
  }

  /// Output arrives in pieces; spinner frames end with \r. Each finished line is logged and looked at.
  private func read(_ text: String) {
    pending += text
    let parts = pending.components(separatedBy: CharacterSet(charactersIn: "\r\n"))
    pending = parts.last ?? ""
    for raw in parts.dropLast() {
      let line = raw.replacingOccurrences(of: "\u{1B}\\[[0-9;?]*[A-Za-z]|\u{1B}\\][^\u{07}]*\u{07}", with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
      if line.isEmpty { continue }
      logView.textStorage?.append(NSAttributedString(string: line + "\n", attributes: [.font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular), .foregroundColor: NSColor.secondaryLabelColor]))
      logView.scrollToEndOfDocument(nil)
      if line.contains("Installing what OpenCaptions needs") { show(state: .installing) }
      if let url = firstURL(in: line, after: "Ready on") { dashboard = url.appendingPathComponent("admin.html"); show(state: .running) }
      if let url = firstURL(in: line, after: "already running. Opening") { dashboard = url; elsewhere = true; show(state: .running) }
      if line.hasPrefix("✗") || line.hasPrefix("✖") { lastError = String(line.dropFirst()).trimmingCharacters(in: .whitespaces) }
    }
  }

  private func firstURL(in line: String, after marker: String) -> URL? {
    guard let r = line.range(of: marker) else { return nil }
    let rest = line[r.upperBound...].trimmingCharacters(in: .whitespaces)
    return URL(string: String(rest.split(separator: " ").first ?? ""))
  }

  private func ended(_ code: Int32) {
    proc = nil
    if elsewhere { return } // the other OpenCaptions keeps running: this window still opens its dashboard
    if lastError.isEmpty && code != 0 { lastError = say("It stopped unexpectedly (code \(code)). The details below say why.", "Se detuvo de golpe (código \(code)). Los detalles de abajo dicen por qué.") }
    show(state: .stopped)
  }

  // MARK: the window

  private enum State { case starting, installing, running, stopped }

  private func show(state: State) {
    defer { FileHandle.standardError.write(Data("OpenCaptions: \(state) · \(status.stringValue) · \(detail.stringValue)\n".utf8)) } // also in Console.app
    switch state {
    case .starting, .installing:
      status.stringValue = state == .installing ? say("Installing what it needs…", "Instalando lo que necesita…") : say("Starting…", "Iniciando…")
      detail.stringValue = state == .installing ? say("Only the first time. It takes about a minute and needs the internet.", "Solo la primera vez. Tarda un minuto y necesita internet.") : ""
      spinner.isHidden = false
      spinner.startAnimation(nil)
      openButton.title = say("Open Dashboard", "Abrir el panel")
      openButton.isEnabled = false
    case .running:
      status.stringValue = say("OpenCaptions is running", "OpenCaptions está funcionando")
      detail.stringValue = elsewhere ? say("It was already open. This window opens its dashboard.", "Ya estaba abierto. Esta ventana abre su panel.") : say("Keep it open during the event. Quit OpenCaptions to stop the captions.", "Dejalo abierto durante el evento. Salí de OpenCaptions para detener los subtítulos.")
      spinner.stopAnimation(nil)
      spinner.isHidden = true
      openButton.title = say("Open Dashboard", "Abrir el panel")
      openButton.isEnabled = true
    case .stopped:
      status.stringValue = say("OpenCaptions stopped", "OpenCaptions se detuvo")
      detail.stringValue = lastError
      spinner.stopAnimation(nil)
      spinner.isHidden = true
      openButton.title = say("Start Again", "Iniciar de nuevo")
      openButton.isEnabled = true
      if !lastError.isEmpty && logScroll.isHidden { toggleDetails() }
    }
  }

  @objc private func primary() {
    if proc == nil && !elsewhere { return start() }
    if let url = dashboard { NSWorkspace.shared.open(url) }
  }

  @objc private func toggleDetails() {
    logScroll.isHidden.toggle()
    detailsButton.state = logScroll.isHidden ? .off : .on
    window.setContentSize(window.contentView!.fittingSize)
  }

  private func buildWindow() {
    let icon = NSImageView(image: NSApp.applicationIconImage)
    icon.translatesAutoresizingMaskIntoConstraints = false
    icon.widthAnchor.constraint(equalToConstant: 64).isActive = true
    icon.heightAnchor.constraint(equalToConstant: 64).isActive = true
    status.font = .systemFont(ofSize: 17, weight: .semibold)
    detail.font = .systemFont(ofSize: 13)
    detail.textColor = .secondaryLabelColor
    detail.preferredMaxLayoutWidth = 300
    spinner.style = .spinning
    spinner.controlSize = .small
    let texts = NSStackView(views: [status, detail])
    texts.orientation = .vertical
    texts.alignment = .leading
    texts.spacing = 4
    let head = NSStackView(views: [icon, texts, spinner])
    head.alignment = .centerY
    head.spacing = 16

    openButton.bezelStyle = .rounded
    openButton.keyEquivalent = "\r"
    openButton.target = self
    openButton.action = #selector(primary)
    detailsButton.setButtonType(.pushOnPushOff)
    detailsButton.bezelStyle = .disclosure
    detailsButton.title = ""
    detailsButton.target = self
    detailsButton.action = #selector(toggleDetails)
    let detailsLabel = NSTextField(labelWithString: say("Details", "Detalles"))
    detailsLabel.textColor = .secondaryLabelColor
    let buttons = NSStackView(views: [detailsButton, detailsLabel, NSView(), openButton])
    buttons.spacing = 6

    logView.isEditable = false
    logView.textContainerInset = NSSize(width: 6, height: 6)
    logScroll = NSScrollView()
    logScroll.documentView = logView
    logScroll.hasVerticalScroller = true
    logScroll.borderType = .bezelBorder
    logScroll.translatesAutoresizingMaskIntoConstraints = false
    logScroll.heightAnchor.constraint(equalToConstant: 200).isActive = true
    logView.autoresizingMask = [.width]
    logScroll.isHidden = true

    let stack = NSStackView(views: [head, buttons, logScroll])
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 18
    stack.edgeInsets = NSEdgeInsets(top: 22, left: 22, bottom: 18, right: 22)
    for v in [buttons, logScroll!] { v.translatesAutoresizingMaskIntoConstraints = false; v.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -44).isActive = true }
    stack.widthAnchor.constraint(equalToConstant: 440).isActive = true

    window = NSWindow(contentRect: .zero, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
    window.title = "OpenCaptions"
    window.contentView = stack
    window.delegate = self
    window.setContentSize(stack.fittingSize)
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func buildMenu() {
    let main = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: say("About OpenCaptions", "Acerca de OpenCaptions"), action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: say("Hide OpenCaptions", "Ocultar OpenCaptions"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: say("Quit OpenCaptions", "Salir de OpenCaptions"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    main.addItem(appItem)
    let editItem = NSMenuItem()
    let edit = NSMenu(title: say("Edit", "Edición"))
    edit.addItem(withTitle: say("Copy", "Copiar"), action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: say("Select All", "Seleccionar todo"), action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editItem.submenu = edit
    main.addItem(editItem)
    NSApp.mainMenu = main
  }

  // MARK: quitting stops OpenCaptions (after asking)

  func windowShouldClose(_ sender: NSWindow) -> Bool {
    NSApp.terminate(nil) // closing the window quits; if the person changes their mind, the window stays
    return false
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    window.makeKeyAndOrderFront(nil)
    return true
  }

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    guard let p = proc, p.isRunning else { return .terminateNow }
    let ask = NSAlert()
    ask.alertStyle = .warning
    ask.messageText = say("Stop OpenCaptions?", "¿Detener OpenCaptions?")
    ask.informativeText = say("Captions stop in every room until you open it again.", "Los subtítulos se detienen en todas las salas hasta que lo vuelvas a abrir.")
    ask.addButton(withTitle: say("Stop", "Detener"))
    ask.addButton(withTitle: say("Cancel", "Cancelar"))
    guard ask.runModal() == .alertFirstButtonReturn else { return .terminateCancel }
    elsewhere = true // what follows is a stop on purpose, not a failure to show
    p.terminate() // SIGTERM: start.js stops the server
    DispatchQueue.global().async {
      let deadline = Date().addingTimeInterval(6)
      while p.isRunning && Date() < deadline { usleep(100_000) }
      if p.isRunning { kill(p.processIdentifier, SIGKILL) }
      DispatchQueue.main.async { NSApp.reply(toApplicationShouldTerminate: true) }
    }
    return .terminateLater
  }
}
