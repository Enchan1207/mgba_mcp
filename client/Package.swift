// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MGBAClient",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "mgba_client", targets: ["MGBAClientApp"])
    ],
    targets: [
        .target(name: "MGBAClientCore"),
        .executableTarget(name: "MGBAClientApp", dependencies: ["MGBAClientCore"]),
        .testTarget(name: "MGBAClientTests", dependencies: ["MGBAClientCore"])
    ]
)
