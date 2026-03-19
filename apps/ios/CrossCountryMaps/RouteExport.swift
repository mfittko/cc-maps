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
