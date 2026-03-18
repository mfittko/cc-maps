import MapKit
import SwiftUI

struct TrailMapView: UIViewRepresentable {
    let destinations: [Destination]
    let selectedDestinationID: String
    let nearbyPreviewDestinationIDs: Set<String>
    let primaryTrails: [TrailFeature]
    let previewTrails: [TrailFeature]
    let selectedTrailID: String?
    let fitRequestID: Int
    let currentLocation: CLLocationCoordinate2D?
    let locationFocusRequestID: Int
    let isAutoFollowEnabled: Bool
    let onDestinationTap: (String) -> Void
    let onTrailTap: (String?) -> Void
    let onRegionDidChange: (CLLocationCoordinate2D) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> MKMapView {
        let mapView = MKMapView(frame: .zero)
        mapView.delegate = context.coordinator
        mapView.pointOfInterestFilter = .excludingAll
        mapView.showsCompass = true
        mapView.showsScale = false
        mapView.showsUserLocation = true
        mapView.setRegion(
            MKCoordinateRegion(
                center: AppConfig.defaultCenter,
                span: MKCoordinateSpan(latitudeDelta: 0.45, longitudeDelta: 0.45)
            ),
            animated: false
        )

        let tapRecognizer = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleMapTap(_:)))
        tapRecognizer.cancelsTouchesInView = false
        mapView.addGestureRecognizer(tapRecognizer)
        context.coordinator.tapRecognizer = tapRecognizer
        context.coordinator.mapView = mapView

        return mapView
    }

    func updateUIView(_ mapView: MKMapView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.syncAnnotations(on: mapView)
        context.coordinator.syncOverlays(on: mapView)

        if context.coordinator.lastFitRequestID != fitRequestID {
            context.coordinator.lastFitRequestID = fitRequestID
            context.coordinator.fitMapToPrimaryTrails(on: mapView)
        }

        if context.coordinator.lastLocationFocusRequestID != locationFocusRequestID {
            context.coordinator.lastLocationFocusRequestID = locationFocusRequestID
            context.coordinator.updateTrackingMode(on: mapView)
        } else if context.coordinator.lastAutoFollowEnabled != isAutoFollowEnabled {
            context.coordinator.updateTrackingMode(on: mapView)
        }
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var parent: TrailMapView
        weak var mapView: MKMapView?
        weak var tapRecognizer: UITapGestureRecognizer?
        var lastAnnotationSignature = ""
        var lastOverlaySignature = ""
        var lastFitRequestID = 0
        var lastLocationFocusRequestID = 0
        var lastAutoFollowEnabled = false

        init(_ parent: TrailMapView) {
            self.parent = parent
        }

        func syncAnnotations(on mapView: MKMapView) {
            let signature = parent.destinations.map(\.id).joined(separator: ",") + "|selected:\(parent.selectedDestinationID)|preview:\(parent.nearbyPreviewDestinationIDs.sorted().joined(separator: ","))"

            guard signature != lastAnnotationSignature else {
                return
            }

            lastAnnotationSignature = signature
            let existingAnnotations = mapView.annotations.compactMap { $0 as? DestinationAnnotation }
            mapView.removeAnnotations(existingAnnotations)

            let annotations = parent.destinations.map { destination in
                DestinationAnnotation(
                    destination: destination,
                    isSelected: destination.id == parent.selectedDestinationID,
                    isNearbyPreview: parent.nearbyPreviewDestinationIDs.contains(destination.id)
                )
            }

            mapView.addAnnotations(annotations)
        }

        func syncOverlays(on mapView: MKMapView) {
            let signature = [
                parent.primaryTrails.map(\.id).joined(separator: ","),
                parent.previewTrails.map(\.id).joined(separator: ","),
                parent.selectedTrailID ?? ""
            ].joined(separator: "|")

            guard signature != lastOverlaySignature else {
                return
            }

            lastOverlaySignature = signature
            mapView.removeOverlays(mapView.overlays)

            let overlays = buildTrailOverlays(trails: parent.previewTrails, isPreview: true) +
                buildTrailOverlays(trails: parent.primaryTrails, isPreview: false)

            mapView.addOverlays(overlays)
        }

        func fitMapToPrimaryTrails(on mapView: MKMapView) {
            guard let mapRect = GeoMath.mapRect(for: parent.primaryTrails), !mapRect.isNull else {
                mapView.setRegion(
                    MKCoordinateRegion(
                        center: AppConfig.defaultCenter,
                        span: MKCoordinateSpan(latitudeDelta: 0.45, longitudeDelta: 0.45)
                    ),
                    animated: true
                )
                return
            }

            mapView.setVisibleMapRect(
                mapRect,
                edgePadding: UIEdgeInsets(top: 180, left: 24, bottom: 150, right: 24),
                animated: true
            )
        }

        func updateTrackingMode(on mapView: MKMapView) {
            lastAutoFollowEnabled = parent.isAutoFollowEnabled

            if parent.isAutoFollowEnabled {
                mapView.setUserTrackingMode(.follow, animated: true)

                if let currentLocation = parent.currentLocation {
                    mapView.setRegion(
                        MKCoordinateRegion(
                            center: currentLocation,
                            span: MKCoordinateSpan(latitudeDelta: 0.09, longitudeDelta: 0.09)
                        ),
                        animated: true
                    )
                }
            } else if mapView.userTrackingMode != .none {
                mapView.setUserTrackingMode(.none, animated: true)
            }
        }

        @objc
        func handleMapTap(_ recognizer: UITapGestureRecognizer) {
            guard let mapView = mapView, recognizer.state == .ended else {
                return
            }

            let tapPoint = recognizer.location(in: mapView)

            if let hitView = mapView.hitTest(tapPoint, with: nil), hitView is MKAnnotationView || hitView.superview is MKAnnotationView {
                return
            }

            let tappedCoordinate = mapView.convert(tapPoint, toCoordinateFrom: mapView)
            let displayedTrails = parent.primaryTrails + parent.previewTrails

            guard let nearestTrail = displayedTrails.min(by: { left, right in
                GeoMath.distanceToTrailKilometers(reference: tappedCoordinate, trail: left) <
                    GeoMath.distanceToTrailKilometers(reference: tappedCoordinate, trail: right)
            }) else {
                DispatchQueue.main.async {
                    self.parent.onTrailTap(nil)
                }
                return
            }

            let nearestDistance = GeoMath.distanceToTrailKilometers(reference: tappedCoordinate, trail: nearestTrail)
            DispatchQueue.main.async {
                self.parent.onTrailTap(nearestDistance <= AppConfig.trailTapThresholdKm ? nearestTrail.id : nil)
            }
        }

        func buildTrailOverlays(trails: [TrailFeature], isPreview: Bool) -> [TrailOverlay] {
            trails.flatMap { trail in
                trail.coordinateSets.compactMap { coordinates -> TrailOverlay? in
                    guard coordinates.count >= 2 else {
                        return nil
                    }

                    let overlay = TrailOverlay(coordinates: coordinates, count: coordinates.count)
                    overlay.trailID = trail.id
                    overlay.isPreview = isPreview
                    overlay.isSelected = trail.id == parent.selectedTrailID
                    overlay.groomingColor = UIColor(hex: trail.groomingColorHex)
                    return overlay
                }
            }
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            let center = mapView.region.center
            DispatchQueue.main.async {
                self.parent.onRegionDidChange(center)
            }
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let destinationAnnotation = annotation as? DestinationAnnotation else {
                return nil
            }

            let identifier = "DestinationAnnotation"
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? MKMarkerAnnotationView ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: identifier)
            view.annotation = annotation
            view.canShowCallout = true
            view.titleVisibility = .adaptive
            view.subtitleVisibility = .hidden
            view.glyphImage = UIImage(systemName: destinationAnnotation.isSelected ? "location.fill" : "mountain.2.fill")

            if destinationAnnotation.isSelected {
                view.markerTintColor = .systemBlue
                view.displayPriority = .required
            } else if destinationAnnotation.isNearbyPreview {
                view.markerTintColor = .systemOrange
                view.displayPriority = .defaultHigh
            } else {
                view.markerTintColor = .systemGreen
                view.displayPriority = .defaultLow
            }

            return view
        }

        func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
            guard let annotation = view.annotation as? DestinationAnnotation else {
                return
            }

            let destinationID = annotation.destinationID
            DispatchQueue.main.async {
                self.parent.onDestinationTap(destinationID)
            }
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            guard let trailOverlay = overlay as? TrailOverlay else {
                return MKOverlayRenderer(overlay: overlay)
            }

            let renderer = MKPolylineRenderer(overlay: trailOverlay)

            let baseColor = trailOverlay.groomingColor ?? UIColor.systemGreen

            if trailOverlay.isSelected {
                renderer.strokeColor = baseColor.withAlphaComponent(0.98)
                renderer.lineWidth = 8
            } else if trailOverlay.isPreview {
                renderer.strokeColor = baseColor.withAlphaComponent(0.3)
                renderer.lineWidth = 4
            } else {
                renderer.strokeColor = baseColor.withAlphaComponent(0.88)
                renderer.lineWidth = 5
            }

            renderer.lineCap = .round
            renderer.lineJoin = .round
            return renderer
        }
    }
}

final class TrailOverlay: MKPolyline {
    var trailID = ""
    var isPreview = false
    var isSelected = false
    var groomingColor: UIColor?
}

final class DestinationAnnotation: NSObject, MKAnnotation {
    let destinationID: String
    let isSelected: Bool
    let isNearbyPreview: Bool
    let title: String?
    dynamic var coordinate: CLLocationCoordinate2D

    init(destination: Destination, isSelected: Bool, isNearbyPreview: Bool) {
        destinationID = destination.id
        self.isSelected = isSelected
        self.isNearbyPreview = isNearbyPreview
        title = destination.name
        coordinate = destination.coordinate
    }
}

private extension UIColor {
    convenience init(hex: String) {
        let sanitizedHex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: sanitizedHex).scanHexInt64(&value)

        let red = CGFloat((value >> 16) & 0xFF) / 255
        let green = CGFloat((value >> 8) & 0xFF) / 255
        let blue = CGFloat(value & 0xFF) / 255

        self.init(red: red, green: green, blue: blue, alpha: 1)
    }
}