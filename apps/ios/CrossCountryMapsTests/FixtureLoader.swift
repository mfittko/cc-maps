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

        throw CocoaError(.fileNoSuchFile)
    }
}

private final class FixtureBundleToken {}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}