import Darwin
import Foundation
import XCTest
@testable import MGBAClientCore

final class ViewerClientTests: XCTestCase {
    func testConnectionFailure() throws {
        let settings = try ConnectionSettings(socketPath: "/private/tmp/mgba-client-missing-\(UUID().uuidString)", waitText: "10")
        let failed = expectation(description: "connection failure")
        let client = ViewerClient()
        client.start(settings: settings) { event in
            if case .failed = event { failed.fulfill() }
            else { XCTFail("Unexpected event") }
        }
        wait(for: [failed], timeout: 3)
    }

    func testWaitFrameTransitions() throws {
        let path = "/private/tmp/mgba-client-test-\(UUID().uuidString).sock"
        let listener = socket(AF_UNIX, SOCK_STREAM, 0)
        XCTAssertGreaterThanOrEqual(listener, 0)
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        withUnsafeMutableBytes(of: &address.sun_path) { buffer in
            let bytes = Array(path.utf8)
            for (index, byte) in bytes.enumerated() { buffer[index] = byte }
            buffer[bytes.count] = 0
        }
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        XCTAssertEqual(bound, 0, "bind errno=\(errno): \(String(cString: strerror(errno)))")
        XCTAssertEqual(listen(listener, 1), 0)
        defer { Darwin.close(listener); unlink(path) }

        let server = DispatchQueue(label: "mock.server")
        let served = expectation(description: "mock server finished")
        server.async {
            let fd = accept(listener, nil, nil)
            guard fd >= 0 else { served.fulfill(); return }
            defer { Darwin.close(fd); served.fulfill() }
            XCTAssertEqual(self.readLine(fd), "HELLO VIEW")
            self.sendReply(fd, success: true, body: Data())
            XCTAssertEqual(self.readLine(fd), "WAIT_FRAME 10000")
            self.sendReply(fd, success: false, body: Data("NO_FRAME".utf8))
            XCTAssertEqual(self.readLine(fd), "STATUS")
            self.sendReply(fd, success: true, body: Data("frames=0 pressed_keys=0 has_frame=false".utf8))
            XCTAssertEqual(self.readLine(fd), "WAIT_FRAME 10000")
            self.sendReply(fd, success: false, body: Data("TIMEOUT".utf8))
            XCTAssertEqual(self.readLine(fd), "WAIT_FRAME 10000")
            var frame = Data(repeating: 0, count: 10 + 160 * 144 * 4)
            frame[0] = 7; frame[8] = 160; frame[9] = 144
            self.sendReply(fd, success: true, body: frame)
            XCTAssertEqual(self.readLine(fd), "STATUS")
            self.sendReply(fd, success: true, body: Data("frames=7 pressed_keys=1 has_frame=true".utf8))
        }

        let complete = expectation(description: "all client events")
        var events: [ViewerEvent] = []
        let client = ViewerClient()
        client.start(settings: try ConnectionSettings(socketPath: path, waitText: "10")) { event in
            events.append(event)
            if case .failed = event { complete.fulfill() }
        }
        wait(for: [served, complete], timeout: 5)
        XCTAssertEqual(events.count, 4)
        if events.count == 4 {
            if case .connected = events[0] {} else { XCTFail("Missing connection event") }
            if case .update(let frame, let status) = events[1] {
                XCTAssertNil(frame); XCTAssertFalse(status.hasFrame)
            } else { XCTFail("Missing no-frame update") }
            if case .update(let frame, let status) = events[2] {
                XCTAssertEqual(frame?.frameNumber, 7)
                XCTAssertEqual(status.pressedButtonNames, "A")
            } else { XCTFail("Missing frame update") }
            if case .failed(.disconnected) = events[3] {} else { XCTFail("Missing disconnect event") }
        }
    }

    private func readLine(_ fd: Int32) -> String {
        var bytes: [UInt8] = []
        while true {
            var byte: UInt8 = 0
            guard recv(fd, &byte, 1, 0) == 1 else { return "" }
            if byte == 10 { return String(bytes: bytes, encoding: .ascii) ?? "" }
            bytes.append(byte)
        }
    }

    private func sendReply(_ fd: Int32, success: Bool, body: Data) {
        var reply = Data([success ? 83 : 69])
        let length = UInt32(body.count)
        for shift in stride(from: 0, to: 32, by: 8) { reply.append(UInt8((length >> shift) & 255)) }
        reply.append(body)
        reply.append(10)
        reply.withUnsafeBytes { raw in
            var offset = 0
            while offset < raw.count {
                let sent = send(fd, raw.baseAddress!.advanced(by: offset), raw.count - offset, 0)
                guard sent > 0 else { return }
                offset += sent
            }
        }
    }
}
