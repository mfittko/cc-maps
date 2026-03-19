import Foundation

enum FixtureLoader {
    static func decode<T: Decodable>(_ fileName: String, as type: T.Type = T.self) throws -> T {
        let fixtureURL = try fixtureURL(for: fileName)
        let data = try Data(contentsOf: fixtureURL)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static func fixtureURL(for fileName: String) throws -> URL {
        let bundle = Bundle(for: FixtureBundleToken.self)
        let resourceName = URL(fileURLWithPath: fileName).deletingPathExtension().lastPathComponent
        let resourceExtension = URL(fileURLWithPath: fileName).pathExtension.nilIfEmpty

        if let bundledURL = bundle.url(forResource: resourceName, withExtension: resourceExtension) {
            return bundledURL
        }

        let repoRootURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()

        let fixturesRootURL = repoRootURL
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")

        let repoFixtureURL = fileName
            .split(separator: "/")
            .reduce(fixturesRootURL) { partialURL, pathComponent in
                partialURL.appendingPathComponent(String(pathComponent))
            }

        if FileManager.default.fileExists(atPath: repoFixtureURL.path) {
            return repoFixtureURL
        }

        throw CocoaError(.fileNoSuchFile)
    }
}

private final class FixtureBundleToken {}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}