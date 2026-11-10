import Foundation
import XCTest
@testable import MGBAClientCore

final class ProtocolTests: XCTestCase {
    func testSettings() throws {
        XCTAssertEqual(try ConnectionSettings(socketPath: "/tmp/mgba.sock", waitText: "60").waitMilliseconds, 60_000)
        for value in ["", "9", "121", "1.5", "-10", "abc", "999999999999999999999"] {
            XCTAssertThrowsError(try ConnectionSettings(socketPath: "/tmp/mgba.sock", waitText: value))
        }
        XCTAssertThrowsError(try ConnectionSettings(socketPath: "", waitText: "60"))
    }

    func testFrameValidation() throws {
        var bytes = [UInt8](repeating: 0, count: 10 + 160 * 144 * 4)
        bytes[0] = 42
        bytes[8] = 160
        bytes[9] = 144
        let frame = try ViewerProtocol.parseFrame(Data(bytes))
        XCTAssertEqual(frame.frameNumber, 42)
        XCTAssertEqual(frame.rgbx.count, 160 * 144 * 4)
        bytes[8] = 159
        XCTAssertThrowsError(try ViewerProtocol.parseFrame(Data(bytes)))
        XCTAssertThrowsError(try ViewerProtocol.parseFrame(Data(bytes.dropLast())))
    }

    func testStatusValidationAndButtons() throws {
        let status = try ViewerProtocol.parseStatus(Data("frames=123 pressed_keys=129 has_frame=true".utf8))
        XCTAssertEqual(status.frames, 123)
        XCTAssertEqual(status.pressedButtonNames, "A, Down")
        XCTAssertTrue(status.hasFrame)
        for value in ["frames=-1 pressed_keys=0 has_frame=true", "frames=1 pressed_keys=4294967296 has_frame=false", "frames=1 pressed_keys=0 has_frame=yes", "frames=1  pressed_keys=0 has_frame=true"] {
            XCTAssertThrowsError(try ViewerProtocol.parseStatus(Data(value.utf8)))
        }
    }
}
