import CoreLocation
import MapKit
import XCTest
@testable import CrossCountryMaps

final class BrowseContractTests: XCTestCase {
    func testCurrentLocationMovementBearingIgnoresTinyLocationChanges() {
        let previousLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let currentLocation = CLLocationCoordinate2D(latitude: 59.91393, longitude: 10.75224)

        XCTAssertNil(
            currentLocationMovementBearing(
                from: previousLocation,
                to: currentLocation,
                minimumDistanceMeters: 8
            )
        )
    }

    func testCurrentLocationMovementBearingNormalizesCompassDirection() {
        let previousLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let currentLocation = CLLocationCoordinate2D(latitude: 59.9130, longitude: 10.7522)
        let bearing = currentLocationMovementBearing(
            from: previousLocation,
            to: currentLocation,
            minimumDistanceMeters: 8
        )

        XCTAssertNotNil(bearing)
        XCTAssertEqual(bearing ?? 0, 180, accuracy: 0.5)
    }

    func testNormalizedLocationDirectionWrapsNegativeValues() {
        XCTAssertEqual(normalizedLocationDirection(-15) ?? .nan, 345, accuracy: 0.001)
        XCTAssertEqual(normalizedLocationDirection(370) ?? .nan, 10, accuracy: 0.001)
    }

    func testAngularHeadingDifferenceUsesShortestArc() {
        XCTAssertEqual(MapHeading.angularDifference(from: 355, to: 5), 10, accuracy: 0.001)
        XCTAssertEqual(MapHeading.angularDifference(from: 90, to: 270), 180, accuracy: 0.001)
        XCTAssertEqual(MapHeading.angularDifference(from: 45, to: 50), 5, accuracy: 0.001)
    }

    func testRouteDirectionDisplayBearingTracksMapHeading() {
        XCTAssertEqual(routeDirectionDisplayBearing(routeBearing: 90, mapCameraHeading: 0), 90, accuracy: 0.001)
        XCTAssertEqual(routeDirectionDisplayBearing(routeBearing: 90, mapCameraHeading: 90), 0, accuracy: 0.001)
        XCTAssertEqual(routeDirectionDisplayBearing(routeBearing: 20, mapCameraHeading: 350), 30, accuracy: 0.001)
    }

    func testLocationFollowPanToleranceKeepsFollowNearCurrentLocation() {
        let currentLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let nearbyMapCenter = CLLocationCoordinate2D(latitude: 59.9140, longitude: 10.7522)

        XCTAssertFalse(
            shouldCancelLocationFollowAfterPan(
                locationFollowMode: .follow,
                currentLocation: currentLocation,
                mapCenter: nearbyMapCenter,
                followToleranceMeters: AppConfig.currentLocationFollowPanToleranceMeters,
                headingFollowToleranceMeters: AppConfig.currentLocationHeadingFollowPanToleranceMeters
            )
        )
    }

    func testLocationFollowPanToleranceCancelsFollowAfterMeaningfulPan() {
        let currentLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let distantMapCenter = CLLocationCoordinate2D(latitude: 59.9144, longitude: 10.7522)

        XCTAssertTrue(
            shouldCancelLocationFollowAfterPan(
                locationFollowMode: .follow,
                currentLocation: currentLocation,
                mapCenter: distantMapCenter,
                followToleranceMeters: AppConfig.currentLocationFollowPanToleranceMeters,
                headingFollowToleranceMeters: AppConfig.currentLocationHeadingFollowPanToleranceMeters
            )
        )
    }

    func testHeadingFollowPanToleranceAllowsSlightlyLargerMapDrift() {
        let currentLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let moderateMapCenter = CLLocationCoordinate2D(latitude: 59.91425, longitude: 10.7522)

        XCTAssertFalse(
            shouldCancelLocationFollowAfterPan(
                locationFollowMode: .followWithHeading,
                currentLocation: currentLocation,
                mapCenter: moderateMapCenter,
                followToleranceMeters: AppConfig.currentLocationFollowPanToleranceMeters,
                headingFollowToleranceMeters: AppConfig.currentLocationHeadingFollowPanToleranceMeters
            )
        )
    }

    func testHeadingFollowPanToleranceStillCancelsAfterMeaningfulPan() {
        let currentLocation = CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522)
        let distantMapCenter = CLLocationCoordinate2D(latitude: 59.9147, longitude: 10.7522)

