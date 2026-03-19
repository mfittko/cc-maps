import CoreLocation
import Foundation

// MARK: - Elevation API request types

struct LineStringGeometry: Encodable, Equatable {
    var type: String = "LineString"
    let coordinates: [[Double]]
}

struct ElevationSectionRequest: Encodable, Equatable {
    let sectionKey: String
    let geometry: LineStringGeometry
}

struct ElevationApiRequest: Encodable, Equatable {
    let destinationId: String
    let routeTraversal: [LineStringGeometry]
    let routeSections: [ElevationSectionRequest]
}

// MARK: - Elevation API response types

struct ElevationMetrics: Codable, Equatable {
    let ascentMeters: Int
    let descentMeters: Int
}

struct ElevationResult: Codable, Equatable {
    let status: String
    let metrics: ElevationMetrics?
}

struct ElevationSectionResult: Codable, Equatable {
    let sectionKey: String
    let status: String
    let metrics: ElevationMetrics?
}

struct ElevationApiResponse: Codable, Equatable {
    let status: String
    let route: ElevationResult
    let sections: [ElevationSectionResult]
}

// MARK: - Helper

/// Converts an array of CLLocationCoordinate2D to a LineStringGeometry with [lng, lat] pairs.
func lineStringGeometry(from coordinates: [CLLocationCoordinate2D]) -> LineStringGeometry {
    LineStringGeometry(coordinates: coordinates.map { [$0.longitude, $0.latitude] })
}
