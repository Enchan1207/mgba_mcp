import Darwin
import Foundation

public enum ViewerEvent {
    case connected
    case update(ViewerFrame?, ViewerStatus)
    case failed(ViewerError)
}

/// Owns one VIEW connection. All socket reads run on a private queue; shutdown interrupts WAIT_FRAME.
public final class ViewerClient {
    private let lock = NSLock()
    private let queue = DispatchQueue(label: "mgba.viewer.connection", qos: .userInitiated)
    private var descriptor: Int32 = -1
    private var stopped = false

    public init() {}

    public func start(settings: ConnectionSettings, onEvent: @escaping (ViewerEvent) -> Void) {
        queue.async { [self] in
            do {
                let fd = try connectSocket(path: settings.socketPath)
                lock.lock()
                if stopped {
                    lock.unlock()
                    Darwin.close(fd)
                    return
                }
                descriptor = fd
                lock.unlock()

                let hello = try request(fd, "HELLO VIEW")
                guard hello.result == UInt8(ascii: "S"), hello.body.isEmpty else {
                    throw try helloError(hello)
                }
                emit(.connected, onEvent)

                while isActive {
                    let reply = try request(fd, "WAIT_FRAME \(settings.waitMilliseconds)")
                    var frame: ViewerFrame?
                    if reply.result == UInt8(ascii: "S") {
                        frame = try ViewerProtocol.parseFrame(reply.body)
                    } else {
                        let code = try errorCode(reply)
                        if code == "TIMEOUT" { continue }
                        guard code == "NO_FRAME" else { throw ViewerError.server(code) }
                    }
                    let statusReply = try request(fd, "STATUS")
                    guard statusReply.result == UInt8(ascii: "S") else {
                        throw ViewerError.server(try errorCode(statusReply))
                    }
                    let status = try ViewerProtocol.parseStatus(statusReply.body)
                    emit(.update(frame, status), onEvent)
                }
            } catch let error as ViewerError {
                emit(.failed(error), onEvent)
            } catch {
                emit(.failed(.connection(error.localizedDescription)), onEvent)
            }
            closeSocket()
        }
    }

    public func disconnect() {
        lock.lock()
        stopped = true
        if descriptor >= 0 { shutdown(descriptor, SHUT_RDWR) }
        lock.unlock()
    }

    private var isActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return !stopped
    }

    private func emit(_ event: ViewerEvent, _ callback: @escaping (ViewerEvent) -> Void) {
        guard isActive else { return }
        DispatchQueue.main.async { callback(event) }
    }

    private func closeSocket() {
        lock.lock()
        stopped = true
        let fd = descriptor
        descriptor = -1
        lock.unlock()
        if fd >= 0 { Darwin.close(fd) }
    }

    private func connectSocket(path: String) throws -> Int32 {
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let bytes = Array(path.utf8)
        let capacity = MemoryLayout.size(ofValue: address.sun_path)
        guard !bytes.isEmpty, !bytes.contains(0), bytes.count < capacity else {
            throw ViewerError.invalidSocketPath
        }
        withUnsafeMutableBytes(of: &address.sun_path) { buffer in
            for (index, byte) in bytes.enumerated() { buffer[index] = byte }
            buffer[bytes.count] = 0
        }
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw ViewerError.connection(String(cString: strerror(errno))) }
        var noSignal: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
        let result = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result == 0 else {
            let message = String(cString: strerror(errno))
            Darwin.close(fd)
            throw ViewerError.connection(message)
        }
        return fd
    }

    private func request(_ fd: Int32, _ command: String) throws -> (result: UInt8, body: Data) {
        let line = Array((command + "\n").utf8)
        try line.withUnsafeBytes { raw in
            var offset = 0
            while offset < raw.count {
                let count = send(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset, 0)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw ViewerError.disconnected }
                offset += count
            }
        }
        let header = try readExact(fd, count: 5)
        guard header[0] == UInt8(ascii: "S") || header[0] == UInt8(ascii: "E") else {
            throw ViewerError.malformedResponse
        }
        let length = (1...4).reduce(UInt32(0)) {
            $0 | (UInt32(header[$1]) << (8 * ($1 - 1)))
        }
        guard length <= ViewerProtocol.maximumBodyLength else { throw ViewerError.malformedResponse }
        let body = try readExact(fd, count: Int(length))
        guard try readExact(fd, count: 1) == Data([10]) else { throw ViewerError.malformedResponse }
        return (header[0], body)
    }

    private func readExact(_ fd: Int32, count: Int) throws -> Data {
        var data = Data(count: count)
        try data.withUnsafeMutableBytes { raw in
            var offset = 0
            while offset < count {
                let received = recv(fd, raw.baseAddress!.advanced(by: offset), count - offset, 0)
                if received < 0 && errno == EINTR { continue }
                guard received > 0 else { throw ViewerError.disconnected }
                offset += received
            }
        }
        return data
    }

    private func errorCode(_ reply: (result: UInt8, body: Data)) throws -> String {
        guard reply.result == UInt8(ascii: "E"),
              let code = String(data: reply.body, encoding: .ascii),
              !code.isEmpty, code.utf8.allSatisfy({ $0 >= 65 && $0 <= 90 || $0 == 95 }) else {
            throw ViewerError.malformedResponse
        }
        return code
    }

    private func helloError(_ reply: (result: UInt8, body: Data)) throws -> ViewerError {
        .server(try errorCode(reply))
    }
}
