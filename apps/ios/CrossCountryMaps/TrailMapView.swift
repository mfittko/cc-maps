import MapKit
import SwiftUI

struct TrailMapView: UIViewRepresentable {
    let destinations: [Destination]
    let selectedDestinationID: String
    let nearbyPreviewDestinationIDs: Set<String>
    let primaryTrails: [TrailFeature]
    let previewTrails: [TrailFeature]
    let routePlan: RoutePlanState
    let isInPlanningMode: Bool
    let selectedTrailID: String?
    let selectedTrailSegment: TrailSegment?
    let fitRequestID: Int
    let currentLocation: CLLocationCoordinate2D?
    let locationFocusRequestID: Int
    let isAutoFollowEnabled: Bool
    let onDestinationTap: (String) -> Void
    let onTrailTap: (TrailInspectionSelection?) -> Void
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
        context.coordinator.syncDirectionAnnotations(on: mapView)

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
        var lastBaseOverlaySignature = ""
        var lastEmphasisOverlaySignature = ""
        var lastSegmentAnnotationSignature = ""
        var lastDirectionSignature = ""
        var pendingPlanningWork: DispatchWorkItem?
        var lastFitRequestID = 0
        var lastLocationFocusRequestID = 0
        var lastAutoFollowEnabled = false
        var cachedSegmentAnnotations: [TrailSegmentAnnotation] = []
        var lastPlannedSectionsSignature = ""
        var cachedPlannedSections: [PlanningSection] = []

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
                "planning:\(parent.isInPlanningMode ? "1" : "0")",
                "anchors:\(parent.routePlan.anchorEdgeIDs.joined(separator: ","))",
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
            let shouldDim = !parent.routePlan.isEmpty && !parent.isInPlanningMode
            let baseSignature = [
                parent.primaryTrails.map(\.id).joined(separator: ","),
                parent.previewTrails.map(\.id).joined(separator: ","),
                "dim:\(shouldDim ? "1" : "0")"
            ].joined(separator: "|")

            if baseSignature != lastBaseOverlaySignature {
                lastBaseOverlaySignature = baseSignature
                let existingTrailOverlays = mapView.overlays.filter { $0 is TrailOverlay }
                mapView.removeOverlays(existingTrailOverlays)

                let trailOverlays = buildTrailOverlays(trails: parent.previewTrails, isPreview: true) +
                    buildTrailOverlays(trails: parent.primaryTrails, isPreview: false, isDimmed: shouldDim)

                mapView.addOverlays(trailOverlays, level: .aboveRoads)
            }

            let segmentSig = parent.selectedTrailSegment.map {
                "\($0.startDistanceKm)-\($0.endDistanceKm)"
            } ?? ""
            let emphasisSignature = [
                "planning:\(parent.isInPlanningMode ? "1" : "0")",
                "selected:\(parent.selectedTrailID ?? "")",
                "segment:\(segmentSig)",
                "anchors:\(parent.routePlan.anchorEdgeIDs.joined(separator: ","))",
                "trails:\((parent.primaryTrails + parent.previewTrails).map(\.id).joined(separator: ","))"
            ].joined(separator: "|")

            guard emphasisSignature != lastEmphasisOverlaySignature else {
                return
            }

            lastEmphasisOverlaySignature = emphasisSignature
            let existingEmphasisOverlays = mapView.overlays.filter {
                $0 is SelectedTrailOverlay || $0 is PlannedSectionOverlay
            }
            mapView.removeOverlays(existingEmphasisOverlays)

            let displayedTrails = parent.primaryTrails + parent.previewTrails
            let selectedTrailOverlays = buildSelectedTrailOverlays(trails: displayedTrails)
            let plannedSectionOverlays = buildPlannedSectionOverlays(trails: displayedTrails)

