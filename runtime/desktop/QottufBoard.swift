// Qottuf Board: the Qottuf BD Board as a Mac app.
//
// A native window (AppKit and WKWebView) around the board, which runs on this computer. Opening the app starts
// the board if it isn't running and shows it; links to other sites (the CRM, the website) open in the browser;
// quitting the app stops the board if the app started it. desktop/build-mac-app.sh compiles it on the Mac:
//
//   xcrun --sdk macosx swiftc -O -parse-as-library -o "Qottuf Board" QottufBoard.swift
//
// The board's settings stay in runtime/.env; the app reads only BOARD_PORT. Log: ~/Library/Logs/Qottuf Board.log.

import AppKit
import WebKit

// MARK: - Where the board is

/// Written by the build script into Contents/Resources/board.conf: `runtime=<folder>` and `node=<path>`.
struct BoardConfig {
    let runtime: String
    let node: String

    static func load() -> BoardConfig? {
        guard let url = Bundle.main.url(forResource: "board", withExtension: "conf"),
              let text = try? String(contentsOf: url, encoding: .utf8) else { return nil }
        var values: [String: String] = [:]
        for line in text.split(whereSeparator: { $0.isNewline }) {
            guard let eq = line.firstIndex(of: "=") else { continue }
            values[String(line[..<eq])] = String(line[line.index(after: eq)...])
        }
        guard let runtime = values["runtime"], !runtime.isEmpty else { return nil }
        return BoardConfig(runtime: runtime, node: values["node"] ?? "")
    }

    /// BOARD_PORT from runtime/.env, as the board reads it; 4300 when it isn't set.
    var port: Int {
        guard let text = try? String(contentsOfFile: runtime + "/.env", encoding: .utf8) else { return 4300 }
        for raw in text.split(whereSeparator: { $0.isNewline }) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard line.hasPrefix("BOARD_PORT=") else { continue }
            let value = String(line.dropFirst("BOARD_PORT=".count)).trimmingCharacters(in: CharacterSet(charactersIn: "\"' \t"))
            if let n = Int(value), n > 0, n < 65536 { return n }
        }
        return 4300
    }
}

// MARK: - The log

enum BoardLog {
    static var url: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Qottuf Board.log")
    }

    /// A handle to append the board's output to. The log moves to "….old" once it passes 2 MB.
    static func handle(note: String) -> FileHandle? {
        let fm = FileManager.default
        let path = url.path
        if let size = (try? fm.attributesOfItem(atPath: path))?[.size] as? NSNumber, size.intValue > 2_000_000 {
            try? fm.removeItem(atPath: path + ".old")
            try? fm.moveItem(atPath: path, toPath: path + ".old")
        }
        if !fm.fileExists(atPath: path) {
            try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            _ = fm.createFile(atPath: path, contents: nil)
        }
        guard let handle = FileHandle(forWritingAtPath: path) else { return nil }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data("\n--- \(Date()) \(note)\n".utf8))
        return handle
    }

    static func write(_ note: String) {
        if let handle = handle(note: note) { try? handle.close() }
    }

    /// The last lines, for the page that says what went wrong.
    static func tail(_ count: Int = 18) -> String {
        guard let data = try? Data(contentsOf: url) else { return "" }
        let text = String(decoding: data.suffix(8_000), as: UTF8.self)
        return text.split(separator: "\n", omittingEmptySubsequences: false).suffix(count).joined(separator: "\n")
    }
}

// MARK: - Finding Node and the process on the board's port

enum NodeFinder {
    /// The Node the installer used, then the usual places, then whatever a login shell finds (nvm and the like).
    static func find(preferred: String) -> String? {
        let fm = FileManager.default
        for path in [preferred, "/opt/homebrew/bin/node", "/usr/local/bin/node"] where !path.isEmpty && fm.isExecutableFile(atPath: path) {
            return path
        }
        return fromLoginShell()
    }

    private static func fromLoginShell() -> String? {
        let shell = Process()
        shell.executableURL = URL(fileURLWithPath: "/bin/zsh")
        shell.arguments = ["-l", "-i", "-c", "command -v node"]
        let out = Pipe()
        shell.standardOutput = out
        shell.standardError = FileHandle.nullDevice
        shell.standardInput = FileHandle.nullDevice
        do { try shell.run() } catch { return nil }
        DispatchQueue.global().asyncAfter(deadline: .now() + 10) { if shell.isRunning { shell.terminate() } }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        shell.waitUntilExit()
        for line in String(decoding: data, as: UTF8.self).split(whereSeparator: { $0.isNewline }).reversed() {
            let path = line.trimmingCharacters(in: .whitespaces)
            if path.hasPrefix("/") && FileManager.default.isExecutableFile(atPath: path) { return path }
        }
        return nil
    }
}

