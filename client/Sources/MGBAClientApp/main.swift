import AppKit
import MGBAClientCore

final class ViewerImageView: NSView {
    var image: NSImage? { didSet { needsDisplay = true } }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.black.setFill()
        bounds.fill()
        guard let image, image.size.width > 0, image.size.height > 0 else { return }
        let scale = min(bounds.width / image.size.width, bounds.height / image.size.height)
        let size = NSSize(width: image.size.width * scale, height: image.size.height * scale)
        let rect = NSRect(x: bounds.midX - size.width / 2, y: bounds.midY - size.height / 2,
                          width: size.width, height: size.height)
        image.draw(in: rect, from: .zero, operation: .copy, fraction: 1,
                   respectFlipped: true, hints: [.interpolation: NSImageInterpolation.none])
    }
}

final class AppController: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var selectorWindow: NSWindow!
    private var viewerWindow: NSWindow?
    private var pathField: NSTextField!
    private var waitField: NSTextField!
    private var errorLabel: NSTextField!
    private var imageView: ViewerImageView?
    private var statusLabel: NSTextField?
    private var client: ViewerClient?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildSelector()
        selectorWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func buildMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "終了", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        menu.addItem(appItem)

        let editItem = NSMenuItem(title: "編集", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "編集")
        editMenu.addItem(withTitle: "カット", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "コピー", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "ペースト", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "すべて選択", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        menu.addItem(editItem)
        NSApp.mainMenu = menu
    }

    private func buildSelector() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 230),
                              styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "mGBA ホストセレクタ"
        window.animationBehavior = .none
        window.center()
        window.contentMinSize = NSSize(width: 640, height: 230)
        window.contentMaxSize = NSSize(width: 10_000, height: 230)
        window.delegate = self
        let content = NSView()
        window.contentView = content

        let pathLabel = label("Unix ソケットパス")
        let path = NSTextField(string: "")
        path.placeholderString = "/private/tmp/mgba.sock"
        let waitLabel = label("待機時間（秒）")
        let wait = NSTextField(string: "60")
        let error = label("")
        error.textColor = .systemRed
        let connect = NSButton(title: "接続", target: self, action: #selector(connectPressed))
        let quit = NSButton(title: "終了", target: self, action: #selector(quitPressed))
        let buttons = NSStackView(views: [connect, quit])
        buttons.orientation = .horizontal
        buttons.spacing = 12
        let stack = NSStackView(views: [pathLabel, path, waitLabel, wait, error, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        for view in [path, wait, error, buttons] { view.translatesAutoresizingMaskIntoConstraints = false }
        content.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: content.topAnchor, constant: 18),
            path.widthAnchor.constraint(equalTo: stack.widthAnchor),
            wait.widthAnchor.constraint(equalToConstant: 100),
            error.widthAnchor.constraint(equalTo: stack.widthAnchor)
        ])
        selectorWindow = window
        pathField = path
        waitField = wait
        errorLabel = error
    }

    @objc private func connectPressed() {
        client?.disconnect()
        client = nil
        let settings: ConnectionSettings
        do {
            settings = try ConnectionSettings(socketPath: pathField.stringValue, waitText: waitField.stringValue)
        } catch {
            errorLabel.stringValue = error.localizedDescription
            return
        }
        errorLabel.stringValue = "接続中…"
        let connection = ViewerClient()
        client = connection
        connection.start(settings: settings) { [weak self, weak connection] event in
            guard let self, let connection, self.client === connection else { return }
            switch event {
            case .connected:
                self.errorLabel.stringValue = ""
                self.openViewer()
            case .update(let frame, let status):
                self.show(frame: frame, status: status)
            case .failed(let error):
                self.returnToSelector()
                self.errorLabel.stringValue = error.localizedDescription
            }
        }
    }

    @objc private func quitPressed() { NSApp.terminate(nil) }

    private func openViewer() {
        if let window = viewerWindow {
            statusLabel?.stringValue = "接続中  ·  画像なし"
            imageView?.image = nil
            selectorWindow.orderOut(nil)
            window.makeKeyAndOrderFront(nil)
            return
        }
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 640),
                              styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "mGBA ビューア"
        window.animationBehavior = .none
        window.contentMinSize = NSSize(width: 480, height: 480)
        window.delegate = self
        let content = NSView()
        window.contentView = content
        let image = ViewerImageView()
        image.translatesAutoresizingMaskIntoConstraints = false
        let status = label("接続中  ·  画像なし")
        status.translatesAutoresizingMaskIntoConstraints = false
        status.lineBreakMode = .byTruncatingTail
        content.addSubview(image)
        content.addSubview(status)
        NSLayoutConstraint.activate([
            image.topAnchor.constraint(equalTo: content.topAnchor),
            image.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            image.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            status.topAnchor.constraint(equalTo: image.bottomAnchor),
            status.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            status.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            status.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16),
            status.heightAnchor.constraint(equalToConstant: 36)
        ])
        viewerWindow = window
        imageView = image
        statusLabel = status
        selectorWindow.orderOut(nil)
        window.center()
        window.makeKeyAndOrderFront(nil)
    }

    private func show(frame: ViewerFrame?, status: ViewerStatus) {
        if let frame {
            let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: frame.width,
                                          pixelsHigh: frame.height, bitsPerSample: 8,
                                          samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                          colorSpaceName: .deviceRGB, bytesPerRow: frame.width * 4,
                                          bitsPerPixel: 32)!
            _ = frame.rgbx.withUnsafeBytes { bytes in
                memcpy(bitmap.bitmapData!, bytes.baseAddress!, bytes.count)
            }
            for pixel in 0..<(frame.width * frame.height) { bitmap.bitmapData![pixel * 4 + 3] = 255 }
            let image = NSImage(size: NSSize(width: frame.width, height: frame.height))
            image.addRepresentation(bitmap)
            imageView?.image = image
        } else {
            imageView?.image = nil
        }
        statusLabel?.stringValue = "フレーム: \(status.frames)  ·  ボタン: \(status.pressedButtonNames)  ·  画像: \(status.hasFrame ? "あり" : "なし")  ·  接続中"
    }

    private func returnToSelector() {
        client?.disconnect()
        client = nil
        viewerWindow?.orderOut(nil)
        imageView?.image = nil
        selectorWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        selectorWindow.makeFirstResponder(pathField)
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if sender === viewerWindow {
            returnToSelector()
            return false
        }
        return true
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if window === selectorWindow { NSApp.terminate(nil) }
    }

    private func label(_ text: String) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = .systemFont(ofSize: 13)
        return field
    }
}

let application = NSApplication.shared
application.setActivationPolicy(.regular)
let controller = AppController()
application.delegate = controller
application.run()
