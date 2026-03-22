import CoreLocation
import Foundation

final class LocationService: NSObject, CLLocationManagerDelegate, BrowseLocationServing {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)?
    var onHeadingUpdate: ((CLLocationDirection?) -> Void)?
    var onAuthorizationUnavailable: (() -> Void)?

    private let manager = CLLocationManager()
    private var lastHeading: CLLocationDirection?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = AppConfig.currentLocationRecheckDistanceKm * 1000
        manager.headingFilter = AppConfig.currentLocationHeadingFilterDegrees
    }

    func start() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            startHeadingUpdatesIfAvailable()
            manager.requestLocation()
        case .restricted, .denied:
            onAuthorizationUnavailable?()
        @unknown default:
            onAuthorizationUnavailable?()
        }
    }

    func requestCurrentLocation() {
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            startHeadingUpdatesIfAvailable()
            manager.requestLocation()
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            onAuthorizationUnavailable?()
        @unknown default:
            onAuthorizationUnavailable?()
        }
    }

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.startUpdatingLocation()
            startHeadingUpdatesIfAvailable()
            manager.requestLocation()
        case .restricted, .denied:
            onAuthorizationUnavailable?()
        case .notDetermined:
            break
        @unknown default:
            onAuthorizationUnavailable?()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else {
            return
        }

        onLocationUpdate?(location.coordinate)

        if let direction = preferredDirection(from: location) {
            lastHeading = direction
            onHeadingUpdate?(direction)
        } else if let lastHeading {
            onHeadingUpdate?(lastHeading)
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateHeading newHeading: CLHeading) {
        let sourceHeading = newHeading.trueHeading >= 0 ? newHeading.trueHeading : newHeading.magneticHeading
        guard sourceHeading >= 0 else {
            return
        }

        let normalizedHeading = normalizedDirection(sourceHeading)
        lastHeading = normalizedHeading
        onHeadingUpdate?(normalizedHeading)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        onAuthorizationUnavailable?()
    }

    private func startHeadingUpdatesIfAvailable() {
        guard CLLocationManager.headingAvailable() else {
            return
        }

        manager.startUpdatingHeading()
    }

    private func preferredDirection(from location: CLLocation) -> CLLocationDirection? {
        guard location.speed >= AppConfig.currentLocationMinimumCourseSpeedMetersPerSecond,
              location.course >= 0 else {
            return nil
        }

        return normalizedDirection(location.course)
    }

    private func normalizedDirection(_ direction: CLLocationDirection) -> CLLocationDirection {
        let normalizedDirection = direction.truncatingRemainder(dividingBy: 360)
        return normalizedDirection >= 0 ? normalizedDirection : normalizedDirection + 360
    }
}