        XCTAssertTrue(
            shouldCancelLocationFollowAfterPan(
                locationFollowMode: .followWithHeading,
                currentLocation: currentLocation,
                mapCenter: distantMapCenter,
                followToleranceMeters: AppConfig.currentLocationFollowPanToleranceMeters,
                headingFollowToleranceMeters: AppConfig.currentLocationHeadingFollowPanToleranceMeters
            )
        )
    }

    func testTrailProximityAutoSelectionMatchesSharedFixture() throws {
        let fixture: TrailProximityFixture = try FixtureLoader.decode("trail-proximity-auto-selection.json")

        XCTAssertEqual(
            GeoMath.closestDestinationByTrailProximity(
                destinations: fixture.destinations,
                trails: fixture.trails.features,
                reference: fixture.referenceCoordinate,
                thresholdKilometers: fixture.thresholdKm
            )?.id,
            fixture.expectedDestinationId
        )
    }

    func testNearestTrailDestinationSelectionMatchesSharedFixture() throws {
        let fixture: TrailProximityFixture = try FixtureLoader.decode("trail-proximity-auto-selection.json")

        XCTAssertEqual(
            GeoMath.closestDestinationByNearestTrail(
                destinations: fixture.destinations,
                trails: fixture.trails.features,
                reference: fixture.referenceCoordinate
            )?.id,
            fixture.expectedDestinationId
        )
    }

    func testBoundedNearbyPreviewSelectionMatchesSharedFixture() throws {
        let fixture: NearbyPreviewFixture = try FixtureLoader.decode("nearby-preview-selection.json")

        XCTAssertEqual(
            GeoMath.boundedNearbyPreviewDestinations(
                destinations: fixture.destinations,
                reference: fixture.referenceCoordinate,
                radiusKilometers: fixture.radiusKm,
                excludedID: fixture.selectedDestinationId,
                maxCount: fixture.maxPreviews
            ).map(\.id),
            fixture.expectedDestinationIds
        )
    }

    func testTrailDetailLabelsMatchSharedFixture() throws {
        let fixture: TrailDetailFixture = try FixtureLoader.decode("trail-detail-summary.json")
        let trail = try fixture.makeTrailFeature()

        XCTAssertEqual(trail.trailTypeLabel, fixture.expected.trailTypeLabel)
        XCTAssertEqual(trail.groomingLabel, fixture.expected.groomingLabel)
        XCTAssertEqual(trail.compactGroomingLabel, fixture.expected.compactGroomingLabel)
        XCTAssertEqual(trail.groomingColorHex, fixture.expected.groomingColorHex)
        XCTAssertEqual(trail.disciplineLabels, fixture.expected.disciplineLabels)
        XCTAssertEqual(trail.warningText, fixture.expected.warningText)
        XCTAssertEqual(trail.formattedLengthLabel, fixture.expected.formattedDistance)
    }

    func testCrossingBasedSegmentCountMatchesSharedFixture() throws {
        let fixture: TrailCrossingSegmentsFixture = try FixtureLoader.decode("trail-crossing-segments.json")
        let selectedTrail = try fixture.makeSelectedTrail()
        let allTrails = try [fixture.makeSelectedTrail()] + fixture.makeCrossingTrails()
        let segments = selectedTrail.trailSegments(allTrails: allTrails)

        XCTAssertEqual(
            segments.count,
            fixture.expected.segmentCount,
            "Expected \(fixture.expected.segmentCount) crossing-based sections"
        )
        XCTAssertTrue(
            segments.allSatisfy { $0.distanceKm >= fixture.expected.minSegmentDistanceKm },
            "All segments should be at least \(fixture.expected.minSegmentDistanceKm) km"
        )
    }

    func testCrossingIntervalInspectionMatchesSharedFixture() throws {
        let fixture: TrailInspectionFixture = try FixtureLoader.decode("crossing-interval-inspection.json")
        let selection = GeoMath.inspectableTrailSelection(
            reference: fixture.clickCoordinate,
            trails: fixture.trails.features,
            trailMatchThresholdKm: fixture.trailMatchThresholdKm,
            crossingMatchThresholdKm: fixture.crossingMatchThresholdKm
        )

        XCTAssertEqual(selection?.trailID, String(fixture.expected.featureId))
                guard let expectedSegment = fixture.expected.segment,
                            let selectedSegment = selection?.segment else {
                        return XCTFail("Expected a crossing-derived segment selection")
                }

                XCTAssertEqual(selectedSegment.startDistanceKm, expectedSegment.startDistanceKm, accuracy: 0.02)
                XCTAssertEqual(selectedSegment.endDistanceKm, expectedSegment.endDistanceKm, accuracy: 0.02)
                XCTAssertEqual(selectedSegment.distanceKm, expectedSegment.distanceKm, accuracy: 0.02)
    }

    func testWholeFeatureInspectionFallbackMatchesSharedFixture() throws {
        let fixture: TrailInspectionFixture = try FixtureLoader.decode("whole-feature-inspection-fallback.json")
        let selection = GeoMath.inspectableTrailSelection(
            reference: fixture.clickCoordinate,
            trails: fixture.trails.features,
            trailMatchThresholdKm: fixture.trailMatchThresholdKm,
            crossingMatchThresholdKm: fixture.crossingMatchThresholdKm
        )

        XCTAssertEqual(selection?.trailID, String(fixture.expected.featureId))
        XCTAssertNil(selection?.segment)
    }

    @MainActor
    func testBrowseBootstrapWaitsForTrailMatchedDestinationBeforeLoadingTrails() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()

        await waitUntil {
            viewModel.destinationsPhase == .success
        }

        XCTAssertEqual(apiClient.callLog, [.destinations])
        XCTAssertEqual(viewModel.selectedDestinationID, "")
        XCTAssertEqual(viewModel.trailsPhase, .idle)
        XCTAssertEqual(viewModel.fitRequestID, 0)
        XCTAssertEqual(locationService.startCallCount, 1)
    }

    @MainActor
    func testStartupLocationUpdateSelectsTrailMatchedDestinationAndLoadsScopedTrails() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: [
                try makeTrail(id: 301, destinationId: 1, latitude: 59.9139, longitude: 10.7522),
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        XCTAssertEqual(apiClient.callLog, [.destinations, .nearbyTrails, .trails("1")])
        XCTAssertEqual(viewModel.fitRequestID, 1)
    }

    @MainActor
    func testStoredBrowseSettingsRestoreDestinationAndMapRegionOnStart() async throws {
        let browseSettingsStore = BrowseSettingsStoreSpy(
            initialSettings: BrowseSettings(
                destinationID: "2",
                mapRegion: PersistedMapRegion(
                    latitude: 61.1153,
                    longitude: 10.4662,
                    latitudeDelta: 0.12,
                    longitudeDelta: 0.12
                )
            )
        )
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            browseSettingsStore: browseSettingsStore
        )

        viewModel.start()

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success
        }

        XCTAssertTrue(viewModel.isManualDestinationSelection)
        XCTAssertEqual(viewModel.visibleMapRegion, browseSettingsStore.initialSettings?.mapRegion)
        XCTAssertEqual(viewModel.mapRegionRestoreRequestID, 1)
        XCTAssertEqual(viewModel.fitRequestID, 0)
        XCTAssertEqual(apiClient.callLog, [.destinations, .trails("2")])
    }

    @MainActor
    func testStoredBrowseRestoreIgnoresStartupLocationUpdates() async throws {
        let browseSettingsStore = BrowseSettingsStoreSpy(
            initialSettings: BrowseSettings(
                destinationID: "2",
                mapRegion: PersistedMapRegion(
                    latitude: 61.1153,
                    longitude: 10.4662,
                    latitudeDelta: 0.12,
                    longitudeDelta: 0.12
                )
            )
        )
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: [
                try makeTrail(id: 301, destinationId: 1, latitude: 59.9139, longitude: 10.7522),
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate,
            browseSettingsStore: browseSettingsStore
        )

        viewModel.start()
        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success
        }

        XCTAssertTrue(viewModel.isManualDestinationSelection)
        XCTAssertEqual(viewModel.visibleMapRegion, browseSettingsStore.initialSettings?.mapRegion)
        XCTAssertEqual(viewModel.fitRequestID, 0)
        XCTAssertEqual(apiClient.callLog, [.destinations, .trails("2")])
    }

    @MainActor
    func testStoredBrowseRestoreIgnoresEarlyMapRegionCallback() async throws {
        let storedRegion = PersistedMapRegion(
            latitude: 61.1153,
            longitude: 10.4662,
            latitudeDelta: 0.12,
            longitudeDelta: 0.12
        )
        let browseSettingsStore = BrowseSettingsStoreSpy(
            initialSettings: BrowseSettings(
                destinationID: "2",
                mapRegion: storedRegion
            )
        )
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            browseSettingsStore: browseSettingsStore
        )

        viewModel.start()
        viewModel.updateVisibleRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522),
                span: MKCoordinateSpan(latitudeDelta: 0.45, longitudeDelta: 0.45)
            )
        )

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success
        }

        XCTAssertEqual(viewModel.visibleMapRegion, storedRegion)
        XCTAssertEqual(browseSettingsStore.lastWrittenSettings?.mapRegion, BrowseSettings(destinationID: "2", mapRegion: storedRegion).mapRegion)
    }

    @MainActor
    func testManualDestinationSelectionSuppressesLaterAutomaticSwitching() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: [
                try makeTrail(id: 301, destinationId: 1, latitude: 59.9139, longitude: 10.7522),
            ]
        )
        let locationService = LocationServiceSpy()

                @MainActor
                func testEnterPlanningModePersistsPlanningStateInBrowseSettings() async throws {
                    let browseSettingsStore = BrowseSettingsStoreSpy()
                    let apiClient = BrowseAPISpy(
                        destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                        trailsByDestination: [
                            "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                        ]
                    )
                    let viewModel = BrowseViewModel(
                        apiClient: apiClient,
                        locationService: LocationServiceSpy(),
                        timingConfig: .immediate,
                        browseSettingsStore: browseSettingsStore
                    )

                    viewModel.start()

                    await waitUntil {
                        viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
                    }

                    viewModel.enterPlanningMode()

                    XCTAssertEqual(
                        browseSettingsStore.lastWrittenSettings,
                        BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: true)
                    )
                }

                @MainActor
                func testExitPlanningModePersistsNonPlanningStateInBrowseSettings() async throws {
                    let browseSettingsStore = BrowseSettingsStoreSpy()
                    let apiClient = BrowseAPISpy(
                        destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                        trailsByDestination: [
                            "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                        ]
                    )
                    let viewModel = BrowseViewModel(
                        apiClient: apiClient,
                        locationService: LocationServiceSpy(),
                        timingConfig: .immediate,
                        browseSettingsStore: browseSettingsStore
                    )

                    viewModel.start()

                    await waitUntil {
                        viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
                    }

                    viewModel.enterPlanningMode()
                    viewModel.exitPlanningMode()

                    XCTAssertEqual(
                        browseSettingsStore.lastWrittenSettings,
                        BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: false)
                    )
                }
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        let callCountBeforeLocationUpdate = apiClient.callLog.count
        let handledLocationUpdatesBefore = viewModel.handledLocationUpdateCount
        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.handledLocationUpdateCount == handledLocationUpdatesBefore + 1
        }

        XCTAssertTrue(viewModel.isManualDestinationSelection)
        XCTAssertEqual(viewModel.selectedDestinationID, "2")
        XCTAssertEqual(apiClient.callLog.count, callCountBeforeLocationUpdate)
    }

    @MainActor
    func testEnableAutoLocationStillRecentersWithoutTrailMatch() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        locationService.sendLocation(CLLocationCoordinate2D(latitude: 58.9690, longitude: 5.7331))

        await waitUntil {
            viewModel.currentLocation?.latitude == 58.9690
        }

        XCTAssertTrue(viewModel.canEnableAutoLocation)
        let locationFocusRequestIDBefore = viewModel.locationFocusRequestID

        viewModel.toggleLocationFollow()

        XCTAssertFalse(viewModel.isManualDestinationSelection)
        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 1)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBefore + 1)
        XCTAssertEqual(viewModel.selectedDestinationID, "2")
    }

    @MainActor
    func testEnableAutoLocationUsesNearestTrailMatchedDestination() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: [
                try makeTrail(id: 301, destinationId: 1, latitude: 59.9139, longitude: 10.7522),
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.currentLocation?.latitude == 59.9139
        }

        XCTAssertTrue(viewModel.canEnableAutoLocation)
        let fitRequestCountBeforeAutoLocation = viewModel.fitRequestID

        viewModel.toggleLocationFollow()

        await waitUntil {
            !viewModel.isManualDestinationSelection && viewModel.selectedDestinationID == "1"
        }

        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 1)
        XCTAssertEqual(viewModel.fitRequestID, fitRequestCountBeforeAutoLocation)
    }

    @MainActor
    func testAuthorizationUnavailableDoesNotFallbackToDefaultCenterDestination() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()

        await waitUntil {
            viewModel.destinationsPhase == .success
        }

        locationService.sendAuthorizationUnavailable()
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertEqual(apiClient.callLog, [.destinations])
        XCTAssertEqual(viewModel.selectedDestinationID, "")
        XCTAssertEqual(viewModel.trailsPhase, .idle)
    }

    @MainActor
    func testEnableAutoLocationDoesNotFallBackToDestinationCenterProximity() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: []
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.currentLocation?.latitude == 59.9139
        }

        viewModel.toggleLocationFollow()

        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertFalse(viewModel.isManualDestinationSelection)
        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 1)
        XCTAssertEqual(viewModel.selectedDestinationID, "2")
    }

    @MainActor
    func testEnableAutoLocationForcesFreshTrailBasedDestinationSelectionAtCurrentLocation() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ],
            nearbyTrailsResponse: [
                try makeTrail(id: 301, destinationId: 1, latitude: 59.9139, longitude: 10.7522),
            ]
        )
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        await waitUntil {
            viewModel.currentLocation?.latitude == 59.9139
        }

        viewModel.selectDestination(id: "2", manual: false)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.trailsPhase == .success &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        viewModel.toggleLocationFollow()

        await waitUntil {
            !viewModel.isManualDestinationSelection && viewModel.selectedDestinationID == "1"
        }

        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 1)
    }

    @MainActor
    func testLocationFollowToggleCyclesThroughCenterFollowHeadingAndOff() {
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: locationService,
            timingConfig: .immediate
        )

        XCTAssertEqual(viewModel.locationFollowMode, LocationFollowMode.off)

        viewModel.toggleLocationFollow()

        XCTAssertEqual(viewModel.locationFollowMode, LocationFollowMode.follow)
        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 1)

        viewModel.toggleLocationFollow()

        XCTAssertEqual(viewModel.locationFollowMode, LocationFollowMode.followWithHeading)
        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 2)

        let locationFocusRequestIDBeforeDisable = viewModel.locationFocusRequestID

        viewModel.toggleLocationFollow()

        XCTAssertEqual(viewModel.locationFollowMode, LocationFollowMode.off)
        XCTAssertEqual(locationService.requestCurrentLocationCallCount, 2)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBeforeDisable + 1)
    }

    @MainActor
    func testPlanningModeDisablesAutoLocationAvailability() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        XCTAssertTrue(viewModel.canEnableAutoLocation)

        viewModel.enterPlanningMode()

        XCTAssertFalse(viewModel.canEnableAutoLocation)

        viewModel.exitPlanningMode()

        XCTAssertTrue(viewModel.canEnableAutoLocation)
    }

    @MainActor
    func testEnteringPlanningModeTurnsOffLocationFollow() {
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.toggleLocationFollow()
        viewModel.toggleLocationFollow()
        XCTAssertEqual(viewModel.locationFollowMode, .followWithHeading)

        let locationFocusRequestIDBeforePlanning = viewModel.locationFocusRequestID

        viewModel.enterPlanningMode()

        XCTAssertEqual(viewModel.locationFollowMode, .off)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBeforePlanning + 1)
    }

    @MainActor
    func testUserMapInteractionDisablesCenterFollowMode() {
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.toggleLocationFollow()
        XCTAssertEqual(viewModel.locationFollowMode, .follow)

        let locationFocusRequestIDBeforeInteraction = viewModel.locationFocusRequestID

        viewModel.handleUserPanWhileLocationFollowing()

        XCTAssertEqual(viewModel.locationFollowMode, .off)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBeforeInteraction + 1)
    }

    @MainActor
    func testUserMapInteractionDisablesAutoRotateMode() {
        let locationService = LocationServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.toggleLocationFollow()
        viewModel.toggleLocationFollow()
        XCTAssertEqual(viewModel.locationFollowMode, .followWithHeading)

        let locationFocusRequestIDBeforeInteraction = viewModel.locationFocusRequestID

        viewModel.handleUserPanWhileLocationFollowing()

        XCTAssertEqual(viewModel.locationFollowMode, .off)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBeforeInteraction + 1)
    }

    @MainActor
    func testFocusingPlannedRouteDisablesAutoRotateMode() async throws {
        let locationService = LocationServiceSpy()
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(
            selection: TrailInspectionSelection(
                trailID: "101",
                anchorEdgeID: "101:0",
                segment: nil
            )
        )

        await waitUntil {
            !viewModel.routePlan.isEmpty
        }

        viewModel.exitPlanningMode()
        viewModel.toggleLocationFollow()
        viewModel.toggleLocationFollow()

        XCTAssertEqual(viewModel.locationFollowMode, .followWithHeading)
        let locationFocusRequestIDBeforeFocus = viewModel.locationFocusRequestID
        let fitRequestIDBeforeFocus = viewModel.fitRequestID

        viewModel.focusPlannedRouteIfAvailable()

        XCTAssertEqual(viewModel.locationFollowMode, .off)
        XCTAssertEqual(viewModel.locationFocusRequestID, locationFocusRequestIDBeforeFocus + 1)
        XCTAssertEqual(viewModel.fitRequestID, fitRequestIDBeforeFocus + 1)
    }

    @MainActor
    func testStalePrimaryTrailResponsesDoNotOverwriteLatestSelection() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        apiClient.suspendedTrailDestinationIDs = ["1"]

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            apiClient.callLog == [.destinations, .trails("1")]
        }

        viewModel.updateVisibleRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 61.1153, longitude: 10.4662),
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            )
        )
        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.primaryTrails.map(\.id) == ["202"] &&
            viewModel.trailsPhase == .success
        }

        apiClient.resumeTrails(for: "1")

        await waitUntil {
            apiClient.completedTrailDestinationIDs.filter { $0 == "1" }.count == 1
        }

        XCTAssertEqual(viewModel.selectedDestinationID, "2")
        XCTAssertEqual(viewModel.primaryTrails.map(\.id), ["202"])
        XCTAssertEqual(Array(apiClient.callLog.prefix(3)), [.destinations, .trails("1"), .trails("2")])
    }

    @MainActor
    func testNearbyPreviewLoadsDoNotTriggerSecondPrimaryFit() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Sognsvann", latitude: 59.9944, longitude: 10.6736),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 59.9944, longitude: 10.6736)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.previewPhase == .success &&
            viewModel.previewTrails.map(\.id) == ["202"]
        }

        XCTAssertEqual(viewModel.fitRequestID, 1)
        XCTAssertEqual(apiClient.callLog, [.destinations, .trails("1"), .trails("2")])
    }

    @MainActor
    func testNearbyPreviewRecheckSkipsRefetchWhenPreviewDestinationsAreUnchanged() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Sognsvann", latitude: 59.9944, longitude: 10.6736),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 59.9944, longitude: 10.6736)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.previewPhase == .success &&
            viewModel.previewTrails.map(\.id) == ["202"]
        }

        let callLogBeforeRecheck = apiClient.callLog

        viewModel.updateVisibleRegion(
            MKCoordinateRegion(
                center: CLLocationCoordinate2D(latitude: 59.9155, longitude: 10.7505),
                span: MKCoordinateSpan(latitudeDelta: 0.12, longitudeDelta: 0.12)
            )
        )

        await waitUntil {
            viewModel.previewPhase == .success
        }

        XCTAssertEqual(viewModel.nearbyPreviewDestinations.map(\.id), ["2"])
        XCTAssertEqual(viewModel.previewTrails.map(\.id), ["202"])
        XCTAssertEqual(apiClient.callLog, callLogBeforeRecheck)
    }

    @MainActor
    func testBrowseSettingsPersistDestinationAndMapRegionChanges() async throws {
        let browseSettingsStore = BrowseSettingsStoreSpy()
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrail(id: 101, destinationId: 1, latitude: 59.9139, longitude: 10.7522)],
                "2": [try makeTrail(id: 202, destinationId: 2, latitude: 61.1153, longitude: 10.4662)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            browseSettingsStore: browseSettingsStore
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "1" && viewModel.trailsPhase == .success
        }

        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.primaryTrails.map(\.id) == ["202"]
        }

        let region = MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 61.12, longitude: 10.49),
            span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
        )

        viewModel.updateVisibleRegion(region)

        XCTAssertEqual(
            browseSettingsStore.lastWrittenSettings,
            BrowseSettings(destinationID: "2", mapRegion: PersistedMapRegion(region: region))
        )
    }
}

