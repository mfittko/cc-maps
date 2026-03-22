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
    let selectedRouteDetailSectionEdgeID: String?
    let selectedPlannedSectionEdgeID: String?
    let routeDisplaySections: [PlanningSection]
    let routePresentationRefreshID: Int
    let fitRequestID: Int
    let restoredMapRegion: PersistedMapRegion?
    let mapRegionRestoreRequestID: Int
    let focusedPlannedSectionCoordinates: [CLLocationCoordinate2D]
    let plannedSectionFocusRequestID: Int
    let currentLocation: CLLocationCoordinate2D?
    let currentLocationHeading: CLLocationDirection?
    let locationFocusRequestID: Int
    let locationFollowMode: LocationFollowMode
    let onDestinationTap: (String) -> Void
    let onTrailTap: (TrailInspectionSelection?) -> Void
    let onUserPanWhileLocationFollowing: () -> Void
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
        mapView.showsUserLocation = false
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
        context.coordinator.syncCurrentLocationPresentation(on: mapView)
        context.coordinator.syncAnnotations(on: mapView)
        context.coordinator.syncRoutePresentation(on: mapView)
        context.coordinator.syncOverlays(on: mapView)
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

        if context.coordinator.lastLocationFocusRequestID != locationFocusRequestID {
            context.coordinator.lastLocationFocusRequestID = locationFocusRequestID
            context.coordinator.updateTrackingMode(on: mapView)
        } else if context.coordinator.lastLocationFollowMode != locationFollowMode {
            context.coordinator.updateTrackingMode(on: mapView)
        }

        if context.coordinator.lastFitRequestID != fitRequestID {
            context.coordinator.lastFitRequestID = fitRequestID

            if context.coordinator.shouldSkipNextFitRequest {
                context.coordinator.shouldSkipNextFitRequest = false
            } else {
                context.coordinator.fitMapToVisibleContent(on: mapView)
            }
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
        var lastLocationFollowMode: LocationFollowMode = .off
        var shouldSkipNextFitRequest = false
        var cachedSegmentAnnotations: [TrailSegmentAnnotation] = []
        var lastPlannedSectionsSignature = ""
        var cachedPlannedSections: [PlanningSection] = []
        var lastCurrentLocationCoordinate: CLLocationCoordinate2D?
        var currentLocationBearing: CLLocationDirection?
        var currentLocationAnnotation: CurrentLocationAnnotation?
        var isRouteDirectionRotationActive = false
        var pendingRouteDirectionRestoreWork: DispatchWorkItem?
        var pendingHeadingFollowTransitionWork: DispatchWorkItem?
        var lastObservedMapHeading: CLLocationDirection?
        var wasUserPanGestureActive = false
        var shouldSuppressNextTrackingModeCameraReset = false

        init(_ parent: TrailMapView) {
            self.parent = parent
        }

        func syncCurrentLocationPresentation(on mapView: MKMapView) {
            let previousLocation = lastCurrentLocationCoordinate

            if let currentLocation = parent.currentLocation {
                if let heading = normalizedLocationDirection(parent.currentLocationHeading) {
                    currentLocationBearing = heading
                } else if let nextBearing = currentLocationMovementBearing(
                    from: previousLocation,
                    to: currentLocation,
                    minimumDistanceMeters: AppConfig.currentLocationHeadingMinimumDistanceMeters
                ) {
                    currentLocationBearing = nextBearing
                }

                lastCurrentLocationCoordinate = currentLocation
            } else {
                lastCurrentLocationCoordinate = nil
                currentLocationBearing = nil
            }

            if let currentLocation = parent.currentLocation {
                let annotation = currentLocationAnnotation ?? CurrentLocationAnnotation(coordinate: currentLocation)

                if currentLocationAnnotation == nil {
                    currentLocationAnnotation = annotation
                    mapView.addAnnotation(annotation)
                } else {
                    annotation.coordinate = currentLocation
                }
            } else if let annotation = currentLocationAnnotation {
                mapView.removeAnnotation(annotation)
                currentLocationAnnotation = nil
            }

            refreshCurrentLocationAppearance(on: mapView)

            switch parent.locationFollowMode {
            case .off:
                break
            case .follow:
                if let currentLocation = parent.currentLocation,
                   coordinatesDiffer(previousLocation, currentLocation) {
                    centerMapOnCurrentLocation(
                        currentLocation,
                        on: mapView,
                        enforceNavigationZoom: false
                    )
                }
            case .followWithHeading:
                if let currentLocation = parent.currentLocation {
                    followCurrentLocationWithHeading(
                        currentLocation,
                        bearing: currentLocationBearing,
                        on: mapView,
                        animated: coordinatesDiffer(previousLocation, currentLocation),
                        enforceNavigationZoom: false
                    )
                }
            }
        }

        func refreshCurrentLocationAppearance(on mapView: MKMapView) {
            guard let annotation = currentLocationAnnotation,
                  let currentLocationView = mapView.view(for: annotation) as? CurrentLocationAnnotationView else {
                return
            }

            currentLocationView.configure(
                bearing: currentLocationDisplayBearing(
                    locationBearing: currentLocationBearing,
                    mapCameraHeading: mapView.camera.heading
                )
            )
            bringCurrentLocationToFront(on: mapView)
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
            let previousMode = lastLocationFollowMode
            lastLocationFollowMode = parent.locationFollowMode
            pendingHeadingFollowTransitionWork?.cancel()
            pendingHeadingFollowTransitionWork = nil

            switch parent.locationFollowMode {
            case .off:
                if shouldSuppressNextTrackingModeCameraReset {
                    shouldSuppressNextTrackingModeCameraReset = false
                    return
                }

                if previousMode == .followWithHeading {
                    resetMapHeading(on: mapView)
                }
            case .follow:
                if previousMode == .followWithHeading {
                    resetMapHeading(on: mapView)
                }
                if let currentLocation = parent.currentLocation {
                    centerMapOnCurrentLocation(
                        currentLocation,
                        on: mapView,
                        enforceNavigationZoom: true
                    )
                }
            case .followWithHeading:
                if let currentLocation = parent.currentLocation {
                    transitionIntoHeadingFollowIfNeeded(
                        currentLocation,
                        bearing: currentLocationBearing,
                        previousMode: previousMode,
                        on: mapView
                    )
                }
            }
        }

        private func transitionIntoHeadingFollowIfNeeded(
            _ currentLocation: CLLocationCoordinate2D,
            bearing: CLLocationDirection?,
            previousMode: LocationFollowMode,
            on mapView: MKMapView
        ) {
            let targetDistance = AppConfig.currentLocationNavigationCameraDistanceMeters
            let currentDistance = mapView.camera.centerCoordinateDistance

            guard previousMode != .followWithHeading,
                  currentDistance - targetDistance >= AppConfig.currentLocationHeadingFollowEntryMinimumDistanceDeltaMeters else {
                followCurrentLocationWithHeading(
                    currentLocation,
                    bearing: bearing,
                    on: mapView,
                    animated: true,
                    enforceNavigationZoom: true
                )
                return
            }

            let intermediateDistance = max(targetDistance, (currentDistance + targetDistance) / 2)
            let zoomCamera = mapView.camera
            zoomCamera.centerCoordinate = currentLocation
            zoomCamera.centerCoordinateDistance = intermediateDistance
            mapView.setCamera(zoomCamera, animated: true)

            var scheduledWorkItem: DispatchWorkItem?
            let workItem = DispatchWorkItem { [weak self, weak mapView] in
                guard let self,
                      let mapView,
                      let scheduledWorkItem,
                      !scheduledWorkItem.isCancelled else {
                    return
                }

                self.followCurrentLocationWithHeading(
                    currentLocation,
                    bearing: bearing,
                    on: mapView,
                    animated: true,
                    enforceNavigationZoom: true
                )
                self.pendingHeadingFollowTransitionWork = nil
            }

            scheduledWorkItem = workItem
            pendingHeadingFollowTransitionWork = workItem
            DispatchQueue.main.asyncAfter(
                deadline: .now() + AppConfig.currentLocationHeadingFollowEntryAnimationDelaySeconds,
                execute: workItem
            )
        }

        private func centerMapOnCurrentLocation(
            _ currentLocation: CLLocationCoordinate2D,
            on mapView: MKMapView,
            enforceNavigationZoom: Bool
        ) {
            let camera = mapView.camera
            camera.centerCoordinate = currentLocation
            camera.heading = 0
            if enforceNavigationZoom {
                camera.centerCoordinateDistance = AppConfig.currentLocationNavigationCameraDistanceMeters
            }
            mapView.setCamera(camera, animated: true)
        }

        private func followCurrentLocationWithHeading(
            _ currentLocation: CLLocationCoordinate2D,
            bearing: CLLocationDirection?,
            on mapView: MKMapView,
            animated: Bool,
            enforceNavigationZoom: Bool
        ) {
            guard let normalizedBearing = normalizedLocationDirection(bearing) else {
                centerMapOnCurrentLocation(
                    currentLocation,
                    on: mapView,
                    enforceNavigationZoom: enforceNavigationZoom
                )
                return
            }

            let currentMapHeading = normalizedLocationDirection(mapView.camera.heading) ?? 0
            let headingDelta = MapHeading.angularDifference(from: currentMapHeading, to: normalizedBearing)
            let centerDistanceMeters = GeoMath.distanceKilometers(
                from: mapView.camera.centerCoordinate,
                to: currentLocation
            ) * 1000
            let cameraDistanceDelta = abs(
                mapView.camera.centerCoordinateDistance - AppConfig.currentLocationNavigationCameraDistanceMeters
            )

            guard
                headingDelta >= AppConfig.currentLocationHeadingCameraUpdateThresholdDegrees ||
                centerDistanceMeters >= AppConfig.currentLocationCameraRecenterThresholdMeters ||
                (enforceNavigationZoom && cameraDistanceDelta >= AppConfig.currentLocationNavigationCameraDistanceUpdateThresholdMeters)
            else {
                return
            }

            let camera = mapView.camera
            camera.centerCoordinate = currentLocation
            camera.heading = normalizedBearing
            if enforceNavigationZoom {
                camera.centerCoordinateDistance = AppConfig.currentLocationNavigationCameraDistanceMeters
            }
            mapView.setCamera(camera, animated: animated)
        }

        private func resetMapHeading(on mapView: MKMapView) {
            let camera = mapView.camera
            guard abs(camera.heading) > 0.1 else {
                return
            }

            camera.heading = 0
            mapView.setCamera(camera, animated: true)
        }

        private func coordinatesDiffer(_ lhs: CLLocationCoordinate2D?, _ rhs: CLLocationCoordinate2D?) -> Bool {
            switch (lhs, rhs) {
            case (.none, .some), (.some, .none):
                return true
            case let (.some(lhs), .some(rhs)):
                return lhs.latitude != rhs.latitude || lhs.longitude != rhs.longitude
            case (.none, .none):
                return false
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

                let borderOverlay = SelectedTrailOverlay(coordinates: coordinates, count: coordinates.count)
                borderOverlay.trailID = selectedTrail.id
                borderOverlay.groomingColor = UIColor(hex: selectedTrail.groomingColorHex)
                borderOverlay.isOverPlannedRoute = selectedTrailOverlapsPlannedRoute
                borderOverlay.isBorderUnderlay = true

                let overlay = SelectedTrailOverlay(coordinates: coordinates, count: coordinates.count)
                overlay.trailID = selectedTrail.id
                overlay.groomingColor = UIColor(hex: selectedTrail.groomingColorHex)
                overlay.isOverPlannedRoute = selectedTrailOverlapsPlannedRoute
                return [borderOverlay, overlay]
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

            let spacingKm = AppConfig.routeSectionArrowSpacingKm

            return plannedSections.flatMap { section -> [RouteDirectionAnnotation] in
                let coordinates = section.coordinates
                guard coordinates.count >= 2, spacingKm > 0 else {
                    return []
                }

                var annotations: [RouteDirectionAnnotation] = []
                var traversedKm = 0.0
                var nextArrowKm = spacingKm

                for index in 1..<coordinates.count {
                    let start = coordinates[index - 1]
                    let end = coordinates[index]
                    let segmentKm = GeoMath.distanceKilometers(from: start, to: end)

                    while nextArrowKm <= traversedKm + segmentKm {
                        let distanceIntoSegment = nextArrowKm - traversedKm
                        let ratio = segmentKm > 0 ? distanceIntoSegment / segmentKm : 0
                        let latitude = start.latitude + (end.latitude - start.latitude) * ratio
                        let longitude = start.longitude + (end.longitude - start.longitude) * ratio

                        annotations.append(
                            RouteDirectionAnnotation(
                                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                                bearing: GeoMath.bearing(from: start, to: end)
                            )
                        )
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

            guard parent.selectedRouteDetailSectionEdgeID == nil else {
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

                guard segmentAnnotation.kind == .trailDetail else {
                    continue
                }

                view.setVisibility(shouldShowLabels)
            }
        }

        func refreshRouteDirectionAnnotationAppearance(on mapView: MKMapView, isHidden: Bool) {
            for annotation in mapView.annotations {
                guard let directionAnnotation = annotation as? RouteDirectionAnnotation,
                      let directionView = mapView.view(for: directionAnnotation) as? RouteDirectionAnnotationView else {
                    continue
                }

                directionView.configure(
                    bearing: routeDirectionDisplayBearing(
                        routeBearing: directionAnnotation.bearing,
                        mapCameraHeading: mapView.camera.heading
                    ),
                    isHidden: isHidden
                )
            }
        }

        private func beginRouteDirectionRotation(on mapView: MKMapView) {
            pendingRouteDirectionRestoreWork?.cancel()
            pendingRouteDirectionRestoreWork = nil

            guard !isRouteDirectionRotationActive else {
                return
            }

            isRouteDirectionRotationActive = true
            refreshRouteDirectionAnnotationAppearance(on: mapView, isHidden: true)
        }

        private func scheduleRouteDirectionRotationRestore(on mapView: MKMapView) {
            guard isRouteDirectionRotationActive else {
                return
            }

            pendingRouteDirectionRestoreWork?.cancel()

            let workItem = DispatchWorkItem { [weak self, weak mapView] in
                guard let self, let mapView else {
                    return
                }

                self.isRouteDirectionRotationActive = false
                self.refreshRouteDirectionAnnotationAppearance(on: mapView, isHidden: false)
                self.pendingRouteDirectionRestoreWork = nil
            }

            pendingRouteDirectionRestoreWork = workItem
            DispatchQueue.main.asyncAfter(
                deadline: .now() + AppConfig.routeDirectionRotationRestoreDelaySeconds,
                execute: workItem
            )
        }

        func mapView(_ mapView: MKMapView, regionDidChangeAnimated animated: Bool) {
            let shouldCancelLocationFollow = wasUserPanGestureActive && shouldCancelLocationFollowAfterPan(
                locationFollowMode: parent.locationFollowMode,
                currentLocation: parent.currentLocation,
                mapCenter: mapView.region.center,
                followToleranceMeters: AppConfig.currentLocationFollowPanToleranceMeters,
                headingFollowToleranceMeters: AppConfig.currentLocationHeadingFollowPanToleranceMeters
            )

            if shouldCancelLocationFollow {
                shouldSuppressNextTrackingModeCameraReset = true
                DispatchQueue.main.async {
                    self.parent.onUserPanWhileLocationFollowing()
                }
            }

            wasUserPanGestureActive = false
            syncAnnotations(on: mapView)
            if !shouldCancelLocationFollow {
                syncCurrentLocationPresentation(on: mapView)
            }
            refreshTrailSegmentLabelVisibility(on: mapView)
            let region = mapView.region
            DispatchQueue.main.async {
                self.parent.onRegionDidChange(region)
            }
        }

        func mapView(_ mapView: MKMapView, regionWillChangeAnimated animated: Bool) {
            wasUserPanGestureActive = isUserPanGestureActive(in: mapView)
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            refreshCurrentLocationAppearance(on: mapView)

            let currentHeading = normalizedLocationDirection(mapView.camera.heading) ?? 0
            defer {
                lastObservedMapHeading = currentHeading
            }

            guard let previousHeading = lastObservedMapHeading else {
                return
            }

            let headingDelta = MapHeading.angularDifference(from: previousHeading, to: currentHeading)
            guard headingDelta >= AppConfig.routeDirectionRotationDetectionThresholdDegrees else {
                return
            }

            beginRouteDirectionRotation(on: mapView)
            scheduleRouteDirectionRotationRestore(on: mapView)
        }

        private func isUserPanGestureActive(in mapView: MKMapView) -> Bool {
            mapView.subviews
                .compactMap(\.gestureRecognizers)
                .flatMap { $0 }
                .contains { gestureRecognizer in
                    guard gestureRecognizer is UIPanGestureRecognizer else {
                        return false
                    }

                    switch gestureRecognizer.state {
                    case .began, .changed, .ended:
                        return true
                    default:
                        return false
                    }
                }
        }

        func mapView(_ mapView: MKMapView, didAdd views: [MKAnnotationView]) {
            for view in views {
                if view.annotation is CurrentLocationAnnotation {
                    (view as? CurrentLocationAnnotationView)?.configure(
                        bearing: currentLocationDisplayBearing(
                            locationBearing: currentLocationBearing,
                            mapCameraHeading: mapView.camera.heading
                        )
                    )
                    bringCurrentLocationToFront(on: mapView)
                }

                if let directionView = view as? RouteDirectionAnnotationView,
                   let directionAnnotation = view.annotation as? RouteDirectionAnnotation {
                    directionView.configure(
                        bearing: routeDirectionDisplayBearing(
                            routeBearing: directionAnnotation.bearing,
                            mapCameraHeading: mapView.camera.heading
                        ),
                        isHidden: isRouteDirectionRotationActive
                    )
                }

                if let segmentView = view as? TrailSegmentAnnotationView,
                   let segmentAnnotation = view.annotation as? TrailSegmentAnnotation {
                    let shouldShowLabels = mapView.region.span.latitudeDelta <= AppConfig.trailSegmentLabelsMaxLatitudeDelta
                    let isVisible = segmentAnnotation.kind == .plannedRoute
                        ? !isRouteDirectionRotationActive
                        : shouldShowLabels
                    segmentView.setVisibility(isVisible)
                }
            }
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            if annotation is CurrentLocationAnnotation {
                let identifier = "CurrentLocationAnnotation"
                let view = mapView.dequeueReusableAnnotationView(withIdentifier: identifier) as? CurrentLocationAnnotationView ?? CurrentLocationAnnotationView(annotation: annotation, reuseIdentifier: identifier)
                view.annotation = annotation
                view.configure(
                    bearing: currentLocationDisplayBearing(
                        locationBearing: currentLocationBearing,
                        mapCameraHeading: mapView.camera.heading
                    )
                )
                return view
            }

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
                view.configure(
                    bearing: routeDirectionDisplayBearing(
                        routeBearing: directionAnnotation.bearing,
                        mapCameraHeading: mapView.camera.heading
                    ),
                    isHidden: isRouteDirectionRotationActive
                )
                view.displayPriority = .defaultLow
                return view
            }

            return nil
        }

        private func bringCurrentLocationToFront(on mapView: MKMapView) {
            if let annotation = currentLocationAnnotation,
               let currentLocationView = mapView.view(for: annotation) {
                mapView.bringSubviewToFront(currentLocationView)
            }
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
                renderer.lineWidth = plannedOverlay?.isSelectedRouteSection == true ? 6 : 7
            } else if let selectedOverlay = overlay as? SelectedTrailOverlay, selectedOverlay.isBorderUnderlay {
                let emphasisColor = selectedOverlay.isOverPlannedRoute
                    ? selectedRouteColor
                    : baseColor.withAlphaComponent(0.98)
                renderer.strokeColor = emphasisColor.darkened(by: 0.68).withAlphaComponent(1.0)
                renderer.lineWidth = selectedOverlay.isOverPlannedRoute ? 20 : 17
            } else if let selectedOverlay = overlay as? SelectedTrailOverlay, selectedOverlay.isOverPlannedRoute {
                renderer.strokeColor = selectedRouteColor.withAlphaComponent(0.95)
                renderer.lineWidth = 5
            } else if overlay is SelectedTrailOverlay {
                renderer.strokeColor = baseColor.withAlphaComponent(0.98)
                renderer.lineWidth = 5
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
    var isBorderUnderlay = false
}

class RouteSectionOverlay: TrailOverlay {
    var edgeID = ""
    var sequenceIndex = 0
    var isSelectedRouteSection = false
}

final class CurrentLocationAnnotation: NSObject, MKAnnotation {
    dynamic var coordinate: CLLocationCoordinate2D

    init(coordinate: CLLocationCoordinate2D) {
        self.coordinate = coordinate
    }
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
        arrowLayer.actions = [
            "transform": NSNull(),
            "hidden": NSNull(),
            "position": NSNull(),
            "bounds": NSNull()
        ]
        layer.addSublayer(arrowLayer)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(bearing: Double, isHidden: Bool) {
        layer.removeAllAnimations()
        arrowLayer.removeAllAnimations()

        UIView.performWithoutAnimation {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            self.isHidden = isHidden

            // Triangle points east (0°). Bearing is clockwise from north.
            // Screen rotation: north=up=-90° in screen coords, so rotate by (bearing - 90°)
            let radians = (bearing - 90) * .pi / 180
            arrowLayer.setAffineTransform(CGAffineTransform(rotationAngle: radians))
            CATransaction.commit()
        }
    }
}

final class CurrentLocationAnnotationView: MKAnnotationView {
    private static let frameSize = CGSize(width: 38, height: 38)
    private static let bubbleDiameter: CGFloat = 22
    private let ringView = UIView()
    private let fillView = UIView()
    private let directionView = UIView()
    private let directionShaftLayer = CAShapeLayer()
    private let directionHeadLayer = CAShapeLayer()

    override init(annotation: MKAnnotation?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)

        canShowCallout = false
        isUserInteractionEnabled = false
        collisionMode = .circle
        centerOffset = .zero
        displayPriority = .required
        zPriority = .max
        selectedZPriority = .max
        backgroundColor = .clear
        clipsToBounds = false

        frame = CGRect(origin: .zero, size: Self.frameSize)

        ringView.backgroundColor = UIColor.white.withAlphaComponent(0.96)
        ringView.layer.shadowColor = UIColor.black.cgColor
        ringView.layer.shadowOpacity = 0.18
        addSubview(ringView)

        fillView.backgroundColor = .systemBlue
        fillView.layer.borderWidth = 1
        fillView.layer.borderColor = UIColor.systemBlue.withAlphaComponent(0.35).cgColor
        addSubview(fillView)

        directionView.frame = bounds
        directionView.backgroundColor = .clear
        directionShaftLayer.fillColor = UIColor.clear.cgColor
        directionShaftLayer.strokeColor = UIColor.white.cgColor
        directionShaftLayer.lineWidth = 2.4
        directionShaftLayer.lineCap = .round
        directionShaftLayer.shadowColor = UIColor.systemBlue.cgColor
        directionShaftLayer.shadowOpacity = 0.55
        directionShaftLayer.shadowRadius = 1.5
        directionView.layer.addSublayer(directionShaftLayer)

        directionHeadLayer.fillColor = UIColor.white.cgColor
        directionHeadLayer.strokeColor = UIColor.systemBlue.cgColor
        directionHeadLayer.lineWidth = 1.2
        directionHeadLayer.lineJoin = .round
        directionView.layer.addSublayer(directionHeadLayer)
        addSubview(directionView)

        layoutMarker()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        directionView.isHidden = true
        directionView.transform = .identity
        layoutMarker()
    }

    func configure(bearing: CLLocationDirection?) {
        guard let bearing else {
            directionView.isHidden = true
            directionView.transform = .identity
            return
        }

        directionView.isHidden = false
        directionView.transform = CGAffineTransform(rotationAngle: bearing * .pi / 180)
    }

    private func layoutMarker() {
        let bubbleDiameter = Self.bubbleDiameter
        let bubbleOrigin = CGPoint(
            x: (bounds.width - bubbleDiameter) / 2,
            y: (bounds.height - bubbleDiameter) / 2
        )
        let bubbleRect = CGRect(origin: bubbleOrigin, size: CGSize(width: bubbleDiameter, height: bubbleDiameter))

        ringView.frame = bubbleRect
        ringView.layer.cornerRadius = bubbleDiameter / 2
        ringView.layer.shadowRadius = 5
        ringView.layer.shadowOffset = CGSize(width: 0, height: 2)

        let fillInset: CGFloat = 3.5
        fillView.frame = bubbleRect.insetBy(dx: fillInset, dy: fillInset)
        fillView.layer.cornerRadius = fillView.bounds.width / 2
        fillView.layer.borderWidth = 1

        directionView.frame = bounds
        directionShaftLayer.frame = directionView.bounds
        directionHeadLayer.frame = directionView.bounds

        let center = CGPoint(x: bounds.midX, y: bounds.midY)
        let shaftTopY = bubbleRect.minY + 2
        let headTipY = bubbleRect.minY - 5.5
        let headBaseY = bubbleRect.minY + 2.5
        let headHalfWidth: CGFloat = 4.2

        let shaftPath = UIBezierPath()
        shaftPath.move(to: center)
        shaftPath.addLine(to: CGPoint(x: center.x, y: shaftTopY))
        directionShaftLayer.path = shaftPath.cgPath

        let headPath = UIBezierPath()
        headPath.move(to: CGPoint(x: center.x, y: headTipY))
        headPath.addLine(to: CGPoint(x: center.x + headHalfWidth, y: headBaseY))
        headPath.addLine(to: CGPoint(x: center.x, y: headBaseY - 1.5))
        headPath.addLine(to: CGPoint(x: center.x - headHalfWidth, y: headBaseY))
        headPath.close()
        directionHeadLayer.path = headPath.cgPath
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
            displayPriority = MKFeatureDisplayPriority(rawValue: Float(min(750, 200 + distanceKm * 220)))
        case .plannedRoute:
            label.textColor = .white
            label.backgroundColor = UIColor.systemBlue.withAlphaComponent(0.92)
            displayPriority = .required
        }
        label.sizeToFit()
        label.frame = label.bounds
        frame = label.bounds
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

func currentLocationMovementBearing(
    from previousLocation: CLLocationCoordinate2D?,
    to currentLocation: CLLocationCoordinate2D,
    minimumDistanceMeters: Double
) -> CLLocationDirection? {
    guard let previousLocation else {
        return nil
    }

    let distanceMeters = GeoMath.distanceKilometers(from: previousLocation, to: currentLocation) * 1000
    guard distanceMeters >= minimumDistanceMeters else {
        return nil
    }

    let bearing = GeoMath.bearing(from: previousLocation, to: currentLocation)
    let normalizedBearing = bearing.truncatingRemainder(dividingBy: 360)
    return normalizedBearing >= 0 ? normalizedBearing : normalizedBearing + 360
}

func normalizedLocationDirection(_ direction: CLLocationDirection?) -> CLLocationDirection? {
    guard let direction else {
        return nil
    }

    let normalizedDirection = direction.truncatingRemainder(dividingBy: 360)
    return normalizedDirection >= 0 ? normalizedDirection : normalizedDirection + 360
}

func currentLocationDisplayBearing(
    locationBearing: CLLocationDirection?,
    mapCameraHeading: CLLocationDirection
) -> CLLocationDirection? {
    guard let locationBearing else {
        return nil
    }

    return normalizedLocationDirection(locationBearing - mapCameraHeading)
}

func routeDirectionDisplayBearing(
    routeBearing: CLLocationDirection,
    mapCameraHeading: CLLocationDirection
) -> CLLocationDirection {
    normalizedLocationDirection(routeBearing - mapCameraHeading) ?? routeBearing
}

func shouldCancelLocationFollowAfterPan(
    locationFollowMode: LocationFollowMode,
    currentLocation: CLLocationCoordinate2D?,
    mapCenter: CLLocationCoordinate2D,
    followToleranceMeters: Double,
    headingFollowToleranceMeters: Double
) -> Bool {
    guard locationFollowMode != .off else {
        return false
    }

    guard let currentLocation else {
        return true
    }

    let centerDistanceMeters = GeoMath.distanceKilometers(from: currentLocation, to: mapCenter) * 1000
    let toleranceMeters: Double

    switch locationFollowMode {
    case .off:
        return false
    case .follow:
        toleranceMeters = followToleranceMeters
    case .followWithHeading:
        toleranceMeters = headingFollowToleranceMeters
    }

    return centerDistanceMeters > toleranceMeters
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

    func darkened(by amount: CGFloat) -> UIColor {
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0

        guard getRed(&red, green: &green, blue: &blue, alpha: &alpha) else {
            return self
        }

        let clampedAmount = min(max(amount, 0), 1)
        return UIColor(
            red: max(red * (1 - clampedAmount), 0),
            green: max(green * (1 - clampedAmount), 0),
            blue: max(blue * (1 - clampedAmount), 0),
            alpha: alpha
        )
    }
}