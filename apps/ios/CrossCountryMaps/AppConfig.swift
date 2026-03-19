import CoreLocation
import Foundation

enum AppConfig {
    static let defaultCenter = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
    static let routePlanStorageKey = "cc-maps:settings"
    static let currentLocationTrackMatchThresholdKm = 0.05
    static let currentLocationRecheckDistanceKm = 0.02
    static let previewRegionRecheckDistanceKm = 0.35
    static let suggestedDestinationRadiusKm = 20.0
    static let maxNearbyDestinationPreviews = 3
    static let destinationSuggestionDebounceNanoseconds: UInt64 = 700_000_000
    static let initialFallbackDelayNanoseconds: UInt64 = 1_500_000_000
    static let trailTapThresholdKm = 0.05
    static let trailSegmentLabelsMaxLatitudeDelta = 0.18

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
}