            mapView.addOverlays(selectedTrailOverlays + plannedSectionOverlays, level: .aboveLabels)
        }

        func syncDirectionAnnotations(on mapView: MKMapView) {
            let signature = parent.routePlan.anchorEdgeIDs.joined(separator: ",")

            guard signature != lastDirectionSignature else {
                return
            }

            lastDirectionSignature = signature

            let existingDirections = mapView.annotations.filter { $0 is RouteDirectionAnnotation }
            mapView.removeAnnotations(existingDirections)

            let directionAnnotations = buildRouteDirectionAnnotations(trails: parent.primaryTrails + parent.previewTrails)
            mapView.addAnnotations(directionAnnotations)
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

            if let hitView = mapView.hitTest(tapPoint, with: nil),
               let annotationView = annotationView(containing: hitView),
               annotationView.annotation is DestinationAnnotation {
                return
            }

            let tappedCoordinate = mapView.convert(tapPoint, toCoordinateFrom: mapView)
            let displayedTrails = parent.primaryTrails + parent.previewTrails
            let isInPlanningMode = parent.isInPlanningMode
            let planningTrails = displayedTrails
            let tapCandidateTrails = displayedTrails

            // Fast path: trail match + segment resolution (no graph needed)
            let quickSelection = GeoMath.inspectableTrailSelection(
                reference: tappedCoordinate,
                trails: tapCandidateTrails,
                trailMatchThresholdKm: AppConfig.trailTapThresholdKm,
                includePlanningAnchor: false
            )

            if isInPlanningMode {
                // Cancel any previous pending planning computation
                pendingPlanningWork?.cancel()

                let onTrailTap = parent.onTrailTap
                var scheduledWorkItem: DispatchWorkItem?
                let workItem = DispatchWorkItem { [weak self] in
                    guard let self,
                          let scheduledWorkItem,
                          !scheduledWorkItem.isCancelled,
                          self.pendingPlanningWork === scheduledWorkItem else {
                        return
                    }

                    let anchorEdgeID = quickSelection?.trailID != nil
                        ? GeoMath.planningAnchorEdgeIDForTap(
                            trailID: quickSelection!.trailID,
                            reference: tappedCoordinate,
                            allTrails: planningTrails
                        )
                        : nil

                    guard !scheduledWorkItem.isCancelled,
                          self.pendingPlanningWork === scheduledWorkItem else {
                        return
                    }

                    let selection = anchorEdgeID != nil
                        ? TrailInspectionSelection(
                            trailID: quickSelection!.trailID,
                            anchorEdgeID: anchorEdgeID,
                            segment: quickSelection?.segment
                        )
                        : quickSelection

                    DispatchQueue.main.async {
                        onTrailTap(selection)
                    }
                }
                scheduledWorkItem = workItem
                pendingPlanningWork = workItem
                DispatchQueue.global(qos: .userInitiated).async(execute: workItem)
            } else {
                DispatchQueue.main.async {
                    self.parent.onTrailTap(quickSelection)
                }
            }
        }

        func buildTrailOverlays(trails: [TrailFeature], isPreview: Bool, isDimmed: Bool = false) -> [TrailOverlay] {
            trails.flatMap { trail in
                trail.coordinateSets.compactMap { coordinates -> TrailOverlay? in
                    guard coordinates.count >= 2 else {
                        return nil
                    }

                    let overlay = TrailOverlay(coordinates: coordinates, count: coordinates.count)
                    overlay.trailID = trail.id
                    overlay.isPreview = isPreview
                    overlay.isDimmed = isDimmed
                    overlay.groomingColor = UIColor(hex: trail.groomingColorHex)
                    return overlay
                }
            }
        }

        func buildSelectedTrailOverlays(trails: [TrailFeature]) -> [SelectedTrailOverlay] {
            guard !parent.isInPlanningMode,
                  let selectedTrailID = parent.selectedTrailID,
                  let selectedTrail = trails.first(where: { $0.id == selectedTrailID }) else {
                return []
            }

            let hasRoute = !parent.routePlan.isEmpty

            // If a specific segment is selected, highlight only that segment
            if let segment = parent.selectedTrailSegment {
                let coordinates = GeoMath.extractCoordinatesForSegment(
                    coordinateSets: selectedTrail.coordinateSets,
                    startKm: segment.startDistanceKm,
                    endKm: segment.endDistanceKm
                )
                guard coordinates.count >= 2 else {
                    return []
                }
                let overlay = SelectedTrailOverlay(coordinates: coordinates, count: coordinates.count)
                overlay.trailID = selectedTrail.id
                overlay.groomingColor = UIColor(hex: selectedTrail.groomingColorHex)
                overlay.isOverPlannedRoute = hasRoute
                return [overlay]
            }

            return selectedTrail.coordinateSets.compactMap { coordinates in
                guard coordinates.count >= 2 else {
                    return nil
                }

                let overlay = SelectedTrailOverlay(coordinates: coordinates, count: coordinates.count)
                overlay.trailID = selectedTrail.id
                overlay.groomingColor = UIColor(hex: selectedTrail.groomingColorHex)
                overlay.isOverPlannedRoute = hasRoute
                return overlay
            }
        }

        func buildPlannedSectionOverlays(trails: [TrailFeature]) -> [PlannedSectionOverlay] {
            guard !parent.routePlan.isEmpty else {
                return []
            }

            let plannedSections = plannedSections(for: trails)

            return plannedSections.enumerated().compactMap { index, section in
                guard section.coordinates.count >= 2 else {
                    return nil
                }

                let overlay = PlannedSectionOverlay(coordinates: section.coordinates, count: section.coordinates.count)
                overlay.trailID = section.trailID
                overlay.edgeID = section.edgeID
                overlay.sequenceIndex = index + 1
                return overlay
            }
        }

        func buildRouteDirectionAnnotations(trails: [TrailFeature]) -> [RouteDirectionAnnotation] {
            guard !parent.routePlan.isEmpty else {
                return []
            }

            let plannedSections = plannedSections(for: trails)
            let spacingKm = 0.35

            return plannedSections.flatMap { section -> [RouteDirectionAnnotation] in
                let coordinates = section.coordinates
                guard coordinates.count >= 2 else { return [] }

                var annotations: [RouteDirectionAnnotation] = []
                var traversedKm = 0.0
                var nextArrowKm = spacingKm

                for i in 1..<coordinates.count {
                    let prev = coordinates[i - 1]
                    let curr = coordinates[i]
                    let segmentKm = GeoMath.distanceKilometers(from: prev, to: curr)

                    while nextArrowKm <= traversedKm + segmentKm {
                        let distIntoSegment = nextArrowKm - traversedKm
                        let ratio = segmentKm > 0 ? distIntoSegment / segmentKm : 0
                        let lat = prev.latitude + (curr.latitude - prev.latitude) * ratio
                        let lng = prev.longitude + (curr.longitude - prev.longitude) * ratio
                        let bearing = GeoMath.bearing(from: prev, to: curr)

                        annotations.append(RouteDirectionAnnotation(
                            coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                            bearing: bearing
                        ))
                        nextArrowKm += spacingKm
                    }

                    traversedKm += segmentKm
                }

                return annotations
            }
        }

        func segmentAnnotations(for trails: [TrailFeature], shouldShowLabels: Bool) -> [TrailSegmentAnnotation] {
            let plannedSections = parent.isInPlanningMode
                ? plannedSections(for: parent.primaryTrails + parent.previewTrails)
                : []

            // Planned route labels are always visible; other labels respect zoom level
            guard shouldShowLabels || !plannedSections.isEmpty else {
                cachedSegmentAnnotations = []
                lastSegmentAnnotationSignature = ""
                return []
            }

            let signature = [
                parent.selectedTrailID ?? "",
                parent.isInPlanningMode ? "1" : "0",
                parent.routePlan.anchorEdgeIDs.joined(separator: ","),
                trails.map(\.id).joined(separator: ","),
                shouldShowLabels ? "labels" : "no-labels"
            ].joined(separator: "|")

            guard signature != lastSegmentAnnotationSignature else {
                return cachedSegmentAnnotations
            }

            lastSegmentAnnotationSignature = signature

            if !plannedSections.isEmpty {
                cachedSegmentAnnotations = plannedSections.enumerated().compactMap { index, section in
                    guard let midpoint = section.midpoint else {
                        return nil
                    }

                    return TrailSegmentAnnotation(
                        coordinate: midpoint,
                        title: "\(index + 1) · \(section.formattedDistanceLabel)",
                        distanceKm: section.distanceKm,
                        trailID: section.trailID,
                        kind: .plannedRoute
                    )
                }
                return cachedSegmentAnnotations
            }

            guard let selectedTrailID = parent.selectedTrailID,
                  let selectedTrail = trails.first(where: { $0.id == selectedTrailID }) else {
                cachedSegmentAnnotations = []
                return []
            }

            cachedSegmentAnnotations = selectedTrail.trailSegments(allTrails: trails)
                .compactMap { segment -> TrailSegmentAnnotation? in
                    guard let midpoint = segment.midpoint else {
                        return nil
                    }

                    return TrailSegmentAnnotation(
                        coordinate: midpoint,
                        title: segment.formattedDistanceLabel,
                        distanceKm: segment.distanceKm,
                        trailID: selectedTrail.id,
                        kind: .trailDetail
                    )
                }

            return cachedSegmentAnnotations
        }

        func plannedSections(for trails: [TrailFeature]) -> [PlanningSection] {
            let signature = parent.routePlan.anchorEdgeIDs.joined(separator: ",") + "||" + trails.map(\.id).joined(separator: ",")

            guard signature != lastPlannedSectionsSignature else {
                return cachedPlannedSections
            }

            lastPlannedSectionsSignature = signature
            cachedPlannedSections = GeoMath.planningSections(for: parent.routePlan.anchorEdgeIDs, allTrails: trails)
            return cachedPlannedSections
        }

        private func annotationView(containing view: UIView) -> MKAnnotationView? {
            var currentView: UIView? = view

            while let candidate = currentView {
                if let annotationView = candidate as? MKAnnotationView {
                    return annotationView
                }

                currentView = candidate.superview
            }

            return nil
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
                view.configure(
                    title: segmentAnnotation.title ?? "",
                    distanceKm: segmentAnnotation.distanceKm,
                    kind: segmentAnnotation.kind
                )
                return view
            }

            if let directionAnnotation = annotation as? RouteDirectionAnnotation {
                let identifier = "RouteDirectionAnnotation"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? RouteDirectionAnnotationView ?? RouteDirectionAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                view.annotation = annotation
                view.configure(bearing: directionAnnotation.bearing)
                view.displayPriority = .defaultLow
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

            if overlay is PlannedSectionOverlay {
                renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.96)
                renderer.lineWidth = 9
            } else if let selectedOverlay = overlay as? SelectedTrailOverlay, selectedOverlay.isOverPlannedRoute {
                renderer.strokeColor = UIColor(red: 0.0, green: 0.1, blue: 0.35, alpha: 1.0)
                renderer.lineWidth = 13
            } else if overlay is SelectedTrailOverlay {
                renderer.strokeColor = baseColor.withAlphaComponent(0.98)
                renderer.lineWidth = 8
            } else if trailOverlay.isPreview || trailOverlay.isDimmed {
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

class TrailOverlay: MKPolyline {
    var trailID = ""
    var isPreview = false
    var isDimmed = false
    var groomingColor: UIColor?
}

class SelectedTrailOverlay: TrailOverlay {
    var isOverPlannedRoute = false
}

class PlannedSectionOverlay: TrailOverlay {
    var edgeID = ""
    var sequenceIndex = 0
}

final class RouteDirectionAnnotation: NSObject, MKAnnotation {
    dynamic var coordinate: CLLocationCoordinate2D
    let bearing: Double

    init(coordinate: CLLocationCoordinate2D, bearing: Double) {
        self.coordinate = coordinate
        self.bearing = bearing
    }
}

final class RouteDirectionAnnotationView: MKAnnotationView {
    private let arrowLayer = CAShapeLayer()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        canShowCallout = false
        isUserInteractionEnabled = false
        let size: CGFloat = 14
        frame = CGRect(x: 0, y: 0, width: size, height: size)
        centerOffset = .zero
        backgroundColor = .clear

        // Small filled triangle pointing right (east), will be rotated to bearing
        let path = UIBezierPath()
        path.move(to: CGPoint(x: 2, y: 3))
        path.addLine(to: CGPoint(x: 11, y: 7))
        path.addLine(to: CGPoint(x: 2, y: 11))
        path.close()

        arrowLayer.path = path.cgPath
        arrowLayer.fillColor = UIColor(red: 0.07, green: 0.25, blue: 0.45, alpha: 1.0).cgColor
        arrowLayer.strokeColor = UIColor.white.cgColor
        arrowLayer.lineWidth = 1.5
        arrowLayer.lineJoin = .round
        arrowLayer.frame = bounds
        layer.addSublayer(arrowLayer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(bearing: Double) {
        // Triangle points east (0°). Bearing is clockwise from north.
        // Screen rotation: north=up=-90° in screen coords, so rotate by (bearing - 90°)
        let radians = (bearing - 90) * .pi / 180
        arrowLayer.setAffineTransform(CGAffineTransform(rotationAngle: radians))
    }
}

enum SegmentAnnotationKind {
    case trailDetail
    case plannedRoute
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
    let kind: SegmentAnnotationKind
    dynamic var coordinate: CLLocationCoordinate2D

    init(coordinate: CLLocationCoordinate2D, title: String, distanceKm: Double, trailID: String, kind: SegmentAnnotationKind) {
        self.coordinate = coordinate
        self.title = title
        self.distanceKm = distanceKm
        self.trailID = trailID
        self.kind = kind
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
        isUserInteractionEnabled = false
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

    func configure(title: String, distanceKm: Double, kind: SegmentAnnotationKind) {
        label.text = title
        switch kind {
        case .trailDetail:
            label.textColor = UIColor(red: 0.08, green: 0.17, blue: 0.23, alpha: 1)
            label.backgroundColor = UIColor.white.withAlphaComponent(0.92)
        case .plannedRoute:
            label.textColor = .white
            label.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.92)
        }
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