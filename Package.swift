// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SoftwareTokens",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [
        .library(name: "SoftwareTokens", targets: ["SoftwareTokens"]),
    ],
    targets: [
        .target(name: "SoftwareTokens", path: "platforms/ios/Sources/SoftwareTokens"),
    ]
)
