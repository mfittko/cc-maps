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
    let selectedPlannedSectionEdgeID: String?
    let routeDisplaySections: [PlanningSection]
    let routePresentationRefreshID: Int
    let fitRequestID: Int
    let restoredMapRegion: PersistedMapRegion?
    let mapRegionRestoreRequestID: Int
    let focusedPlannedSectionCoordinates: [CLLocationCoordinate2D]
    let plannedSectionFocusRequestID: Int
    let currentLocation: CLLocationCoordinate2D?
    let locationFocusRequestID: Int
    let isAutoFollowEnabled: Bool
    let onDestinationTap: (String) -> Void
    let onTrailTap: (TrailInspectionSelection?) -> Void
    let onRegionDidChange: (MKCoordinateRegion) -> Void

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
            restoredMapRegion?.coordinateRegion ?? MKCoordinateRegion(
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
        context.coordinator.syncRoutePresentation(on: mapView)
        context.coordinator.syncRouteSelectionStyling(on: mapView)

        if context.coordinator.lastMapRegionRestoreRequestID != mapRegionRestoreRequestID,
           let restoredMapRegion {
            context.coordinator.lastMapRegionRestoreRequestID = mapRegionRestoreRequestID
            context.coordinator.shouldSkipNextFitRequest = true
            mapView.setRegion(restoredMapRegion.coordinateRegion, animated: false)
        }

        if context.coordinator.lastPlannedSectionFocusRequestID != plannedSectionFocusRequestID,
           focusedPlannedSectionCoordinates.count >= 2 {
            context.coordinator.lastPlannedSectionFocusRequestID = plannedSectionFocusRequestID
            context.coordinator.focusMap(on: mapView, coordinates: focusedPlannedSectionCoordinates)
        }

        if context.coordinator.lastFitRequestID != fitRequestID {
            context.coordinator.lastFitRequestID = fitRequestID

            if context.coordinator.shouldSkipNextFitRequest {
                context.coordinator.shouldSkipNextFitRequest = false
            } else {
                context.coordinator.fitMapToVisibleContent(on: mapView)
            }
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
        var lastRoutePresentationRefreshID = 0
        var lastSelectedPlannedSectionEdgeID: String?
        var pendingPlanningWork: DispatchWorkItem?
        var lastFitRequestID = 0
        var lastMapRegionRestoreRequestID = 0
        var lastPlannedSectionFocusRequestID = 0
        var lastLocationFocusRequestID = 0
        var lastAutoFollowEnabled = false
        var shouldSkipNextFitRequest = false
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
                "segment-trail:\(parent.selectedTrailID ?? "")",
                "segment-visible:\(shouldShowSegmentLabels ? "1" : "0")"
            ].joined(separator: "|")

            guard signature != lastAnnotationSignature else {
                return
            }

            lastAnnotationSignature = signature
            let existingAnnotations = mapView.annotations.filter {
                if $0 is DestinationAnnotation {
                    return true
                }

                guard let segmentAnnotation = $0 as? TrailSegmentAnnotation else {
                    return false
                }

                return segmentAnnotation.kind == .trailDetail
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
                let existingTrailOverlays = mapView.overlays.filter {
                    guard let trailOverlay = $0 as? TrailOverlay else {
                        return false
                    }

                    return type(of: trailOverlay) == TrailOverlay.self
                }
                mapView.removeOverlays(existingTrailOverlays)

                let trailOverlays = buildTrailOverlays(trails: parent.previewTrails, isPreview: true) +
                    buildTrailOverlays(trails: parent.primaryTrails, isPreview: false, isDimmed: shouldDim)

                mapView.addOverlays(trailOverlays, level: .aboveRoads)
            }

            let segmentSig = parent.selectedTrailSegment.map {
                "\($0.startDistanceKm)-\($0.endDistanceKm)"
            } ?? ""
            let emphasisSignature = [
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
                $0 is SelectedTrailOverlay
            }
            mapView.removeOverlays(existingEmphasisOverlays)

            let displayedTrails = parent.primaryTrails + parent.previewTrails
            let selectedTrailOverlays = buildSelectedTrailOverlays(trails: displayedTrails)

            mapView.addOverlays(selectedTrailOverlays, level: .aboveLabels)
        }

        func syncRoutePresentation(on mapView: MKMapView) {
            guard lastRoutePresentationRefreshID != parent.routePresentationRefreshID else {
                return
            }

            lastRoutePresentationRefreshID = parent.routePresentationRefreshID

            let existingRouteOverlays = mapView.overlays.filter { $0 is RouteSectionOverlay }
            mapView.removeOverlays(existingRouteOverlays)

            let existingRouteAnnotations = mapView.annotations.filter {
                if $0 is RouteDirectionAnnotation {
                    return true
                }

                guard let segmentAnnotation = $0 as? TrailSegmentAnnotation else {
                    return false
                }

                return segmentAnnotation.kind == .plannedRoute
            }
            mapView.removeAnnotations(existingRouteAnnotations)

            let plannedSections = parent.routeDisplaySections

            guard !plannedSections.isEmpty else {
                lastSelectedPlannedSectionEdgeID = parent.selectedPlannedSectionEdgeID
                return
            }

            mapView.addOverlays(buildRouteSectionOverlays(plannedSections: plannedSections), level: .aboveLabels)
            mapView.addAnnotations(buildRouteSectionAnnotations(plannedSections: plannedSections))
            mapView.addAnnotations(buildRouteDirectionAnnotations(plannedSections: plannedSections))
            syncRouteSelectionStyling(on: mapView)
        }

        func syncRouteSelectionStyling(on mapView: MKMapView) {
            guard lastSelectedPlannedSectionEdgeID != parent.selectedPlannedSectionEdgeID else {
                return
            }

            lastSelectedPlannedSectionEdgeID = parent.selectedPlannedSectionEdgeID

            for overlay in mapView.overlays {
                guard let routeOverlay = overlay as? RouteSectionOverlay else {
                    continue
                }

                let shouldBeSelected = routeOverlay.edgeID == parent.selectedPlannedSectionEdgeID
                guard routeOverlay.isSelectedRouteSection != shouldBeSelected else {
                    continue
                }

                routeOverlay.isSelectedRouteSection = shouldBeSelected

                if let renderer = mapView.renderer(for: routeOverlay) as? MKOverlayPathRenderer {
                    renderer.invalidatePath()
                    renderer.setNeedsDisplay()
                }
            }
        }

        func fitMapToVisibleContent(on mapView: MKMapView) {
            let trails = parent.primaryTrails + parent.previewTrails
            let plannedSections = plannedSections(for: trails)
            let edgePadding = fitEdgePadding

            if let routeMapRect = mapRect(for: plannedSections.flatMap(\.coordinates)), !routeMapRect.isNull {
                mapView.setVisibleMapRect(
                    routeMapRect,
                    edgePadding: edgePadding,
                    animated: true
                )
                return
            }

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
                edgePadding: edgePadding,
                animated: true
            )
        }

        private var fitEdgePadding: UIEdgeInsets {
            parent.isInPlanningMode
                ? UIEdgeInsets(top: 180, left: 24, bottom: 320, right: 24)
                : UIEdgeInsets(top: 180, left: 24, bottom: 150, right: 24)
        }

        func focusMap(on mapView: MKMapView, coordinates: [CLLocationCoordinate2D]) {
            guard let mapRect = mapRect(for: coordinates), !mapRect.isNull else {
                return
            }

            mapView.setVisibleMapRect(
                mapRect,
                edgePadding: UIEdgeInsets(top: 150, left: 28, bottom: 300, right: 28),
                animated: true
            )
        }

        private func mapRect(for coordinates: [CLLocationCoordinate2D]) -> MKMapRect? {
            guard let firstCoordinate = coordinates.first else {
                return nil
            }

            return coordinates.dropFirst().reduce(
                MKMapRect(origin: MKMapPoint(firstCoordinate), size: MKMapSize(width: 0, height: 0))
            ) { rect, coordinate in
                rect.union(MKMapRect(origin: MKMapPoint(coordinate), size: MKMapSize(width: 0, height: 0)))
            }
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

            let plannedSections = plannedSections(for: trails)
            let selectedTrailOverlapsPlannedRoute = selectedTrailOverlapsPlannedRoute(
                trailID: selectedTrailID,
                segment: parent.selectedTrailSegment,
                plannedSections: plannedSections
            )

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
                overlay.isOverPlannedRoute = selectedTrailOverlapsPlannedRoute
                return [overlay]
            }

            return selectedTrail.coordinateSets.compactMap { coordinates in
                guard coordinates.count >= 2 else {
                    return nil
                }

                let overlay = SelectedTrailOverlay(coordinates: coordinates, count: coordinates.count)
                overlay.trailID = selectedTrail.id
                overlay.groomingColor = UIColor(hex: selectedTrail.groomingColorHex)
                overlay.isOverPlannedRoute = selectedTrailOverlapsPlannedRoute
                return overlay
            }
        }

        private func selectedTrailOverlapsPlannedRoute(
            trailID: String,
            segment: TrailSegment?,
            plannedSections: [PlanningSection]
        ) -> Bool {
            let matchingSections = plannedSections.filter { $0.trailID == trailID }

            guard !matchingSections.isEmpty else {
                return false
            }

            guard let segment else {
                return true
            }

            return matchingSections.contains { section in
                segmentRangesOverlap(
                    startA: segment.startDistanceKm,
                    endA: segment.endDistanceKm,
                    startB: section.startDistanceKm,
                    endB: section.endDistanceKm
                )
            }
        }

        private func segmentRangesOverlap(
            startA: Double,
            endA: Double,
            startB: Double,
            endB: Double,
            tolerance: Double = 0.0001
        ) -> Bool {
            max(startA, startB) <= min(endA, endB) + tolerance
        }

        func buildRouteSectionOverlays(plannedSections: [PlanningSection]) -> [RouteSectionOverlay] {
            return plannedSections.enumerated().compactMap { index, section in
                guard section.coordinates.count >= 2 else {
                    return nil
                }

                let overlay = RouteSectionOverlay(coordinates: section.coordinates, count: section.coordinates.count)
                overlay.trailID = section.trailID
                overlay.edgeID = section.edgeID
                overlay.sequenceIndex = index + 1
                overlay.isSelectedRouteSection = section.edgeID == parent.selectedPlannedSectionEdgeID
                return overlay
            }
        }

        func buildRouteSectionAnnotations(plannedSections: [PlanningSection]) -> [TrailSegmentAnnotation] {
            return plannedSections.enumerated().compactMap { index, section in
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
        }

        func buildRouteDirectionAnnotations(plannedSections: [PlanningSection]) -> [RouteDirectionAnnotation] {
            guard !plannedSections.isEmpty else {
                return []
            }
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
            guard shouldShowLabels else {
                cachedSegmentAnnotations = []
                lastSegmentAnnotationSignature = ""
                return []
            }

            let signature = [
                parent.selectedTrailID ?? "",
                trails.map(\.id).joined(separator: ","),
                "labels"
            ].joined(separator: "|")

            guard signature != lastSegmentAnnotationSignature else {
                return cachedSegmentAnnotations
            }

            lastSegmentAnnotationSignature = signature

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

                let isVisible = segmentAnnotation.kind == .plannedRoute ? true : shouldShowLabels
                view.setVisibility(isVisible)
            }
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            syncAnnotations(on: mapView)
            let region = mapView.region
            DispatchQueue.main.async {
                self.parent.onRegionDidChange(region)
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
            let routeColor = UIColor(red: 0.13, green: 0.53, blue: 0.98, alpha: 0.96)
            let selectedRouteColor = UIColor(red: 0.03, green: 0.36, blue: 0.82, alpha: 1.0)

            if overlay is RouteSectionOverlay {
                let plannedOverlay = overlay as? RouteSectionOverlay
                renderer.strokeColor = plannedOverlay?.isSelectedRouteSection == true
                    ? selectedRouteColor
                    : routeColor
                renderer.lineWidth = plannedOverlay?.isSelectedRouteSection == true ? 10 : 9
            } else if let selectedOverlay = overlay as? SelectedTrailOverlay, selectedOverlay.isOverPlannedRoute {
                renderer.strokeColor = selectedRouteColor.withAlphaComponent(0.9)
                renderer.lineWidth = 10
            } else if overlay is SelectedTrailOverlay {
                renderer.strokeColor = baseColor.withAlphaComponent(0.98)
                renderer.lineWidth = 8
            } else if trailOverlay.isPreview || trailOverlay.isDimmed {
                renderer.strokeColor = baseColor.withAlphaComponent(0.45)
                renderer.lineWidth = 4
            } else {
                renderer.strokeColor = baseColor
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

class RouteSectionOverlay: TrailOverlay {
    var edgeID = ""
    var sequenceIndex = 0
    var isSelectedRouteSection = false
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
        label.textColor = .label
        label.backgroundColor = UIColor.secondarySystemGroupedBackground.withAlphaComponent(0.92)
        label.layer.cornerRadius = 10
        label.layer.masksToBounds = true
        label.layer.borderColor = UIColor.separator.cgColor
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
            label.textColor = .label
            label.backgroundColor = UIColor.secondarySystemGroupedBackground.withAlphaComponent(0.92)
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