private struct FallbackDestinationFixture: Decodable {
    let referenceCoordinates: CoordinateArray
    let destinationFixtures: [FixtureDestination]
    let expectedDestinationId: String

    enum CodingKeys: String, CodingKey {
        case referenceCoordinates
        case destinationFixtures = "destinations"
        case expectedDestinationId
    }

    var referenceCoordinate: CLLocationCoordinate2D {
        referenceCoordinates.coordinate
    }

    var destinations: [Destination] {
        destinationFixtures.map(\.destination)
    }
}

private struct TrailProximityFixture: Decodable {
    let referenceCoordinates: CoordinateArray
    let thresholdKm: Double
    let destinationFixtures: [FixtureDestination]
    let trailsGeoJson: TrailFeatureCollection
    let expectedDestinationId: String

    enum CodingKeys: String, CodingKey {
        case referenceCoordinates
        case thresholdKm
        case destinationFixtures = "destinations"
        case trailsGeoJson
        case expectedDestinationId
    }

    var referenceCoordinate: CLLocationCoordinate2D {
        referenceCoordinates.coordinate
    }

    var destinations: [Destination] {
        destinationFixtures.map(\.destination)
    }

    var trails: TrailFeatureCollection {
        trailsGeoJson
    }
}

private struct NearbyPreviewFixture: Decodable {
    let referenceCoordinates: CoordinateArray
    let radiusKm: Double
    let maxPreviews: Int
    let selectedDestinationId: String
    let destinationFixtures: [FixtureDestination]
    let expectedDestinationIds: [String]

