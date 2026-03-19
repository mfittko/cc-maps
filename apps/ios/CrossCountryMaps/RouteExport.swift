import CoreLocation
import Foundation

/// Generates GPX 1.1 XML from ordered planning sections.
/// Mirrors the web-side `createGpxFromRouteFeatures` in lib/route-export.js.
enum RouteExport {
    /// Returns a GPX 1.1 string for the given ordered sections, or an empty string when there are
    /// fewer than two coordinates across all sections.
    static func gpx(from sections: [PlanningSection], routeName: String? = nil) -> String {
        let validSegments = sections.map(\.coordinates).filter { $0.count >= 2 }

        guard !validSegments.isEmpty, validSegments.contains(where: { $0.count >= 2 }) else {
            return ""
        }

        let totalCoordinates = validSegments.reduce(0) { $0 + $1.count }
        guard totalCoordinates >= 2 else {
            return ""
        }

        let escapedName = (routeName ?? "").isEmpty ? "" : xmlEscape(routeName!)
        let nameElement = escapedName.isEmpty ? "" : "\n    <name>\(escapedName)</name>"

        let trackSegments = validSegments.map { coordinates -> String in
            let points = coordinates.map { coord in
                "      <trkpt lat=\"\(formatCoordinate(coord.latitude))\" lon=\"\(formatCoordinate(coord.longitude))\"></trkpt>"
            }.joined(separator: "\n")
            return "    <trkseg>\n\(points)\n    </trkseg>"
        }.joined(separator: "\n")

        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="cc-maps" xmlns="http://www.topografix.com/GPX/1/1">
          <trk>\(nameElement)
        \(trackSegments)
          </trk>
        </gpx>
        """
    }

    /// Returns a stable GPX file name from the route name, falling back to "cc-maps-route.gpx".
    static func fileName(for routeName: String?) -> String {
        guard let routeName, !routeName.trimmingCharacters(in: .whitespaces).isEmpty else {
            return "cc-maps-route.gpx"
        }

        let normalized = routeName
            .lowercased()
            .components(separatedBy: .init(charactersIn: " _/\\"))
            .filter { !$0.isEmpty }
            .joined(separator: "-")
            .filter { $0.isLetter || $0.isNumber || $0 == "-" }

        return normalized.isEmpty ? "cc-maps-route.gpx" : "\(normalized).gpx"
    }

    // MARK: - Private helpers

    private static func xmlEscape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    private static func formatCoordinate(_ value: Double) -> String {
        String(format: "%.6g", value)
    }
}

struct RouteShareArtifact: Equatable {
    let encodedRoute: String
    let url: URL
    let title: String
    let message: String

    init?(routePlan: CanonicalRoutePlan, destinationName: String, baseURL: URL = AppConfig.shareBaseURL) {
        guard let encodedRoute = routePlan.encodedForURL,
              var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            return nil
        }

        var queryItems = components.queryItems ?? []
        queryItems.removeAll { $0.name == "route" }
        queryItems.append(URLQueryItem(name: "route", value: encodedRoute))
        components.queryItems = queryItems

        guard let url = components.url else {
            return nil
        }

        self.encodedRoute = encodedRoute
        self.url = url
        title = "\(destinationName) route"
        message = "Planned route for \(destinationName)"
    }
}

struct RouteExportFile: Equatable {
    let fileName: String
    let content: String

    func writeTemporaryFile(fileManager: FileManager = .default) throws -> URL {
        let temporaryDirectoryURL = fileManager.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let temporaryURL = temporaryDirectoryURL.appendingPathComponent(fileName)

        try fileManager.createDirectory(
            at: temporaryDirectoryURL,
            withIntermediateDirectories: true
        )
        try content.write(to: temporaryURL, atomically: true, encoding: .utf8)
        return temporaryURL
    }
}

/// Compact route summary suitable for display in the planning surface.
struct RouteSummary: Equatable {
    let sectionCount: Int
    let totalDistanceKm: Double
    /// `nil` means elevation data is unavailable for this route.
    let totalElevationMeters: Double?

    var formattedDistanceLabel: String {
        String(format: "%.1f km", totalDistanceKm)
    }

    var formattedElevationLabel: String? {
        guard let meters = totalElevationMeters else {
            return nil
        }

        return String(format: "↑ %.0f m", meters)
    }

    /// Human-readable note shown when elevation data is not available.
    static let elevationUnavailableNote = "Elevation data not available"

    static func from(sections: [PlanningSection]) -> RouteSummary {
        let total = sections.reduce(0) { $0 + $1.distanceKm }
        // Elevation is not currently available from the Sporet data source.
        return RouteSummary(sectionCount: sections.count, totalDistanceKm: total, totalElevationMeters: nil)
    }
}

struct RouteAwareTrailDetailContext: Equatable {
    let selectedSectionNumber: Int
    let totalSections: Int
    let totalDistanceKm: Double
    let totalElevationMeters: Double?
    let selectedSectionDistanceKm: Double

    var formattedSectionLabel: String {
        "Section \(selectedSectionNumber) of \(totalSections)"
    }

    var formattedTotalDistanceLabel: String {
        String(format: "%.1f km", totalDistanceKm)
    }

    var formattedSelectedSectionDistanceLabel: String {
        String(format: "%.1f km", selectedSectionDistanceKm)
    }

    var formattedElevationLabel: String? {
        guard let totalElevationMeters else {
            return nil
        }

        return String(format: "↑ %.0f m", totalElevationMeters)
    }
}
