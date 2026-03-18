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
        var lastSegmentAnnotationSignature = ""
        var lastFitRequestID = 0
        var lastLocationFocusRequestID = 0
        var lastAutoFollowEnabled = false
        var cachedSegmentAnnotations: [TrailSegmentAnnotation] = []

        init(_ parent: TrailMapView) {
            self.parent = parent
        }

        func syncAnnotations(on mapView: MKMapView) {
            let displayedTrails = parent.primaryTrails + parent.previewTrails
            let shouldShowSegmentLabels = mapView.region.span.latitudeDelta <= AppConfig.trailSegmentLabelsMaxLatitudeDelta
            let segmentAnnotations = segmentAnnotations(
                for: displayedTrails,
                shouldShowLabels: shouldShowSegmentLabels
            )
            let signature = [
                parent.destinations.map(\.id).joined(separator: ","),
                "selected:\(parent.selectedDestinationID)",
                "preview:\(parent.nearbyPreviewDestinationIDs.sorted().joined(separator: ","))",
                "trails:\(displayedTrails.map(\.id).joined(separator: ","))",
                "segment-trail:\(parent.selectedTrailID ?? "")",
                "segment-visible:\(shouldShowSegmentLabels ? "1" : "0")"
            ].joined(separator: "|")

            guard signature != lastAnnotationSignature else {
                return
            }

            lastAnnotationSignature = signature
            let existingAnnotations = mapView.annotations.filter {
                $0 is DestinationAnnotation || $0 is TrailSegmentAnnotation
            }
            mapView.removeAnnotations(existingAnnotations)

            let destinationAnnotations = parent.destinations.map { destination in
                DestinationAnnotation(
                    destination: destination,
                    isSelected: destination.id == parent.selectedDestinationID,
                    isNearbyPreview: parent.nearbyPreviewDestinationIDs.contains(destination.id)
                )
            }

            mapView.addAnnotations(destinationAnnotations + segmentAnnotations)
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

        func segmentAnnotations(for trails: [TrailFeature], shouldShowLabels: Bool) -> [TrailSegmentAnnotation] {
            guard shouldShowLabels,
                  let selectedTrailID = parent.selectedTrailID,
                  let selectedTrail = trails.first(where: { $0.id == selectedTrailID }) else {
                cachedSegmentAnnotations = []
                lastSegmentAnnotationSignature = ""
                return []
            }

            let signature = [
                selectedTrailID,
                trails.map(\.id).joined(separator: ",")
            ].joined(separator: "|")

            guard signature != lastSegmentAnnotationSignature else {
                return cachedSegmentAnnotations
            }

            lastSegmentAnnotationSignature = signature
            cachedSegmentAnnotations = selectedTrail.trailSegments(allTrails: trails)
                .compactMap { segment -> TrailSegmentAnnotation? in
                    guard let midpoint = segment.midpoint else {
                        return nil
                    }

                    return TrailSegmentAnnotation(
                        coordinate: midpoint,
                        title: segment.formattedDistanceLabel,
                        distanceKm: segment.distanceKm,
                        trailID: selectedTrail.id
                    )
                }

            return cachedSegmentAnnotations
        }

        func refreshTrailSegmentLabelVisibility(on mapView: MKMapView) {
            let shouldShowLabels = mapView.region.span.latitudeDelta <= AppConfig.trailSegmentLabelsMaxLatitudeDelta

            for annotation in mapView.annotations {
                guard let segmentAnnotation = annotation as? TrailSegmentAnnotation,
                      let view = mapView.view(for: segmentAnnotation) as? TrailSegmentAnnotationView else {
                    continue
                }

                view.setVisibility(shouldShowLabels)
            }
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            syncAnnotations(on: mapView)
            let center = mapView.region.center
            DispatchQueue.main.async {
                self.parent.onRegionDidChange(center)
            }
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if let destinationAnnotation = annotation as? DestinationAnnotation {
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

            if let segmentAnnotation = annotation as? TrailSegmentAnnotation {
                let identifier = "TrailSegmentAnnotation"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? TrailSegmentAnnotationView ?? TrailSegmentAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                view.annotation = annotation
                view.configure(title: segmentAnnotation.title ?? "", distanceKm: segmentAnnotation.distanceKm)
                return view
            }

            return nil
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

final class TrailSegmentAnnotation: NSObject, MKAnnotation {
    let title: String?
    let distanceKm: Double
    let trailID: String
    dynamic var coordinate: CLLocationCoordinate2D

    init(coordinate: CLLocationCoordinate2D, title: String, distanceKm: Double, trailID: String) {
        self.coordinate = coordinate
        self.title = title
        self.distanceKm = distanceKm
        self.trailID = trailID
    }

    var signatureComponent: String {
        "\(trailID):\(title ?? ""):\(String(format: "%.4f", coordinate.latitude)):\(String(format: "%.4f", coordinate.longitude))"
    }
}

final class TrailSegmentAnnotationView: MKAnnotationView {
    private let label = PaddingLabel()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        canShowCallout = false
        collisionMode = .rectangle
        centerOffset = CGPoint(x: 0, y: -2)

        label.font = .systemFont(ofSize: 11, weight: .bold)
        label.textColor = UIColor(red: 0.08, green: 0.17, blue: 0.23, alpha: 1)
        label.backgroundColor = UIColor.white.withAlphaComponent(0.92)
        label.layer.cornerRadius = 10
        label.layer.masksToBounds = true
        label.layer.borderColor = UIColor.black.withAlphaComponent(0.08).cgColor
        label.layer.borderWidth = 1
        addSubview(label)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(title: String, distanceKm: Double) {
        label.text = title
        label.sizeToFit()
        label.frame = label.bounds
        frame = label.bounds
        displayPriority = MKFeatureDisplayPriority(rawValue: Float(min(1000, 200 + distanceKm * 280)))
    }

    func setVisibility(_ isVisible: Bool) {
        isHidden = !isVisible
    }
}

final class PaddingLabel: UILabel {
    override func textRect(forBounds bounds: CGRect, limitedToNumberOfLines numberOfLines: Int) -> CGRect {
        let insetBounds = bounds.inset(by: UIEdgeInsets(top: -4, left: -8, bottom: -4, right: -8))
        let textRect = super.textRect(forBounds: insetBounds, limitedToNumberOfLines: numberOfLines)
        return textRect.inset(by: UIEdgeInsets(top: -4, left: -8, bottom: -4, right: -8))
    }

    override func drawText(in rect: CGRect) {
        super.drawText(in: rect.inset(by: UIEdgeInsets(top: 4, left: 8, bottom: 4, right: 8)))
    }

    override var intrinsicContentSize: CGSize {
        let size = super.intrinsicContentSize
        return CGSize(width: size.width + 16, height: size.height + 8)
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