/// The process listening on the board's port: for a board this app didn't start (from Terminal, or left over).
func listeningProcess(port: Int) -> Int32? {
    let lsof = Process()
    lsof.executableURL = URL(fileURLWithPath: "/usr/sbin/lsof")
    lsof.arguments = ["-nP", "-iTCP:\(port)", "-sTCP:LISTEN", "-t"]
    let out = Pipe()
    lsof.standardOutput = out
    lsof.standardError = FileHandle.nullDevice
    do { try lsof.run() } catch { return nil }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    lsof.waitUntilExit()
    return String(decoding: data, as: UTF8.self).split(whereSeparator: { $0.isNewline }).compactMap { Int32($0) }.first
}

// MARK: - The app's own pages: starting, and what went wrong

enum Pages {
    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    static func starting(_ title: String) -> String {
        page("""
        <h1>\(escape(title))</h1>
        <p>This takes a few seconds; the first start after an update takes a little longer.</p>
        """)
    }

    /// `detail` is HTML: escape anything in it that didn't come from this file.
    static func problem(_ title: String, _ detail: String, log: String) -> String {
        let logBlock = log.isEmpty ? "" : "<pre>" + escape(log) + "</pre>"
        return page("""
        <h1>\(escape(title))</h1>
        <p>\(detail)</p>
        <div class="actions"><button id="retry">Try again</button><button id="log" class="quiet">Show the full log</button></div>
        \(logBlock)
        <p class="small">You can also start the board from Terminal with <code>qottuf-board</code>. Its log is in ~/Library/Logs/Qottuf Board.log.</p>
        <script>
          document.getElementById("retry").addEventListener("click", function () { webkit.messageHandlers.board.postMessage({ retry: true }); });
          document.getElementById("log").addEventListener("click", function () { webkit.messageHandlers.board.postMessage({ log: true }); });
        </script>
        """)
    }

    private static let style = """
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body { margin: 0; min-height: 100%; }
    body { background: #0D2B5C; color: #fff; display: flex; align-items: center; justify-content: center; padding: 48px;
           font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; font-size: 15px; line-height: 1.55; }
    main { width: 100%; max-width: 680px; }
    .eyebrow { color: #7EB5A8; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 14px; }
    h1 { font-family: "Cormorant Garamond", Georgia, serif; font-size: 32px; font-weight: 600; line-height: 1.2; margin: 0 0 12px; }
    p { margin: 0 0 12px; color: rgba(255, 255, 255, .86); }
    .small { font-size: 13px; color: rgba(255, 255, 255, .66); }
    .actions { display: flex; gap: 10px; margin: 22px 0; }
    button { font-family: inherit; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 6px; cursor: pointer;
             border: 1px solid #fff; background: #fff; color: #0D2B5C; }
    button.quiet { background: transparent; color: #fff; border-color: rgba(255, 255, 255, .5); }
    pre { background: rgba(0, 0, 0, .25); color: rgba(255, 255, 255, .82); padding: 14px 16px; border-radius: 8px; max-height: 40vh; overflow: auto;
          font-family: ui-monospace, Menlo, monospace; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; color: #fff; }
    """

    private static func page(_ body: String) -> String {
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Qottuf BD Board</title><style>" + style
            + "</style></head><body><main><p class=\"eyebrow\">Qottuf Aljazeera · Business Development</p>" + body + "</main></body></html>"
    }
}