    enum CodingKeys: String, CodingKey {
        case referenceCoordinates
        case radiusKm
        case maxPreviews
        case selectedDestinationId
        case destinationFixtures = "destinations"
        case expectedDestinationIds
    }

    var referenceCoordinate: CLLocationCoordinate2D {
        referenceCoordinates.coordinate
    }

    var destinations: [Destination] {
        destinationFixtures.map(\.destination)
    }
}

private struct TrailDetailFixture: Decodable {
    let trailFeature: TrailFixtureFeature
    let expected: ExpectedTrailDetail

    func makeTrailFeature() throws -> TrailFeature {
        try JSONDecoder().decode(TrailFeature.self, from: JSONEncoder().encode(trailFeature))
    }
}

private struct TrailCrossingSegmentsFixture: Decodable {
    let selectedTrail: TrailFixtureFeature
    let crossingTrails: [TrailFixtureFeature]
    let expected: ExpectedCrossingSegments

    func makeSelectedTrail() throws -> TrailFeature {
        try JSONDecoder().decode(TrailFeature.self, from: JSONEncoder().encode(selectedTrail))
    }

    func makeCrossingTrails() throws -> [TrailFeature] {
        try crossingTrails.map { fixture in
            try JSONDecoder().decode(TrailFeature.self, from: JSONEncoder().encode(fixture))
        }
    }
}

