import Foundation

public enum ViewerError: Error, LocalizedError, Equatable {
    case invalidSocketPath
    case invalidWaitSeconds
    case connection(String)
    case disconnected
    case malformedResponse
    case server(String)

    public var errorDescription: String? {
        switch self {
        case .invalidSocketPath: return "ソケットパスを入力してください。"
        case .invalidWaitSeconds: return "待機時間は 10～120 の整数で入力してください。"
        case .connection(let message): return "接続できません: \(message)"
        case .disconnected: return "サーバとの接続が切れました。"
        case .malformedResponse: return "サーバから不正な応答を受け取りました。"
        case .server(let code): return "サーバエラー: \(code)"
        }
    }
}

public struct ConnectionSettings: Equatable {
    public let socketPath: String
    public let waitSeconds: Int

    public init(socketPath: String, waitText: String) throws {
        guard !socketPath.isEmpty else { throw ViewerError.invalidSocketPath }
        guard !waitText.isEmpty,
              waitText.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }),
              let seconds = Int(waitText), (10...120).contains(seconds) else {
            throw ViewerError.invalidWaitSeconds
        }
        self.socketPath = socketPath
        self.waitSeconds = seconds
    }

    public var waitMilliseconds: Int { waitSeconds * 1000 }
}

public struct ViewerFrame: Equatable {
    public let frameNumber: UInt64
    public let width: Int
    public let height: Int
    public let rgbx: Data
}

public struct ViewerStatus: Equatable {
    public let frames: UInt64
    public let pressedKeys: UInt32
    public let hasFrame: Bool

    public var pressedButtonNames: String {
        let names = ["A", "B", "Select", "Start", "Right", "Left", "Up", "Down"]
        let pressed = names.enumerated().compactMap { index, name in
            pressedKeys & (1 << index) == 0 ? nil : name
        }
        return pressed.isEmpty ? "なし" : pressed.joined(separator: ", ")
    }
}

public enum ViewerProtocol {
    public static let maximumBodyLength = 1_048_576

    public static func parseFrame(_ body: Data) throws -> ViewerFrame {
        guard body.count >= 10 else { throw ViewerError.malformedResponse }
        let bytes = [UInt8](body)
        let width = Int(bytes[8]), height = Int(bytes[9])
        guard width == 160, height == 144,
              body.count == 10 + width * height * 4 else {
            throw ViewerError.malformedResponse
        }
        let number = (0..<8).reduce(UInt64(0)) { $0 | (UInt64(bytes[$1]) << (8 * $1)) }
        return ViewerFrame(frameNumber: number, width: width, height: height,
                           rgbx: body.subdata(in: 10..<body.count))
    }

    public static func parseStatus(_ body: Data) throws -> ViewerStatus {
        guard let text = String(data: body, encoding: .ascii) else { throw ViewerError.malformedResponse }
        let parts = text.split(separator: " ", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0].hasPrefix("frames="), parts[1].hasPrefix("pressed_keys="),
              parts[2].hasPrefix("has_frame=") else { throw ViewerError.malformedResponse }
        let framesText = parts[0].dropFirst(7)
        let keysText = parts[1].dropFirst(13)
        let frameText = parts[2].dropFirst(10)
        guard !framesText.isEmpty, !keysText.isEmpty,
              framesText.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }),
              keysText.utf8.allSatisfy({ $0 >= 48 && $0 <= 57 }),
              let frames = UInt64(framesText), let keys = UInt32(keysText),
              frameText == "true" || frameText == "false" else {
            throw ViewerError.malformedResponse
        }
        return ViewerStatus(frames: frames, pressedKeys: keys, hasFrame: frameText == "true")
    }
}
