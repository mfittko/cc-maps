import CoreLocation
import Foundation

/// Generates GPX 1.1 XML from ordered planning sections.
/// Mirrors the web-side `createGpxFromRouteFeatures` in lib/route-export.js.
enum RouteExport {
    private static let defaultRouteName = "CC Maps route"
    private static let defaultFileName = "cc-maps-route.gpx"

    /// Returns a GPX 1.1 string for the given ordered sections, or an empty string when there are
    /// fewer than two coordinates across all sections.
    static func gpx(from sections: [PlanningSection], routeName: String? = nil) -> String {
        let validSegments = sections
            .map(\.coordinates)
            .map(deduplicatedCoordinates)
            .filter { $0.count >= 2 }

        guard !validSegments.isEmpty else {
            return ""
        }

        let escapedName = xmlEscape(normalizedRouteName(routeName))

        let trackSegments = validSegments.map { coordinates -> String in
            let points = coordinates.map { coord in
                "      <trkpt lat=\"\(formatCoordinate(coord.latitude))\" lon=\"\(formatCoordinate(coord.longitude))\"></trkpt>"
            }.joined(separator: "\n")
            return "    <trkseg>\n\(points)\n    </trkseg>"
        }.joined(separator: "\n")

        return """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="cc-maps" xmlns="http://www.topografix.com/GPX/1/1">
          <trk>
            <name>\(escapedName)</name>
        \(trackSegments)
          </trk>
        </gpx>
        """
    }

    /// Returns a stable GPX file name from the route name, falling back to "cc-maps-route.gpx".
    static func fileName(for routeName: String?) -> String {
        let baseName = String(routeName ?? "cc-maps-route")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        let normalized = baseName
            .replacingOccurrences(
                of: "[^a-z0-9]+",
                with: "-",
                options: .regularExpression
            )
            .replacingOccurrences(of: "^-+|-+$", with: "", options: .regularExpression)

        return normalized.isEmpty ? defaultFileName : "\(normalized).gpx"
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

    private static func normalizedRouteName(_ routeName: String?) -> String {
        guard let routeName, !routeName.isEmpty else {
            return defaultRouteName
        }

        return routeName
    }

    private static func formatCoordinate(_ value: Double) -> String {
        String(value)
    }

    private static func deduplicatedCoordinates(_ coordinates: [CLLocationCoordinate2D]) -> [CLLocationCoordinate2D] {
        coordinates.reduce(into: []) { result, coordinate in
            if let previous = result.last,
               previous.latitude == coordinate.latitude,
               previous.longitude == coordinate.longitude {
                return
            }

            result.append(coordinate)
        }
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

private func formatElevationLabel(ascentMeters: Double?, descentMeters: Double?) -> String? {
    guard let ascent = ascentMeters else {
        return nil
    }

    if let descent = descentMeters {
        return String(format: "↑ %.0f m  ↓ %.0f m", ascent, descent)
    }

    return String(format: "↑ %.0f m", ascent)
}

struct SectionElevationSummary: Equatable {
    let status: String
    let ascentMeters: Double?
    let descentMeters: Double?

    var formattedElevationLabel: String? {
        formatElevationLabel(ascentMeters: ascentMeters, descentMeters: descentMeters)
    }
}

extension ElevationApiResponse {
    func sectionElevation(for sectionKey: String) -> SectionElevationSummary? {
        guard let section = sections.first(where: { $0.sectionKey == sectionKey }) else {
            return nil
        }

        return SectionElevationSummary(
            status: section.status,
            ascentMeters: section.metrics.map { Double($0.ascentMeters) },
            descentMeters: section.metrics.map { Double($0.descentMeters) }
        )
    }
}

/// Compact route summary suitable for display in the planning surface.
struct RouteSummary: Equatable {
    let sectionCount: Int
    let totalDistanceKm: Double
    /// `nil` means elevation data is unavailable for this route.
    let ascentMeters: Double?
    /// `nil` means elevation data is unavailable for this route.
    let descentMeters: Double?

    var formattedDistanceLabel: String {
        String(format: "%.1f km", totalDistanceKm)
    }

    var formattedElevationLabel: String? {
        formatElevationLabel(ascentMeters: ascentMeters, descentMeters: descentMeters)
    }

    /// Human-readable note shown when elevation data is not available.
    static let elevationUnavailableNote = "Elevation data not available"

    static func from(sections: [PlanningSection]) -> RouteSummary {
        let total = sections.reduce(0) { $0 + $1.distanceKm }
        return RouteSummary(sectionCount: sections.count, totalDistanceKm: total, ascentMeters: nil, descentMeters: nil)
    }

    static func from(sections: [PlanningSection], elevationResponse: ElevationApiResponse?) -> RouteSummary {
        let total = sections.reduce(0) { $0 + $1.distanceKm }
        let routeMetrics = elevationResponse?.route.status == "ok" ? elevationResponse?.route.metrics : nil
        return RouteSummary(
            sectionCount: sections.count,
            totalDistanceKm: total,
            ascentMeters: routeMetrics.map { Double($0.ascentMeters) },
            descentMeters: routeMetrics.map { Double($0.descentMeters) }
        )
    }
}

struct RouteAwareTrailDetailContext: Equatable {
    let selectedSectionNumber: Int
    let totalSections: Int
    let totalDistanceKm: Double
    /// `nil` means elevation data is unavailable for this route.
    let ascentMeters: Double?
    /// `nil` means elevation data is unavailable for this route.
    let descentMeters: Double?
    let selectedSectionElevation: SectionElevationSummary?

    var formattedSectionLabel: String {
        "Section \(selectedSectionNumber) of \(totalSections)"
    }

    var formattedTotalDistanceLabel: String {
        String(format: "%.1f km", totalDistanceKm)
    }

    var formattedElevationLabel: String? {
        formatElevationLabel(ascentMeters: ascentMeters, descentMeters: descentMeters)
    }

    var formattedSelectedSectionElevationLabel: String? {
        selectedSectionElevation?.formattedElevationLabel
    }

    static let sectionElevationUnavailableNote = "Section elevation not available"
}
