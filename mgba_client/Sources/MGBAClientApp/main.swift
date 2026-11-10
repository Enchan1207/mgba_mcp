import AppKit
import MGBAClientCore

final class ViewerImageView: NSView {
    var image: NSImage? { didSet { needsDisplay = true } }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.black.setFill()
        bounds.fill()
        image?.draw(in: bounds, from: .zero, operation: .copy, fraction: 1,
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
        buildSelector()
        selectorWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    private func buildSelector() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 230),
                              styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "mGBA ホストセレクタ"
        window.center()
        window.minSize = NSSize(width: 640, height: 230)
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
                let wasViewing = self.viewerWindow != nil
                self.returnToSelector()
                if wasViewing {
                    let alert = NSAlert()
                    alert.messageText = "通信を終了しました"
                    alert.informativeText = error.localizedDescription
                    alert.runModal()
                } else {
                    self.errorLabel.stringValue = error.localizedDescription
                }
            }
        }
    }

    @objc private func quitPressed() { NSApp.terminate(nil) }

    private func openViewer() {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 640, height: 640),
                              styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
        window.title = "mGBA ビューア"
        window.contentAspectRatio = NSSize(width: 1, height: 1)
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
            image.heightAnchor.constraint(equalTo: image.widthAnchor, multiplier: 0.9),
            status.topAnchor.constraint(equalTo: image.bottomAnchor),
            status.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            status.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 16),
            status.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -16)
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
        viewerWindow?.delegate = nil
        viewerWindow?.close()
        viewerWindow = nil
        imageView = nil
        statusLabel = nil
        selectorWindow.makeKeyAndOrderFront(nil)
    }

    func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        if window === selectorWindow { NSApp.terminate(nil) }
        else if window === viewerWindow { returnToSelector() }
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
