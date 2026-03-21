import CoreLocation
import Foundation

enum MapHeading {
    static func angularDifference(
        from sourceHeading: CLLocationDirection,
        to targetHeading: CLLocationDirection
    ) -> CLLocationDirection {
        let normalizedDelta = abs((targetHeading - sourceHeading).truncatingRemainder(dividingBy: 360))
        return min(normalizedDelta, 360 - normalizedDelta)
    }
}

enum AppConfig {
    static let defaultCenter = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
    static let routePlanStorageKey = "cc-maps:settings"
    static let currentLocationTrackMatchThresholdKm = 0.05
    static let currentLocationRecheckDistanceKm = 0.02
    static let currentLocationHeadingMinimumDistanceMeters = 8.0
    static let currentLocationHeadingFilterDegrees = 1.5
    static let currentLocationHeadingCameraUpdateThresholdDegrees = 1.0
    static let currentLocationCameraRecenterThresholdMeters = 3.0
    static let currentLocationMinimumCourseSpeedMetersPerSecond = 0.8
    static let previewRegionRecheckDistanceKm = 0.35
    static let suggestedDestinationRadiusKm = 20.0
    static let maxNearbyDestinationPreviews = 3
    static let destinationSuggestionDebounceNanoseconds: UInt64 = 700_000_000
    static let trailTapThresholdKm = 0.05
    static let trailSegmentLabelsMaxLatitudeDelta = 0.18
    static let routeDirectionRotationDetectionThresholdDegrees = 0.35
    static let routeDirectionRotationRestoreDelaySeconds = 0.2
    static let routeSectionArrowSpacingKm = 0.5

    static var isRunningTests: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }

    static var apiBaseURL: URL {
        if
            let value = Bundle.main.object(forInfoDictionaryKey: "CrossCountryMapsAPIBaseURL") as? String,
            let url = URL(string: value),
            !value.isEmpty
        {
            return url
        }

        return URL(string: "http://localhost:3000")!
    }

    static var shareBaseURL: URL {
        if
            let value = Bundle.main.object(forInfoDictionaryKey: "CrossCountryMapsShareBaseURL") as? String,
            let url = URL(string: value),
            !value.isEmpty
        {
            return url
        }

        return URL(string: "https://cc-maps.vercel.app")!
    }
}