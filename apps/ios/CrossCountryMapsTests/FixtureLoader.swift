import Foundation

enum FixtureLoader {
    static func decode<T: Decodable>(_ fileName: String, as type: T.Type = T.self) throws -> T {
        let fixtureURL = fixturesDirectoryURL.appendingPathComponent(fileName)
        let data = try Data(contentsOf: fixtureURL)
        return try JSONDecoder().decode(T.self, from: data)
    }

    private static var fixturesDirectoryURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")
            .appendingPathComponent("browse-contract")
    }
}