private struct TrailInspectionFixture: Decodable {
    let clickCoordinates: CoordinateArray
    let crossingMatchThresholdKm: Double
    let trailMatchThresholdKm: Double
    let trailsGeoJson: TrailFeatureCollection
    let expected: ExpectedTrailInspection

    var clickCoordinate: CLLocationCoordinate2D {
        clickCoordinates.coordinate
    }

    var trails: TrailFeatureCollection {
        trailsGeoJson
    }
}

private struct ExpectedCrossingSegments: Decodable {
    let segmentCount: Int
    let minSegmentDistanceKm: Double
}

private struct ExpectedTrailInspection: Decodable {
    let segment: ExpectedSelectedSegment?
    let featureId: Int
}

private struct ExpectedSelectedSegment: Decodable {
    let startDistanceKm: Double
    let endDistanceKm: Double
    let distanceKm: Double
}

private struct ExpectedTrailDetail: Decodable {
    let trailTypeLabel: String
    let groomingLabel: String
    let compactGroomingLabel: String
    let groomingColorHex: String
    let disciplineLabels: [String]
    let warningText: String
    let formattedDistance: String
}

private struct FixtureDestination: Decodable {
    let id: String
    let name: String
    let coordinates: CoordinateArray

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        coordinates = try container.decode(CoordinateArray.self, forKey: .coordinates)
    }

    var destination: Destination {
        Destination(id: id, name: name, prepSymbol: nil, coordinate: coordinates.coordinate)
    }

    private enum CodingKeys: String, CodingKey {
        case id
        case name
        case coordinates
    }
}