// MARK: - The app

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private enum Phase { case starting, ready, stopped }

    private var window: NSWindow!
    private var webView: WKWebView!
    private let config = BoardConfig.load()
    private let session = URLSession(configuration: .ephemeral)
    private var port = 4300
    private var phase = Phase.starting
    /// The board, when this app started it. A board started elsewhere (Terminal) is used but left alone.
    private var server: Process?
    private var booting = false
    private var restarting = false
    private var quitting = false
    private var repliedToQuit = false
    private var signalSource: DispatchSourceSignal?

    private var boardURL: URL { URL(string: "http://localhost:\(port)/")! }

    /// Links to other sites (the CRM's quotations, the website) open in the browser, not in the board's window.
    private static let linkScript = """
    window.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link) return;
      var url;
      try { url = new URL(link.getAttribute("href"), document.baseURI); } catch (e) { return; }
      if (!/^(https?|mailto):$/.test(url.protocol)) return;
      if (url.origin === location.origin && link.target !== "_blank") return;
      event.preventDefault();
      window.webkit.messageHandlers.board.postMessage({ open: url.href });
    });
    """

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        buildWindow()
        quitOnTerminateSignal()
        NSApp.activate(ignoringOtherApps: true)
        boot()
    }

    func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

    // MARK: Starting the board

    private func boot() {
        guard !booting, !quitting else { return }
        booting = true
        phase = .starting
        show(Pages.starting("Starting the board"))
        Task {
            await self.start()
            self.booting = false
        }
    }

    private func start() async {
        guard let config = config else {
            return fail("The app doesn't know where the board is", "Run the board's installer again; it rebuilds the app.")
        }
        port = config.port
        if await boardIsUp() { return openBoard() }
        if server?.isRunning != true {
            let preferred = config.node
            guard let node = await Task.detached(operation: { NodeFinder.find(preferred: preferred) }).value else {
                return fail("Node.js wasn't found", "The board needs Node 22.18 or newer. Run the board's installer again, or install Node from nodejs.org, then try again.")
            }
            guard FileManager.default.fileExists(atPath: config.runtime + "/node_modules/tsx") else {
                return fail("The board's packages aren't installed", "Run the board's installer again; it installs them.")
            }
            do {
                server = try launch(config, node: node)
            } catch {
                return fail("The board couldn't be started", Pages.escape(error.localizedDescription), log: BoardLog.tail())
            }
        }
        let deadline = Date().addingTimeInterval(120)
        while Date() < deadline {
            try? await Task.sleep(nanoseconds: 400_000_000)
            if quitting { return }
            if await boardIsUp() { return openBoard() }
            if server == nil { return failStopped() }
        }
        fail("The board didn't answer", "It was still starting after two minutes. The end of its log is below.", log: BoardLog.tail())
    }

    private func launch(_ config: BoardConfig, node: String) throws -> Process {
        let board = Process()
        board.executableURL = URL(fileURLWithPath: node)
        board.arguments = ["--import", "tsx", config.runtime + "/src/board/main.ts"]
        board.currentDirectoryURL = URL(fileURLWithPath: config.runtime)
        var environment = ProcessInfo.processInfo.environment
        let nodeFolder = URL(fileURLWithPath: node).deletingLastPathComponent().path
        environment["PATH"] = [nodeFolder, "/opt/homebrew/bin", "/usr/local/bin", environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"].joined(separator: ":")
        board.environment = environment
        board.standardInput = FileHandle.nullDevice
        let log = BoardLog.handle(note: "Qottuf Board starts the board on port \(port) with \(node)")
        if let log = log {
            board.standardOutput = log
            board.standardError = log
        }
        board.terminationHandler = { @Sendable finished in
            let pid = finished.processIdentifier
            let status = finished.terminationStatus
            Task { @MainActor in self.serverExited(pid: pid, status: status) }
        }
        try board.run()
        try? log?.close()
        return board
    }

    private func boardIsUp() async -> Bool {
        var request = URLRequest(url: URL(string: "http://localhost:\(port)/api/status")!)
        request.timeoutInterval = 2
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await session.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            return String(decoding: data, as: UTF8.self).contains("\"brand\"")
        } catch {
            return false
        }
    }

    private func openBoard() {
        phase = .ready
        webView.load(URLRequest(url: boardURL))
        window.makeFirstResponder(webView)
    }

    private func serverExited(pid: Int32, status: Int32) {
        guard let board = server, board.processIdentifier == pid else { return }
        server = nil
        BoardLog.write("The board stopped (exit status \(status)).")
        if quitting { return finishQuitting() }
        if restarting {
            restarting = false
            return boot()
        }
        if !booting { failStopped() }
    }

    private func failStopped() {
        let log = BoardLog.tail()
        if log.contains("EADDRINUSE") {
            return fail("Another program is using port \(port)",
                        "Set BOARD_PORT in the board's settings file (runtime/.env) to another number, such as 4310, then try again.", log: log)
        }
        fail("The board stopped", "It closed unexpectedly. The end of its log is below.", log: log)
    }

    private func fail(_ title: String, _ detail: String, log: String = "") {
        phase = .stopped
        show(Pages.problem(title, detail, log: log))
    }

    private func show(_ html: String) {
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: Restarting (after a change to runtime/.env)

    @objc private func restartBoard(_ sender: Any?) {
        guard !booting, !quitting, !restarting else { return }
        if let board = server, board.isRunning {
            restarting = true
            phase = .starting
            show(Pages.starting("Restarting the board"))
            board.terminate()
            Task {
                try? await Task.sleep(nanoseconds: 8_000_000_000)
                if self.restarting, let board = self.server, board.isRunning { kill(board.processIdentifier, SIGKILL) }
            }
            return
        }
        guard phase == .ready else { return boot() }
        guard let pid = listeningProcess(port: port) else {
            let note = NSAlert()
            note.messageText = "The board can't be restarted from here"
            note.informativeText = "Restart it where it was started: press Control-C in its Terminal window, then type qottuf-board."
            note.runModal()
            return
        }
        let ask = NSAlert()
        ask.messageText = "Restart the board?"
        ask.informativeText = "It was started outside this app, for example from Terminal. The app will stop it and start it again here."
        ask.addButton(withTitle: "Restart")
        ask.addButton(withTitle: "Cancel")
        guard ask.runModal() == .alertFirstButtonReturn else { return }
        phase = .starting
        show(Pages.starting("Restarting the board"))
        kill(pid, SIGTERM)
        Task {
            var waited = 0
            while kill(pid, 0) == 0 && waited < 40 {
                try? await Task.sleep(nanoseconds: 200_000_000)
                waited += 1
            }
            if kill(pid, 0) == 0 {
                kill(pid, SIGKILL)
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
            self.boot()
        }
    }

    // MARK: Quitting stops the board, if this app started it

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard let board = server, board.isRunning else { return .terminateNow }
        quitting = true
        board.terminate()  // the board closes the Ledger and exits
        Task {
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            self.finishQuitting(force: true)
        }
        return .terminateLater
    }

    private func finishQuitting(force: Bool = false) {
        guard quitting, !repliedToQuit else { return }
        repliedToQuit = true
        if force, let board = server, board.isRunning { kill(board.processIdentifier, SIGKILL) }
        NSApp.reply(toApplicationShouldTerminate: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let board = server, board.isRunning { board.terminate() }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        guard !quitting else { return false }
        window.makeKeyAndOrderFront(nil)
        if phase == .stopped { boot() }
        return true
    }

    /// `pkill -x "Qottuf Board"` (the installer does this before an update) quits the way Quit does.
    private func quitOnTerminateSignal() {
        signal(SIGTERM, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
        source.setEventHandler { Task { @MainActor in NSApp.terminate(nil) } }
        source.resume()
        signalSource = source
    }

    // MARK: Web view

    private func buildWindow() {
        let content = WKUserContentController()
        content.add(self, name: "board")
        content.addUserScript(WKUserScript(source: Self.linkScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = content

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        let zoom = UserDefaults.standard.double(forKey: "pageZoom")
        if zoom >= 0.5 && zoom <= 2 { webView.pageZoom = CGFloat(zoom) }

        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = NSSize(width: min(1440, visible.width * 0.92), height: min(940, visible.height * 0.92))
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Qottuf BD Board"
        window.minSize = NSSize(width: 860, height: 560)
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.backgroundColor = NSColor(srgbRed: 13 / 255, green: 43 / 255, blue: 92 / 255, alpha: 1)
        window.contentView = webView
        if !window.setFrameUsingName("QottufBoard") { window.center() }
        _ = window.setFrameAutosaveName("QottufBoard")
        window.makeKeyAndOrderFront(nil)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openOutside(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let failure = error as NSError
        guard phase == .ready, failure.domain != "WebKitErrorDomain",
              !(failure.domain == NSURLErrorDomain && failure.code == NSURLErrorCancelled) else { return }
        fail("The board isn't answering", "It may have been stopped. Try again starts it.", log: BoardLog.tail())
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if phase == .ready { webView.reload() }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        if body["retry"] != nil {
            boot()
        } else if body["log"] != nil {
            NSWorkspace.shared.open(BoardLog.url)
        } else if let link = body["open"] as? String, let url = URL(string: link) {
            openOutside(url)
        }
    }

    private func openOutside(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), ["http", "https", "mailto"].contains(scheme) else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: Menus

    private func buildMenus() {
        let bar = NSMenu()

        let app = menu(in: bar, title: "Qottuf Board")
        app.addItem(withTitle: "About Qottuf Board", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Hide Qottuf Board", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
            .keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit Qottuf Board", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = menu(in: bar, title: "File")
        item(file, "Restart the Board", #selector(restartBoard(_:)), "r", [.command, .shift])
        item(file, "Open in Your Browser", #selector(openInBrowser(_:)), "")
        item(file, "Show the Board's Log", #selector(showLog(_:)), "")
        file.addItem(.separator())
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let edit = menu(in: bar, title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z").keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let view = menu(in: bar, title: "View")
        item(view, "Reload", #selector(reloadBoard(_:)), "r")
        item(view, "Back", #selector(goBackInBoard(_:)), "[")
        item(view, "Forward", #selector(goForwardInBoard(_:)), "]")
        view.addItem(.separator())
        item(view, "Actual Size", #selector(zoomToActualSize(_:)), "0")
        item(view, "Zoom In", #selector(zoomIn(_:)), "+")
        let zoomInWithoutShift = item(view, "Zoom In", #selector(zoomIn(_:)), "=")
        zoomInWithoutShift.isHidden = true
        zoomInWithoutShift.allowsKeyEquivalentWhenHidden = true
        item(view, "Zoom Out", #selector(zoomOut(_:)), "-")

        let windows = menu(in: bar, title: "Window")
        windows.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windows.addItem(.separator())
        windows.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")

        NSApp.mainMenu = bar
        NSApp.windowsMenu = windows
    }

    private func menu(in bar: NSMenu, title: String) -> NSMenu {
        let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        let submenu = NSMenu(title: title)
        holder.submenu = submenu
        bar.addItem(holder)
        return submenu
    }

    @discardableResult
    private func item(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String,
                      _ modifiers: NSEvent.ModifierFlags = [.command]) -> NSMenuItem {
        let entry = NSMenuItem(title: title, action: action, keyEquivalent: key)
        entry.keyEquivalentModifierMask = modifiers
        entry.target = self
        menu.addItem(entry)
        return entry
    }

    @objc private func reloadBoard(_ sender: Any?) {
        if phase == .ready { webView.reload() } else { boot() }
    }

    @objc private func goBackInBoard(_ sender: Any?) {
        if phase == .ready { webView.goBack() }
    }

    @objc private func goForwardInBoard(_ sender: Any?) {
        if phase == .ready { webView.goForward() }
    }

    @objc private func zoomIn(_ sender: Any?) { setZoom(webView.pageZoom + 0.1) }
    @objc private func zoomOut(_ sender: Any?) { setZoom(webView.pageZoom - 0.1) }
    @objc private func zoomToActualSize(_ sender: Any?) { setZoom(1) }

    private func setZoom(_ value: CGFloat) {
        let zoom = min(2, max(0.5, (value * 10).rounded() / 10))
        webView.pageZoom = zoom
        UserDefaults.standard.set(Double(zoom), forKey: "pageZoom")
    }

    @objc private func openInBrowser(_ sender: Any?) {
        NSWorkspace.shared.open(phase == .ready ? (webView.url ?? boardURL) : boardURL)
    }

    @objc private func showLog(_ sender: Any?) {
        NSWorkspace.shared.open(BoardLog.url)
    }
}

// MARK: - The icon

/// `Qottuf Board --compose-icon <mark.png> <out.png>`: how the build script puts the Qottuf mark from the brand
/// skill on a navy app-icon tile (1024 px, the macOS icon grid). The result stays on this Mac.
@MainActor
enum IconMaker {
    static func compose(mark markPath: String, into outPath: String) -> Bool {
        guard let mark = NSImage(contentsOfFile: markPath), mark.size.width > 0, mark.size.height > 0,
              let space = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        NSGraphicsContext.current?.imageInterpolation = .high
        NSColor(srgbRed: 13 / 255, green: 43 / 255, blue: 92 / 255, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185).fill()
        let box: CGFloat = 824 * 0.58
        let scale = min(box / mark.size.width, box / mark.size.height)
        let width = mark.size.width * scale
        let height = mark.size.height * scale
        mark.draw(in: NSRect(x: (1024 - width) / 2, y: (1024 - height) / 2, width: width, height: height),
                  from: .zero, operation: .sourceOver, fraction: 1)
        NSGraphicsContext.restoreGraphicsState()
        guard let image = context.makeImage(),
              let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else { return false }
        return FileManager.default.createFile(atPath: outPath, contents: png)
    }
}

// MARK: - Start

@main
enum QottufBoardApp {
    @MainActor
    static func main() {
        let arguments = CommandLine.arguments
        if arguments.count == 4 && arguments[1] == "--compose-icon" {
            exit(IconMaker.compose(mark: arguments[2], into: arguments[3]) ? 0 : 1)
        }
        let app = NSApplication.shared
        NSWindow.allowsAutomaticWindowTabbing = false
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}