private struct CoordinateArray: Decodable {
    let longitude: Double
    let latitude: Double

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        longitude = try container.decode(Double.self)
        latitude = try container.decode(Double.self)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

private struct TrailFixtureFeature: Codable {
    let type: String
    let properties: [String: JSONValue]
    let geometry: TrailFixtureGeometry
}

private struct TrailFixtureGeometry: Codable {
    let type: String
    let coordinates: JSONValue
}

private enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case array([JSONValue])
    case object([String: JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

@MainActor
private func waitUntil(
    timeoutNanoseconds: UInt64 = 1_000_000_000,
    pollIntervalNanoseconds: UInt64 = 10_000_000,
    file: StaticString = #filePath,
    line: UInt = #line,
    condition: () -> Bool
) async {
    let deadline = DispatchTime.now().uptimeNanoseconds + timeoutNanoseconds

    while !condition() {
        if DispatchTime.now().uptimeNanoseconds >= deadline {
            XCTFail("Timed out waiting for condition", file: file, line: line)
            return
        }

        try? await Task.sleep(nanoseconds: pollIntervalNanoseconds)
    }
}

private func makeDestination(id: String, name: String, latitude: Double, longitude: Double) -> Destination {
    Destination(
        id: id,
        name: name,
        prepSymbol: 20,
        coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    )
}

private func makeTrail(id: Int, destinationId: Int, latitude: Double, longitude: Double) throws -> TrailFeature {
    let object: [String: Any] = [
        "type": "Feature",
        "properties": [
            "id": id,
            "destinationid": destinationId,
            "trailtypesymbol": 30,
            "prepsymbol": 20,
            "has_classic": true,
            "has_skating": true,
            "st_length(shape)": 1000,
        ],
        "geometry": [
            "type": "LineString",
            "coordinates": [
                [longitude, latitude],
                [longitude + 0.01, latitude + 0.01],
            ],
        ],
    ]

    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(TrailFeature.self, from: data)
}

@MainActor
private final class BrowseAPISpy: BrowseAPIClient {
    enum Call: Equatable {
        case destinations
        case trails(String)
        case nearbyTrails
    }

    private let destinationsFixture: DestinationFeatureCollection
    private let trailFixtures: [String: TrailFeatureCollection]
    private let nearbyFixture: TrailFeatureCollection
    private var trailContinuations: [String: CheckedContinuation<Void, Never>] = [:]

    var callLog: [Call] = []
    var completedTrailDestinationIDs: [String] = []
    var suspendedTrailDestinationIDs: Set<String> = []

    init(
        destinationsResponse: [Destination],
        trailsByDestination: [String: [TrailFeature]],
        nearbyTrailsResponse: [TrailFeature] = []
    ) {
        self.destinationsFixture = makeDestinationFeatureCollection(destinationsResponse)
        self.trailFixtures = trailsByDestination.mapValues(TrailFeatureCollection.init(features:))
        self.nearbyFixture = TrailFeatureCollection(features: nearbyTrailsResponse)
    }

    func fetchDestinations() async throws -> DestinationFeatureCollection {
        callLog.append(.destinations)
        return destinationsFixture
    }

    func fetchTrails(destinationID: String) async throws -> TrailFeatureCollection {
        callLog.append(.trails(destinationID))

        if suspendedTrailDestinationIDs.contains(destinationID) {
            await withCheckedContinuation { continuation in
                trailContinuations[destinationID] = continuation
            }
        }

        completedTrailDestinationIDs.append(destinationID)
        return trailFixtures[destinationID] ?? TrailFeatureCollection(features: [])
    }

    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection {
        callLog.append(.nearbyTrails)
        return nearbyFixture
    }

    func fetchElevation(request: ElevationApiRequest) async throws -> ElevationApiResponse {
        throw URLError(.badServerResponse)
    }

    func resumeTrails(for destinationID: String) {
        trailContinuations.removeValue(forKey: destinationID)?.resume()
    }
}

private final class BrowseSettingsStoreSpy: BrowseSettingsPersisting {
    let initialSettings: BrowseSettings?
    private(set) var lastWrittenSettings: BrowseSettings?

    init(initialSettings: BrowseSettings? = nil) {
        self.initialSettings = initialSettings
    }

    func readBrowseSettings() -> BrowseSettings? {
        initialSettings
    }

    func writeBrowseSettings(_ settings: BrowseSettings) {
        lastWrittenSettings = settings
    }
}

private final class LocationServiceSpy: BrowseLocationServing {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)?
    var onHeadingUpdate: ((CLLocationDirection?) -> Void)?
    var onAuthorizationUnavailable: (() -> Void)?
    var startCallCount = 0
    var requestCurrentLocationCallCount = 0

    func start() {
        startCallCount += 1
    }

    func requestCurrentLocation() {
        requestCurrentLocationCallCount += 1
    }

    func sendAuthorizationUnavailable() {
        onAuthorizationUnavailable?()
    }

    func sendLocation(_ coordinate: CLLocationCoordinate2D) {
        onLocationUpdate?(coordinate)
    }

    func sendHeading(_ heading: CLLocationDirection?) {
        onHeadingUpdate?(heading)
    }
}

private func makeDestinationFeatureCollection(_ destinations: [Destination]) -> DestinationFeatureCollection {
    let featureObjects = destinations.map { destination -> [String: Any] in
        var properties: [String: Any] = [
            "id": Int(destination.id) ?? -1,
            "name": destination.name,
        ]

        if let prepSymbol = destination.prepSymbol {
            properties["prepsymbol"] = prepSymbol
        }

        return [
            "geometry": [
                "coordinates": [destination.coordinate.longitude, destination.coordinate.latitude],
            ],
            "properties": properties,
        ]
    }

    let object: [String: Any] = [
        "features": featureObjects,
    ]

    let data = try! JSONSerialization.data(withJSONObject: object)
    return try! JSONDecoder().decode(DestinationFeatureCollection.self, from: data)
}
