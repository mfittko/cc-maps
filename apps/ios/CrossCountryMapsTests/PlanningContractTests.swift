import CoreLocation
import XCTest
@testable import CrossCountryMaps

// MARK: - Planning mode transition tests

final class PlanningContractTests: XCTestCase {

    private static let edgeA = "10.750000:59.910000~10.760000:59.910000"
    private static let edgeB = "10.760000:59.910000~10.770000:59.910000"
    private static let edgeC = "10.770000:59.910000~10.780000:59.910000"

    // MARK: RoutePlanState unit tests

    func testInitialStateIsEmpty() {
        let plan = RoutePlanState()
        XCTAssertTrue(plan.isEmpty)
        XCTAssertEqual(plan.sectionCount, 0)
        XCTAssertEqual(plan.anchorEdgeIDs, [])
    }

    func testToggleAnchorAppendsWhenAbsent() {
        var plan = RoutePlanState()
        plan.toggleAnchorEdge(Self.edgeA)
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeA])
        XCTAssertTrue(plan.contains(Self.edgeA))
    }

    func testToggleAnchorRemovesWhenPresent() {
        var plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA, Self.edgeB])
        plan.toggleAnchorEdge(Self.edgeA)
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeB])
        XCTAssertFalse(plan.contains(Self.edgeA))
    }

    func testMultipleTogglesPreserveInsertionOrder() {
        var plan = RoutePlanState()
        plan.toggleAnchorEdge(Self.edgeA)
        plan.toggleAnchorEdge(Self.edgeB)
        plan.toggleAnchorEdge(Self.edgeC)
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeA, Self.edgeB, Self.edgeC])
    }

    func testRemoveAtIndexLeavesOtherAnchorsStable() {
        var plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA, Self.edgeB, Self.edgeC])
        plan.removeAnchor(at: 1)
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeA, Self.edgeC])
    }

    func testRemoveAtOutOfBoundsIndexIsNoop() {
        var plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA])
        plan.removeAnchor(at: 5)
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeA])
    }

    func testReverseInvertsOrderWithoutMutatingIdentity() {
        var plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA, Self.edgeB, Self.edgeC])
        plan.reverse()
        XCTAssertEqual(plan.anchorEdgeIDs, [Self.edgeC, Self.edgeB, Self.edgeA])
    }

    func testDoubleReverseRestoresOriginalOrder() {
        let original = [Self.edgeA, Self.edgeB, Self.edgeC]
        var plan = RoutePlanState(anchorEdgeIDs: original)
        plan.reverse()
        plan.reverse()
        XCTAssertEqual(plan.anchorEdgeIDs, original)
    }

    func testClearRemovesAllAnchors() {
        var plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA, Self.edgeB])
        plan.clear()
        XCTAssertTrue(plan.isEmpty)
        XCTAssertEqual(plan.anchorEdgeIDs, [])
    }

    func testSectionCountMatchesAnchorCount() {
        let plan = RoutePlanState(anchorEdgeIDs: [Self.edgeA, Self.edgeB, Self.edgeC])
        XCTAssertEqual(plan.sectionCount, 3)
    }

    // MARK: Fixture-backed parity tests

    func testOrderedTapSequenceMatchesSharedRouteFixture() throws {
        let fixture: SharedRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")

        var plan = RoutePlanState()
        for edgeID in fixture.anchorEdgeIds {
            plan.toggleAnchorEdge(edgeID)
        }

        XCTAssertEqual(
            plan.anchorEdgeIDs,
            fixture.anchorEdgeIds,
            "Anchor order after tap sequence must match fixture"
        )
    }

    func testReverseMatchesSharedRouteFixture() throws {
        let fixture: SharedRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")

        var plan = RoutePlanState(anchorEdgeIDs: fixture.anchorEdgeIds)
        plan.reverse()

        XCTAssertEqual(
            plan.anchorEdgeIDs,
            Array(fixture.anchorEdgeIds.reversed()),
            "Reversed anchor order must match fixture"
        )
    }

    func testRemoveAtIndex1MatchesSharedRouteFixture() throws {
        let fixture: SharedRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")

        var plan = RoutePlanState(anchorEdgeIDs: fixture.anchorEdgeIds)
        plan.removeAnchor(at: 1)

        XCTAssertEqual(
            plan.anchorEdgeIDs,
            [fixture.anchorEdgeIds[0], fixture.anchorEdgeIds[2]],
            "Anchor list after removing index 1 must match fixture"
        )
    }

    func testToggleRemoveFirstAnchorMatchesSharedRouteFixture() throws {
        let fixture: SharedRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")

        var plan = RoutePlanState(anchorEdgeIDs: fixture.anchorEdgeIds)
        plan.toggleAnchorEdge(fixture.anchorEdgeIds[0])

        XCTAssertEqual(
            plan.anchorEdgeIDs,
            Array(fixture.anchorEdgeIds.dropFirst()),
            "Toggle-removing the first anchor must match fixture"
        )
    }

    func testClearMatchesSharedRouteFixture() throws {
        let fixture: SharedRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")

        var plan = RoutePlanState(anchorEdgeIDs: fixture.anchorEdgeIds)
        plan.clear()

        XCTAssertEqual(
            plan.anchorEdgeIDs,
            [],
            "Anchor list after clear must match fixture"
        )
    }

    func testPlanningSectionsPreserveRequestedAnchorOrder() throws {
        let trails = [
            try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
            try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
            try makeTrailSegment(id: 303, destinationId: 1, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
        ]

        let sections = GeoMath.planningSections(for: [Self.edgeC, Self.edgeA], allTrails: trails)

        XCTAssertEqual(sections.map(\.edgeID), [Self.edgeC, Self.edgeA])
        XCTAssertEqual(sections.map(\.trailID), ["303", "101"])
        XCTAssertEqual(sections.map(\.formattedDistanceLabel), ["0.6 km", "0.6 km"])
    }

    func testReorderedAnchorEdgeIDsFollowConnectedGraphPath() throws {
        let trails = [
            try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
            try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
            try makeTrailSegment(id: 303, destinationId: 1, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
        ]

        let reordered = GeoMath.reorderedAnchorEdgeIDs([Self.edgeA, Self.edgeC, Self.edgeB], allTrails: trails)

        XCTAssertEqual(reordered, [Self.edgeA, Self.edgeB, Self.edgeC])
    }

    func testDisplaySectionNumbersFollowFirstTraversableWalkOnSharedPath() throws {
        let edgeD = "10.760000:59.910000~10.760000:59.920000"
        let edgeE = "10.760000:59.920000~10.760000:59.930000"
        let trails = [
            try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
            try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
            try makeTrailSegment(id: 404, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.92),
            try makeTrailSegment(id: 505, destinationId: 1, startLongitude: 10.76, startLatitude: 59.92, endLongitude: 10.76, endLatitude: 59.93),
        ]

        let displayNumbers = GeoMath.displaySectionNumbersByEdgeID(
            for: [edgeE, Self.edgeA, edgeD, Self.edgeB],
            allTrails: trails
        )

        XCTAssertEqual(displayNumbers[edgeE], 1)
        XCTAssertEqual(displayNumbers[edgeD], 2)
        XCTAssertEqual(displayNumbers[Self.edgeA], 3)
        XCTAssertEqual(displayNumbers[Self.edgeB], 4)
    }

    func testPlanningSectionsPreserveFullSectionGeometry() throws {
        let bentEdgeID = "10.750000:59.910000~10.770000:59.920000"
        let trails = [
            try makeBentTrail(
                id: 404,
                destinationId: 1,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                    CLLocationCoordinate2D(latitude: 59.915, longitude: 10.76),
                    CLLocationCoordinate2D(latitude: 59.92, longitude: 10.77),
                ]
            )
        ]

        let sections = GeoMath.planningSections(for: [bentEdgeID], allTrails: trails)

        XCTAssertEqual(sections.count, 1)
        XCTAssertEqual(sections[0].coordinates.count, 3)
        XCTAssertNotNil(sections[0].midpoint)
        XCTAssertGreaterThan(sections[0].distanceKm, 0)
    }

    func testPlanningGraphRetainsVeryShortSections() throws {
        let shortEdgeID = "10.750000:59.910000~10.750200:59.910000"
        let trails = [
            try makeTrailSegment(
                id: 505,
                destinationId: 2,
                startLongitude: 10.75,
                startLatitude: 59.91,
                endLongitude: 10.7502,
                endLatitude: 59.91
            )
        ]

        let sections = GeoMath.planningSections(for: [shortEdgeID], allTrails: trails)

        XCTAssertEqual(sections.count, 1)
        XCTAssertEqual(sections[0].edgeID, shortEdgeID)
        XCTAssertLessThan(sections[0].distanceKm, 0.05)
        XCTAssertGreaterThan(sections[0].distanceKm, 0)
    }

    func testPlanningGraphCacheSeparatesDistinctGeometryWithSameTrailMetadata() throws {
        let firstEdgeID = "10.750000:59.910000~10.760000:59.910000"
        let secondEdgeID = "10.750000:59.910000~10.770000:59.910000"
        let firstTrail = try makeTrailSegment(
            id: 101,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.76,
            endLatitude: 59.91
        )
        let secondTrail = try makeTrailSegment(
            id: 101,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.77,
            endLatitude: 59.91
        )

        let firstSections = GeoMath.planningSections(for: [firstEdgeID], allTrails: [firstTrail])
        let secondSections = GeoMath.planningSections(for: [secondEdgeID], allTrails: [secondTrail])

        XCTAssertEqual(firstSections.map(\.edgeID), [firstEdgeID])
        XCTAssertEqual(secondSections.map(\.edgeID), [secondEdgeID])
    }

    func testDuplicateEdgeIDsStayStableAcrossTrailOrder() throws {
        let trail101 = try makeTrailSegment(
            id: 101,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.76,
            endLatitude: 59.91
        )
        let trail202 = try makeTrailSegment(
            id: 202,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.76,
            endLatitude: 59.91
        )

        let forwardTrails = [trail202, trail101]
        let reversedTrails = [trail101, trail202]

        XCTAssertEqual(
            GeoMath.planningAnchorEdgeIDs(for: trail101, allTrails: forwardTrails),
            GeoMath.planningAnchorEdgeIDs(for: trail101, allTrails: reversedTrails)
        )
        XCTAssertEqual(
            GeoMath.planningAnchorEdgeIDs(for: trail202, allTrails: forwardTrails),
            GeoMath.planningAnchorEdgeIDs(for: trail202, allTrails: reversedTrails)
        )
    }

    func testHydrationKeepsDuplicateEdgeIDsAcrossTrailOrderChanges() throws {
        let trail101 = try makeTrailSegment(
            id: 101,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.76,
            endLatitude: 59.91
        )
        let trail202 = try makeTrailSegment(
            id: 202,
            destinationId: 1,
            startLongitude: 10.75,
            startLatitude: 59.91,
            endLongitude: 10.76,
            endLatitude: 59.91
        )

        let storedTrails = [trail202, trail101]
        let restoredTrails = [trail101, trail202]
        let storedAnchorEdgeIDs = GeoMath.planningAnchorEdgeIDs(for: trail202, allTrails: storedTrails)

        let hydrationResult = GeoMath.hydrateRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: storedAnchorEdgeIDs, destinationIds: ["1"]),
            allTrails: restoredTrails
        )

        XCTAssertEqual(hydrationResult.status, .ok)
        XCTAssertEqual(hydrationResult.validAnchorEdgeIds, GeoMath.planningAnchorEdgeIDs(for: trail202, allTrails: restoredTrails))
        XCTAssertTrue(hydrationResult.staleAnchorEdgeIds.isEmpty)
    }

    func testCanonicalRoutePlanUrlRoundTripMatchesFixture() throws {
        let fixture: CanonicalRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")
        let routePlan = CanonicalRoutePlan(
            destinationId: fixture.destinationId,
            anchorEdgeIds: fixture.anchorEdgeIds,
            destinationIds: fixture.destinationIds
        )

        XCTAssertEqual(CanonicalRoutePlan.decodeFromURL(routePlan.encodedForURL), routePlan)
    }

    func testLegacyUrlMigrationMatchesFixture() throws {
        let fixture: LegacyMigrationFixture = try FixtureLoader.decode("route-plan/legacy-url-v1-migration.json")

        XCTAssertEqual(
            CanonicalRoutePlan.decodeFromURL(fixture.encoded),
            CanonicalRoutePlan(
                destinationId: fixture.expectedCanonical.destinationId,
                anchorEdgeIds: fixture.expectedCanonical.anchorEdgeIds,
                destinationIds: fixture.expectedCanonical.destinationIds
            )
        )
    }

    func testDestinationIdNormalizationMatchesFixture() throws {
        let fixture: NormalizationFixture = try FixtureLoader.decode("route-plan/normalization-duplicate-destination-ids.json")
        let routePlan = CanonicalRoutePlan(
            destinationId: fixture.inputPayload.destinationId,
            anchorEdgeIds: fixture.inputPayload.anchorEdgeIds,
            destinationIds: fixture.inputPayload.destinationIds
        )

        XCTAssertEqual(
            routePlan,
            CanonicalRoutePlan(
                destinationId: fixture.expectedCanonical.destinationId,
                anchorEdgeIds: fixture.expectedCanonical.anchorEdgeIds,
                destinationIds: fixture.expectedCanonical.destinationIds
            )
        )
    }

    func testHydrationFixtureMatchesSharedContract() throws {
        let fixture: PartialHydrationFixture = try FixtureLoader.decode("route-plan/hydration-partial-stale.v2.json")
        let routePlan = CanonicalRoutePlan(
            destinationId: fixture.canonical.destinationId,
            anchorEdgeIds: fixture.canonical.anchorEdgeIds,
            destinationIds: fixture.canonical.destinationIds
        )
        let trails = [
            try makeTrailSegment(id: 101, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
            try makeTrailSegment(id: 303, destinationId: 100, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
        ]
        let hydrationResult = GeoMath.hydrateRoutePlan(routePlan, allTrails: trails)

        XCTAssertEqual(hydrationResult.status.rawValue, fixture.expectedHydration.status)
        XCTAssertEqual(hydrationResult.validAnchorEdgeIds, fixture.expectedHydration.validAnchorEdgeIds)
        XCTAssertEqual(hydrationResult.staleAnchorEdgeIds, fixture.expectedHydration.staleAnchorEdgeIds)
    }

    func testRouteShareArtifactEmbedsCanonicalEncodedPayload() throws {
        let fixture: CanonicalRoutePlanFixture = try FixtureLoader.decode("route-plan/canonical-primary-plus-preview-sector.v2.json")
        let routePlan = CanonicalRoutePlan(
            destinationId: fixture.destinationId,
            anchorEdgeIds: fixture.anchorEdgeIds,
            destinationIds: fixture.destinationIds
        )
        let shareArtifact = try XCTUnwrap(
            RouteShareArtifact(
                routePlan: routePlan,
                destinationName: "Oslo",
                baseURL: URL(string: "https://example.com/map")!
            )
        )
        let components = URLComponents(url: shareArtifact.url, resolvingAgainstBaseURL: false)

        XCTAssertEqual(shareArtifact.encodedRoute, routePlan.encodedForURL)
        XCTAssertEqual(components?.queryItems?.first(where: { $0.name == "route" })?.value, routePlan.encodedForURL)
    }

    func testGpxExportPreservesPlanningSectionOrder() {
        let firstSection = PlanningSection(
            trailID: "101",
            edgeID: Self.edgeA,
            start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
            end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
            distanceKm: 0.6,
            coordinates: [
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
            ],
            midpoint: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.755),
            startDistanceKm: 0,
            endDistanceKm: 0.6
        )
        let secondSection = PlanningSection(
            trailID: "202",
            edgeID: Self.edgeB,
            start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
            end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.77),
            distanceKm: 0.6,
            coordinates: [
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.77),
            ],
            midpoint: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.765),
            startDistanceKm: 0.6,
            endDistanceKm: 1.2
        )

        let gpx = RouteExport.gpx(from: [secondSection, firstSection], routeName: "Oslo route")
        let secondSectionPoint = "<trkpt lat=\"59.91\" lon=\"10.76\"></trkpt>\n      <trkpt lat=\"59.91\" lon=\"10.77\"></trkpt>"
        let firstSectionPoint = "<trkpt lat=\"59.91\" lon=\"10.75\"></trkpt>\n      <trkpt lat=\"59.91\" lon=\"10.76\"></trkpt>"

        XCTAssertLessThan(gpx.range(of: secondSectionPoint)?.lowerBound.utf16Offset(in: gpx) ?? .max, gpx.range(of: firstSectionPoint)?.lowerBound.utf16Offset(in: gpx) ?? .max)
    }

    func testGpxExportDefaultsNameToWebParityValue() {
        let section = PlanningSection(
            trailID: "101",
            edgeID: Self.edgeA,
            start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
            end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
            distanceKm: 0.6,
            coordinates: [
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
            ],
            midpoint: nil,
            startDistanceKm: 0,
            endDistanceKm: 0.6
        )

        let gpx = RouteExport.gpx(from: [section], routeName: nil)

        XCTAssertTrue(gpx.contains("<name>CC Maps route</name>"))
    }

    func testGpxExportPreservesCoordinatePrecisionForParity() {
        let section = PlanningSection(
            trailID: "101",
            edgeID: Self.edgeA,
            start: CLLocationCoordinate2D(latitude: 59.1234567, longitude: 120.1234567),
            end: CLLocationCoordinate2D(latitude: 59.7654321, longitude: 120.7654321),
            distanceKm: 0.6,
            coordinates: [
                CLLocationCoordinate2D(latitude: 59.1234567, longitude: 120.1234567),
                CLLocationCoordinate2D(latitude: 59.7654321, longitude: 120.7654321),
            ],
            midpoint: nil,
            startDistanceKm: 0,
            endDistanceKm: 0.6
        )

        let gpx = RouteExport.gpx(from: [section], routeName: "Precision")

        XCTAssertTrue(gpx.contains("<trkpt lat=\"59.1234567\" lon=\"120.1234567\"></trkpt>"))
        XCTAssertTrue(gpx.contains("<trkpt lat=\"59.7654321\" lon=\"120.7654321\"></trkpt>"))
    }

    func testGpxFileNameMatchesWebNormalizationParity() {
        XCTAssertEqual(RouteExport.fileName(for: "Nordmarka Route 7"), "nordmarka-route-7.gpx")
        XCTAssertEqual(RouteExport.fileName(for: "  "), "cc-maps-route.gpx")
        XCTAssertEqual(RouteExport.fileName(for: "A&B"), "a-b.gpx")
        XCTAssertEqual(RouteExport.fileName(for: "__Oslo---Loop__"), "oslo-loop.gpx")
    }

    func testRouteSummaryReflectsDistanceSectionCountAndUnavailableElevation() {
        let summary = RouteSummary.from(sections: [
            PlanningSection(
                trailID: "101",
                edgeID: Self.edgeA,
                start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                distanceKm: 1.25,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                ],
                midpoint: nil,
                startDistanceKm: 0,
                endDistanceKm: 1.25
            ),
            PlanningSection(
                trailID: "202",
                edgeID: Self.edgeB,
                start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.77),
                distanceKm: 2.5,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.77),
                ],
                midpoint: nil,
                startDistanceKm: 1.25,
                endDistanceKm: 3.75
            ),
        ])

        XCTAssertEqual(summary.sectionCount, 2)
        XCTAssertEqual(summary.totalDistanceKm, 3.75, accuracy: 0.0001)
        XCTAssertNil(summary.ascentMeters)
        XCTAssertNil(summary.descentMeters)
    }

    // MARK: BrowseViewModel planning-mode transition tests

    @MainActor
    func testPlanningModeDefaultsToOff() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        XCTAssertFalse(viewModel.isInPlanningMode)
    }

    @MainActor
    func testEnterPlanningModeSetsFlag() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        XCTAssertTrue(viewModel.isInPlanningMode)
    }

    @MainActor
    func testExitPlanningModeResetsFlag() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        viewModel.exitPlanningMode()
        XCTAssertFalse(viewModel.isInPlanningMode)
    }

    @MainActor
    func testExitPlanningModeDoesNotClearRoute() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.exitPlanningMode()

        XCTAssertFalse(viewModel.routePlan.isEmpty, "Route must survive planning-mode exit")
        XCTAssertFalse(viewModel.isInPlanningMode)
    }

    @MainActor
    func testTrailTapInspectWhenPlanningModeOff() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        XCTAssertFalse(viewModel.isInPlanningMode)
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", anchorEdgeID: Self.edgeA, segment: nil))

        XCTAssertEqual(viewModel.selectedTrailID, "trail-1", "Tap must open inspect when planning is off")
        XCTAssertTrue(viewModel.routePlan.isEmpty, "Route must remain empty when planning is off")
    }

    @MainActor
    func testTrailTapEditsRouteWhenPlanningModeOn() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", anchorEdgeID: Self.edgeA, segment: nil))

        XCTAssertNil(viewModel.selectedTrailID, "Inspect selection must be nil when planning mode is on")
        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeA], "Trail must be added to plan")
    }

    @MainActor
    func testEnterPlanningModeClearsInspectSelection() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.selectTrail(id: "trail-1")
        XCTAssertEqual(viewModel.selectedTrailID, "trail-1")

        viewModel.enterPlanningMode()
        XCTAssertNil(viewModel.selectedTrailID, "Entering planning mode must dismiss inspect selection")
    }

    @MainActor
    func testEnterPlanningModeRequestsRefitForExistingRoute() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.exitPlanningMode()
        XCTAssertEqual(viewModel.fitRequestID, 1)

        viewModel.enterPlanningMode()

        XCTAssertEqual(viewModel.fitRequestID, 2)
    }

    @MainActor
    func testExitPlanningModeRequestsRefitForExistingRoute() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", anchorEdgeID: Self.edgeA, segment: nil))
        XCTAssertEqual(viewModel.fitRequestID, 0)

        viewModel.exitPlanningMode()

        XCTAssertEqual(viewModel.fitRequestID, 1)
    }

    @MainActor
    func testOrderedAnchorSequenceInPlanningMode() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-A", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-B", anchorEdgeID: Self.edgeB, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-C", anchorEdgeID: Self.edgeC, segment: nil))

        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeA, Self.edgeB, Self.edgeC])
    }

    @MainActor
    func testReverseRouteViaViewModel() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        for (trailID, edgeID) in [("trail-A", Self.edgeA), ("trail-B", Self.edgeB), ("trail-C", Self.edgeC)] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: trailID, anchorEdgeID: edgeID, segment: nil))
        }

        viewModel.reverseRoute()
        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeC, Self.edgeB, Self.edgeA])
    }

    @MainActor
    func testClearRouteViaViewModel() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        for (trailID, edgeID) in [("trail-A", Self.edgeA), ("trail-B", Self.edgeB)] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: trailID, anchorEdgeID: edgeID, segment: nil))
        }

        viewModel.clearRoute()
        XCTAssertTrue(viewModel.routePlan.isEmpty)
    }

    @MainActor
    func testRemoveRouteAnchorAtIndexViaViewModel() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        for (trailID, edgeID) in [("trail-A", Self.edgeA), ("trail-B", Self.edgeB), ("trail-C", Self.edgeC)] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: trailID, anchorEdgeID: edgeID, segment: nil))
        }

        viewModel.removeRouteAnchor(at: 1)
        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeA, Self.edgeC])
    }

    @MainActor
    func testSelectingPlannedSectionSetsHighlightAndFocusRequest() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    try makeTrailSegment(id: 303, destinationId: 1, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
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

        await waitUntil { viewModel.trailsPhase == .success }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "303", anchorEdgeID: Self.edgeC, segment: nil))

        let plannedSections = GeoMath.planningSections(
            for: viewModel.routePlan.anchorEdgeIDs,
            allTrails: viewModel.primaryTrails + viewModel.previewTrails
        )

        guard let expectedSection = plannedSections.first else {
            return XCTFail("Expected at least one planned section")
        }

        viewModel.selectPlannedSection(edgeID: expectedSection.edgeID)

                guard let actualFirstCoordinate = viewModel.focusedPlannedSectionCoordinates.first,
                            let expectedFirstCoordinate = expectedSection.coordinates.first,
                            let actualLastCoordinate = viewModel.focusedPlannedSectionCoordinates.last,
                            let expectedLastCoordinate = expectedSection.coordinates.last else {
                        return XCTFail("Expected planned section focus coordinates")
                }

        XCTAssertEqual(viewModel.selectedPlannedSectionEdgeID, expectedSection.edgeID)
        XCTAssertEqual(viewModel.plannedSectionFocusRequestID, 1)
        XCTAssertEqual(viewModel.focusedPlannedSectionCoordinates.count, expectedSection.coordinates.count)
                XCTAssertEqual(actualFirstCoordinate.latitude, expectedFirstCoordinate.latitude, accuracy: 0.000001)
                XCTAssertEqual(actualFirstCoordinate.longitude, expectedFirstCoordinate.longitude, accuracy: 0.000001)
                XCTAssertEqual(actualLastCoordinate.latitude, expectedLastCoordinate.latitude, accuracy: 0.000001)
                XCTAssertEqual(actualLastCoordinate.longitude, expectedLastCoordinate.longitude, accuracy: 0.000001)
    }

    @MainActor
    func testRouteEditClearsSelectedPlannedSection() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
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

        await waitUntil { viewModel.trailsPhase == .success }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        let expectedSection = GeoMath.planningSections(
            for: viewModel.routePlan.anchorEdgeIDs,
            allTrails: viewModel.primaryTrails + viewModel.previewTrails
        )[0]

        viewModel.selectPlannedSection(at: 0)

        XCTAssertEqual(viewModel.selectedPlannedSectionEdgeID, expectedSection.edgeID)

        viewModel.reverseRoute()

        XCTAssertNil(viewModel.selectedPlannedSectionEdgeID)
        XCTAssertTrue(viewModel.focusedPlannedSectionCoordinates.isEmpty)
    }

    @MainActor
    func testSelectingPlannedSectionByEdgeIDAfterReverseUsesCanonicalSection() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    try makeTrailSegment(id: 303, destinationId: 1, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
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

        await waitUntil { viewModel.trailsPhase == .success }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "303", anchorEdgeID: Self.edgeC, segment: nil))

        viewModel.reverseRoute()

        let reversedSections = GeoMath.planningSections(
            for: viewModel.routePlan.anchorEdgeIDs,
            allTrails: viewModel.primaryTrails + viewModel.previewTrails
        )
        let targetSection = reversedSections[0]

        viewModel.selectPlannedSection(edgeID: targetSection.edgeID)

                guard let actualFirstCoordinate = viewModel.focusedPlannedSectionCoordinates.first,
                            let expectedFirstCoordinate = targetSection.coordinates.first,
                            let actualLastCoordinate = viewModel.focusedPlannedSectionCoordinates.last,
                            let expectedLastCoordinate = targetSection.coordinates.last else {
                        return XCTFail("Expected planned section focus coordinates after reverse")
                }

        XCTAssertEqual(viewModel.selectedPlannedSectionEdgeID, targetSection.edgeID)
                XCTAssertEqual(viewModel.focusedPlannedSectionCoordinates.count, targetSection.coordinates.count)
                XCTAssertEqual(actualFirstCoordinate.latitude, expectedFirstCoordinate.latitude, accuracy: 0.000001)
                XCTAssertEqual(actualFirstCoordinate.longitude, expectedFirstCoordinate.longitude, accuracy: 0.000001)
                XCTAssertEqual(actualLastCoordinate.latitude, expectedLastCoordinate.latitude, accuracy: 0.000001)
                XCTAssertEqual(actualLastCoordinate.longitude, expectedLastCoordinate.longitude, accuracy: 0.000001)
    }

    @MainActor
    func testDestinationChangeExitsPlanningModeAndClearsRoute() async throws {
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
            timingConfig: .immediate
        )
        viewModel.start()

        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil { viewModel.trailsPhase == .success }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-A", anchorEdgeID: Self.edgeA, segment: nil))
        XCTAssertTrue(viewModel.isInPlanningMode)
        XCTAssertFalse(viewModel.routePlan.isEmpty)

        viewModel.selectDestination(id: "2", manual: true)

        XCTAssertFalse(viewModel.isInPlanningMode, "Planning mode must exit on destination change")
        XCTAssertTrue(viewModel.routePlan.isEmpty, "Route must clear on destination change (destination-scoped)")
    }

    @MainActor
    func testStoredRouteRestoresAndLoadsRequiredPreviewDestination() async throws {
        let suiteName = "PlanningContractTests.StoredRouteRestoresAndLoadsRequiredPreviewDestination"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, Self.edgeC], destinationIds: ["1", "2"])
        )

        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91)],
                "2": [try makeTrailSegment(id: 303, destinationId: 2, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91)],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: false)
            )
        )

        viewModel.start()

        await waitUntil {
            viewModel.previewPhase == .success &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC]
        }

        XCTAssertTrue(apiClient.requestedDestinationIDs.contains("2"))
        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["1", "2"])
        XCTAssertFalse(viewModel.isInPlanningMode)
        XCTAssertNil(viewModel.routeHydrationNotice)
        XCTAssertEqual(viewModel.fitRequestID, 1)
    }

    @MainActor
    func testStoredRouteReopensPlanningModeWhenLastBrowseStateWasPlanning() async throws {
        let suiteName = "PlanningContractTests.StoredRouteReopensPlanningModeWhenLastBrowseStateWasPlanning"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, Self.edgeC], destinationIds: ["1", "2"])
        )

        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522),
                makeDestination(id: "2", name: "Lillehammer", latitude: 61.1153, longitude: 10.4662),
            ],
            trailsByDestination: [
                "1": [try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91)],
                "2": [try makeTrailSegment(id: 303, destinationId: 2, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91)],
            ]
        )
        let browseSettingsStore = InMemoryBrowseSettingsStore(
            settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: true)
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: browseSettingsStore
        )

        viewModel.start()

        await waitUntil {
            viewModel.previewPhase == .success &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC] &&
                viewModel.isInPlanningMode
        }

        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["1", "2"])
        XCTAssertNil(viewModel.routeHydrationNotice)
        XCTAssertEqual(viewModel.fitRequestID, 1)
    }

    @MainActor
    func testBrowseFocusChangePreservesCanonicalRouteOwnerDuringMultiDestinationRoute() async throws {
        let suiteName = "PlanningContractTests.BrowseFocusChangePreservesCanonicalRouteOwnerDuringMultiDestinationRoute"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.78),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 2, destinationId: 100, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 3, destinationId: 200, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "100", manual: true)
        await waitUntil { viewModel.primaryTrails.count == 2 }
        await waitUntil { viewModel.previewTrails.count == 1 }

        // Build a two-destination route starting from destination "100".
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "1", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "3", anchorEdgeID: Self.edgeC, segment: nil))

        // Browse focus switches to "200" (the tapped trail's destination), but canonical owner stays "100".
        await waitUntil {
            viewModel.selectedDestinationID == "200" &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC]
        }

        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["100", "200"], "Owner-first invariant: owner 100 must remain first even after focus switches to 200")
        XCTAssertNil(routePlanStore.readRoutePlan(for: "200"), "Route must never be stored under the browse-focus destination")
        XCTAssertEqual(
            routePlanStore.readRoutePlan(for: "100"),
            CanonicalRoutePlan(destinationId: "100", anchorEdgeIds: [Self.edgeA, Self.edgeC], destinationIds: ["100", "200"]),
            "Route must be stored under the stable canonical owner"
        )

        // Adding a trail from the original owner destination should keep canonical owner stable.
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "2", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil {
            viewModel.selectedDestinationID == "100" &&
                Set(viewModel.routePlan.anchorEdgeIDs) == Set([Self.edgeA, Self.edgeB, Self.edgeC]) &&
                viewModel.activeRouteDestinationIDs == ["100", "200"]
        }

        XCTAssertEqual(
            routePlanStore.readRoutePlan(for: "100"),
            CanonicalRoutePlan(destinationId: "100", anchorEdgeIds: viewModel.routePlan.anchorEdgeIDs, destinationIds: ["100", "200"])
        )
    }

    @MainActor
    func testManualReselectingCurrentDestinationDoesNotClearActiveRoute() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.78),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 2, destinationId: 100, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 3, destinationId: 200, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "100", manual: true)
        await waitUntil { viewModel.primaryTrails.count == 2 }
        await waitUntil { viewModel.previewTrails.count == 1 }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "1", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "3", anchorEdgeID: Self.edgeC, segment: nil))

        await waitUntil {
            viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC] &&
                viewModel.selectedDestinationID == "200"
        }

        viewModel.selectDestination(id: "200", manual: true)

        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeA, Self.edgeC])
        XCTAssertEqual(viewModel.selectedDestinationID, "200")
        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["100", "200"], "Owner-first invariant: owner 100 must remain first even when browse focus is on 200")
    }

    @MainActor
    func testManualSelectingRouteParticipatingDestinationDoesNotClearActiveRoute() async throws {
        let suiteName = "PlanningContractTests.ManualSelectingRouteParticipatingDestinationDoesNotClearActiveRoute"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.78),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 2, destinationId: 100, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 3, destinationId: 200, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "100", manual: true)
        await waitUntil { viewModel.primaryTrails.count == 2 }
        await waitUntil { viewModel.previewTrails.count == 1 }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "1", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "3", anchorEdgeID: Self.edgeC, segment: nil))

        await waitUntil {
            viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC] &&
                viewModel.selectedDestinationID == "200"
        }

        viewModel.selectDestination(id: "100", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "100" &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC]
        }

        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["100", "200"])
        XCTAssertEqual(
            routePlanStore.readRoutePlan(for: "100"),
            CanonicalRoutePlan(destinationId: "100", anchorEdgeIds: [Self.edgeA, Self.edgeC], destinationIds: ["100", "200"])
        )
    }

    @MainActor
    func testBrowseFocusChangeDoesNotMutateCanonicalRouteOwner() async throws {
        let fixture: FocusChangeStableOwnerFixture = try FixtureLoader.decode("route-plan/focus-change-stable-owner.v2.json")

        let userDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        // Trail setup mirrors the fixture: edgeA belongs to dest 100, edgeB belongs to dest 200.
        // This produces destinationIds ["100", "200"] with owner "100" once both anchors are added.
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.77),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 2, destinationId: 200, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "100", manual: true)
        await waitUntil { viewModel.primaryTrails.count == 1 }
        await waitUntil { viewModel.previewTrails.count == 1 }

        // Build the two-anchor route from the fixture (edgeA from dest 100, edgeB from dest 200).
        // Adding edgeB triggers a browse-focus switch to dest "200" (the tapped trail's destination).
        viewModel.enterPlanningMode()
        fixture.canonicalOwner.anchorEdgeIds.forEach { anchorEdgeID in
            let trailID = apiClient.trailID(for: anchorEdgeID)
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: trailID, anchorEdgeID: anchorEdgeID, segment: nil))
        }

        // Browse focus is now on dest "200" (fixture.browseFocusDestinationId).
        await waitUntil {
            viewModel.routePlan.anchorEdgeIDs == fixture.canonicalOwner.anchorEdgeIds &&
                viewModel.selectedDestinationID == fixture.browseFocusDestinationId
        }

        // Canonical route owner must be unchanged after the browse-focus switch.
        let canonicalAfterFocusChange = try XCTUnwrap(viewModel.canonicalRoutePlan)
        XCTAssertEqual(
            canonicalAfterFocusChange,
            fixture.expectedCanonicalAfterFocusChange,
            "Canonical route plan must remain unchanged after browse-focus changes"
        )
        XCTAssertEqual(
            canonicalAfterFocusChange.destinationId,
            fixture.canonicalOwner.destinationId,
            "destinationId must remain the stable route owner, not the browse-focus destination"
        )
        XCTAssertEqual(
            canonicalAfterFocusChange.destinationIds.first,
            fixture.canonicalOwner.destinationId,
            "destinationIds must remain owner-first after browse-focus change"
        )
        XCTAssertEqual(
            canonicalAfterFocusChange.encodedForURL,
            fixture.expectedUrlAfterFocusChange,
            "URL encoding must reflect stable owner and owner-first destinationIds"
        )
        XCTAssertNil(
            routePlanStore.readRoutePlan(for: fixture.browseFocusDestinationId),
            "Route must never be persisted under a browse-focus destination"
        )
        XCTAssertNotNil(
            routePlanStore.readRoutePlan(for: fixture.canonicalOwner.destinationId),
            "Route must remain persisted under the stable canonical owner"
        )
    }

    @MainActor
    func testStoredPartialRouteRestoresValidAnchorsAndSurfacesWarning() async throws {
        let suiteName = "PlanningContractTests.StoredPartialRouteRestoresValidAnchorsAndSurfacesWarning"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, "missing-edge", Self.edgeC], destinationIds: ["1"])
        )

        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 303, destinationId: 1, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: false)
            )
        )

        viewModel.start()

        await waitUntil {
            viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC] && viewModel.routeHydrationNotice != nil
        }

        XCTAssertEqual(viewModel.routeHydrationNotice, .partial(staleAnchorEdgeIDs: ["missing-edge"]))
        XCTAssertEqual(viewModel.activeRouteDestinationIDs, ["1"])
    }

    @MainActor
    func testStoredRouteRestoresWhenBrowseFocusIsParticipatingNonOwnerDestination() async throws {
        let suiteName = "PlanningContractTests.StoredRouteRestoresWhenBrowseFocusIsParticipatingNonOwnerDestination"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        let storedRoutePlan = CanonicalRoutePlan(
            destinationId: "100",
            anchorEdgeIds: [Self.edgeA, Self.edgeC],
            destinationIds: ["100", "200"]
        )
        routePlanStore.writeRoutePlan(storedRoutePlan)

        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.78),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 2, destinationId: 100, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 3, destinationId: 200, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(
                    destinationID: "200",
                    mapRegion: nil,
                    isPlanningModeActive: true,
                    activeRouteOwnerDestinationID: "100"
                )
            )
        )

        viewModel.start()

        await waitUntil {
            viewModel.selectedDestinationID == "200" &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeC] &&
                viewModel.activeRouteDestinationIDs == ["100", "200"] &&
                viewModel.isInPlanningMode
        }

        XCTAssertEqual(viewModel.canonicalRoutePlan, storedRoutePlan)
        XCTAssertEqual(viewModel.selectedDestinationID, "200")
        XCTAssertNil(viewModel.routeHydrationNotice)
        XCTAssertEqual(routePlanStore.readRoutePlan(for: "100"), storedRoutePlan)
        XCTAssertNil(routePlanStore.readRoutePlan(for: "200"))
    }

    @MainActor
    func testIncomingUrlHydratesRouteForSharedLink() async throws {
        let suiteName = "PlanningContractTests.IncomingUrlHydratesRouteForSharedLink"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: true)
            )
        )

        viewModel.start()

        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)

        await waitUntil { viewModel.trailsPhase == .success }

        let encodedRoute = CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, Self.edgeB], destinationIds: ["1"]).encodedForURL
        viewModel.handleIncomingURL(URL(string: "ccmaps://open?route=\(encodedRoute!)")!)

        await waitUntil {
            viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeB] && viewModel.isInPlanningMode
        }

        XCTAssertEqual(routePlanStore.readRoutePlan(for: "1")?.anchorEdgeIds, [Self.edgeA, Self.edgeB])
    }

    @MainActor
    func testIncomingEmptySharedLinkDoesNotClearStoredRoute() async throws {
        let suiteName = "PlanningContractTests.IncomingEmptySharedLinkDoesNotClearStoredRoute"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, Self.edgeB], destinationIds: ["1"])
        )

        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: false)
            )
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil {
            viewModel.previewPhase == .success &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeB]
        }

        let encodedRoute = CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: ["missing-edge"], destinationIds: ["1"]).encodedForURL
        viewModel.handleIncomingURL(URL(string: "ccmaps://open?route=\(encodedRoute!)")!)

        await waitUntil {
            viewModel.routeHydrationNotice == .empty(staleAnchorEdgeIDs: ["missing-edge"])
        }

        XCTAssertEqual(routePlanStore.readRoutePlan(for: "1")?.anchorEdgeIds, [Self.edgeA, Self.edgeB])
    }

    @MainActor
    func testSelectedPlannedSegmentShowsRouteAwareDetailOutsidePlanningMode() async throws {
        let suiteName = "PlanningContractTests.SelectedPlannedSegmentShowsRouteAwareDetailOutsidePlanningMode"
        let userDefaults = try makeCleanUserDefaultsSuite(named: suiteName)
        let routePlanStore = UserDefaultsRoutePlanStore(userDefaults: userDefaults)
        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(destinationId: "1", anchorEdgeIds: [Self.edgeA, Self.edgeB], destinationIds: ["1"])
        )

        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: routePlanStore,
            browseSettingsStore: InMemoryBrowseSettingsStore(
                settings: BrowseSettings(destinationID: "1", mapRegion: nil, isPlanningModeActive: false)
            )
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil {
            viewModel.previewPhase == .success &&
                viewModel.routePlan.anchorEdgeIDs == [Self.edgeA, Self.edgeB]
        }

        let allTrails = viewModel.primaryTrails + viewModel.previewTrails

        let plannedSections = GeoMath.planningSections(
            for: viewModel.routePlan.anchorEdgeIDs,
            allTrails: allTrails
        )

        XCTAssertEqual(plannedSections.count, 2)

        let selectedSection = try XCTUnwrap(plannedSections.last)

        viewModel.exitPlanningMode()
        viewModel.selectTrail(
            selection: TrailInspectionSelection(
                trailID: selectedSection.trailID,
                anchorEdgeID: nil,
                segment: TrailSegment(
                    startDistanceKm: selectedSection.startDistanceKm,
                    endDistanceKm: selectedSection.endDistanceKm,
                    distanceKm: selectedSection.distanceKm,
                    midpoint: selectedSection.midpoint
                )
            )
        )

        let routeContext = try XCTUnwrap(viewModel.selectedRouteDetailContext)

        XCTAssertFalse(viewModel.isInPlanningMode)
        XCTAssertEqual(routeContext.selectedSectionNumber, 2)
        XCTAssertEqual(routeContext.totalSections, 2)
        XCTAssertEqual(routeContext.totalDistanceKm, viewModel.routeSummary.totalDistanceKm, accuracy: 0.0001)
        XCTAssertNil(routeContext.ascentMeters)
        XCTAssertNil(routeContext.selectedSectionElevation)
        XCTAssertEqual(viewModel.routePlan.anchorEdgeIDs, [Self.edgeA, Self.edgeB])
    }

    // MARK: - Elevation integration tests

    func testRouteSummaryFromSectionsWithElevationResponseShowsAscentAndDescent() throws {
        let elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 450, descentMeters: 230)),
            sections: []
        )
        let sections = [
            PlanningSection(
                trailID: "101",
                edgeID: Self.edgeA,
                start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                distanceKm: 1.25,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                ],
                midpoint: nil,
                startDistanceKm: 0,
                endDistanceKm: 1.25
            ),
        ]

        let summary = RouteSummary.from(sections: sections, elevationResponse: elevationResponse)

        XCTAssertEqual(try XCTUnwrap(summary.ascentMeters), 450, accuracy: 0.01)
        XCTAssertEqual(try XCTUnwrap(summary.descentMeters), 230, accuracy: 0.01)
        XCTAssertEqual(summary.formattedElevationLabel, "↑ 450 m  ↓ 230 m")
    }

    func testRouteSummaryElevationUnavailableWhenResponseIsNil() {
        let sections = [
            PlanningSection(
                trailID: "101",
                edgeID: Self.edgeA,
                start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                distanceKm: 1.25,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                ],
                midpoint: nil,
                startDistanceKm: 0,
                endDistanceKm: 1.25
            ),
        ]

        let summary = RouteSummary.from(sections: sections, elevationResponse: nil)

        XCTAssertNil(summary.ascentMeters)
        XCTAssertNil(summary.descentMeters)
        XCTAssertNil(summary.formattedElevationLabel)
    }

    func testRouteSummaryElevationUnavailableWhenRouteStatusIsUnavailable() {
        let elevationResponse = ElevationApiResponse(
            status: "partial",
            route: ElevationResult(status: "unavailable", metrics: nil),
            sections: []
        )
        let sections = [
            PlanningSection(
                trailID: "101",
                edgeID: Self.edgeA,
                start: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                end: CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                distanceKm: 1.25,
                coordinates: [
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.75),
                    CLLocationCoordinate2D(latitude: 59.91, longitude: 10.76),
                ],
                midpoint: nil,
                startDistanceKm: 0,
                endDistanceKm: 1.25
            ),
        ]

        let summary = RouteSummary.from(sections: sections, elevationResponse: elevationResponse)

        XCTAssertNil(summary.ascentMeters)
        XCTAssertNil(summary.descentMeters)
        XCTAssertNil(summary.formattedElevationLabel)
    }

    func testRouteLevelElevationFormattingRequiresBothAscentAndDescent() {
        let summary = RouteSummary(
            sectionCount: 2,
            totalDistanceKm: 3.75,
            ascentMeters: 450,
            descentMeters: nil
        )
        let routeContext = RouteAwareTrailDetailContext(
            selectedSectionNumber: 1,
            totalSections: 2,
            totalDistanceKm: 3.75,
            ascentMeters: 450,
            descentMeters: nil,
            selectedSectionElevation: nil
        )
        let sectionElevation = SectionElevationSummary(status: "ok", ascentMeters: 65, descentMeters: nil)

        XCTAssertNil(summary.formattedElevationLabel)
        XCTAssertNil(routeContext.formattedElevationLabel)
        XCTAssertNil(sectionElevation.formattedElevationLabel)
    }

    func testRouteAwareDetailUsesUnavailableCopyWhenSelectedSectionElevationIsMissing() {
        let routeContext = RouteAwareTrailDetailContext(
            selectedSectionNumber: 2,
            totalSections: 3,
            totalDistanceKm: 5.2,
            ascentMeters: 300,
            descentMeters: 150,
            selectedSectionElevation: SectionElevationSummary(
                status: "unavailable",
                ascentMeters: nil,
                descentMeters: nil
            )
        )

        XCTAssertNil(routeContext.formattedSelectedSectionElevationLabel)
        XCTAssertEqual(
            routeContext.selectedSectionElevationDetailLabel,
            RouteAwareTrailDetailContext.sectionElevationUnavailableNote
        )
    }

    func testElevationResponseReturnsSectionElevationSummaryForSectionKey() throws {
        let elevationResponse = ElevationApiResponse(
            status: "partial",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 450, descentMeters: 230)),
            sections: [
                ElevationSectionResult(
                    sectionKey: Self.edgeA,
                    status: "ok",
                    metrics: ElevationMetrics(ascentMeters: 65, descentMeters: 65)
                ),
                ElevationSectionResult(
                    sectionKey: Self.edgeB,
                    status: "unavailable",
                    metrics: nil
                )
            ]
        )

        let sectionElevation = try XCTUnwrap(elevationResponse.sectionElevation(for: Self.edgeA))
        XCTAssertEqual(try XCTUnwrap(sectionElevation.ascentMeters), 65, accuracy: 0.01)
        XCTAssertEqual(try XCTUnwrap(sectionElevation.descentMeters), 65, accuracy: 0.01)
        XCTAssertEqual(sectionElevation.formattedElevationLabel, "↑ 65 m  ↓ 65 m")

        let unavailableSection = try XCTUnwrap(elevationResponse.sectionElevation(for: Self.edgeB))
        XCTAssertNil(unavailableSection.formattedElevationLabel)
    }

    @MainActor
    func testViewModelRequestsElevationAfterAnchorUpdate() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 300, descentMeters: 150)),
            sections: []
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil {
            viewModel.routeElevation != nil && viewModel.plannedSections.count == 2
        }

        XCTAssertEqual(try XCTUnwrap(viewModel.routeSummary.ascentMeters), 300, accuracy: 0.01)
        XCTAssertEqual(try XCTUnwrap(viewModel.routeSummary.descentMeters), 150, accuracy: 0.01)
    }

    @MainActor
    func testViewModelElevationClearsOnRouteCleared() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 200, descentMeters: 100)),
            sections: []
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))

        await waitUntil { apiClient.elevationCallCount > 0 }

        viewModel.clearRoute()
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(viewModel.routeElevation)
        XCTAssertTrue(viewModel.routePlan.isEmpty)
        XCTAssertNil(viewModel.routeSummary.ascentMeters)
    }

    @MainActor
    func testViewModelElevationUnavailableWhenFetchFails() async throws {
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationShouldThrow = true

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))

        await waitUntil { apiClient.elevationCallCount > 0 }
        // Give the Task a chance to settle after the throw
        try await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertNil(viewModel.routeElevation)
        XCTAssertNil(viewModel.routeSummary.ascentMeters)
    }

    @MainActor
    func testViewModelClearsStaleRouteElevationImmediatelyWhenSchedulingReplacementFetch() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 300, descentMeters: 150)),
            sections: []
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))

        await waitUntil(timeoutNanoseconds: 3_000_000_000) {
            viewModel.routeSummary.ascentMeters == 300 &&
                viewModel.routeSummary.descentMeters == 150 &&
                viewModel.plannedSections.count == 1
        }
        XCTAssertEqual(try XCTUnwrap(viewModel.routeSummary.ascentMeters), 300, accuracy: 0.01)

        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 420, descentMeters: 210)),
            sections: []
        )
        apiClient.queuedElevationResponseDelaysNanoseconds = [200_000_000]

        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        XCTAssertNil(viewModel.routeElevation)
        XCTAssertNil(viewModel.routeSummary.ascentMeters)
        XCTAssertNil(viewModel.routeSummary.descentMeters)

        await waitUntil(timeoutNanoseconds: 3_000_000_000) {
            viewModel.routeSummary.ascentMeters == 420 &&
                viewModel.routeSummary.descentMeters == 210
        }

        XCTAssertEqual(try XCTUnwrap(viewModel.routeSummary.ascentMeters), 420, accuracy: 0.01)
        XCTAssertEqual(try XCTUnwrap(viewModel.routeSummary.descentMeters), 210, accuracy: 0.01)
    }

    @MainActor
    func testSelectedRouteDetailContextIncludesSelectedSectionElevation() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 300, descentMeters: 150)),
            sections: [
                ElevationSectionResult(sectionKey: Self.edgeA, status: "ok", metrics: ElevationMetrics(ascentMeters: 40, descentMeters: 15)),
                ElevationSectionResult(sectionKey: Self.edgeB, status: "ok", metrics: ElevationMetrics(ascentMeters: 65, descentMeters: 65)),
            ]
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil(timeoutNanoseconds: 3_000_000_000) {
            viewModel.routeSummary.ascentMeters == 300 &&
                viewModel.routeSummary.descentMeters == 150 &&
                viewModel.plannedSections.count == 2
        }

        let selectedSection = try XCTUnwrap(viewModel.plannedSections.last)

        viewModel.exitPlanningMode()
        viewModel.selectTrail(
            selection: TrailInspectionSelection(
                trailID: selectedSection.trailID,
                anchorEdgeID: nil,
                segment: TrailSegment(
                    startDistanceKm: selectedSection.startDistanceKm,
                    endDistanceKm: selectedSection.endDistanceKm,
                    distanceKm: selectedSection.distanceKm,
                    midpoint: selectedSection.midpoint
                )
            )
        )

        let routeContext = try XCTUnwrap(viewModel.selectedRouteDetailContext)
        let expectedSectionElevationLabel = try XCTUnwrap(
            apiClient.elevationResponse?
                .sectionElevation(for: selectedSection.edgeID)?
                .formattedElevationLabel
        )

        XCTAssertEqual(routeContext.formattedElevationLabel, "↑ 300 m  ↓ 150 m")
        XCTAssertEqual(routeContext.formattedSelectedSectionElevationLabel, expectedSectionElevationLabel)
    }

    @MainActor
    func testSelectedRouteDetailContextUsesAnchorEdgeFallbackForSectionElevation() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "ok",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 300, descentMeters: 150)),
            sections: [
                ElevationSectionResult(sectionKey: Self.edgeA, status: "ok", metrics: ElevationMetrics(ascentMeters: 40, descentMeters: 15)),
                ElevationSectionResult(sectionKey: Self.edgeB, status: "ok", metrics: ElevationMetrics(ascentMeters: 65, descentMeters: 65)),
            ]
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil(timeoutNanoseconds: 3_000_000_000) {
            viewModel.routeSummary.ascentMeters == 300 &&
                viewModel.routeSummary.descentMeters == 150 &&
                viewModel.plannedSections.count == 2
        }

        let selectedSection = try XCTUnwrap(viewModel.plannedSections.last)

        viewModel.exitPlanningMode()
        viewModel.selectTrail(
            selection: TrailInspectionSelection(
                trailID: selectedSection.trailID,
                anchorEdgeID: selectedSection.edgeID,
                segment: nil
            )
        )

        let routeContext = try XCTUnwrap(viewModel.selectedRouteDetailContext)

        XCTAssertEqual(routeContext.formattedSelectedSectionElevationLabel, "↑ 65 m  ↓ 65 m")
    }

    @MainActor
    func testSelectedRouteDetailContextUsesUnavailableSectionElevationCopy() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
            trailsByDestination: [
                "1": [
                    try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 202, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
            ]
        )
        apiClient.elevationResponse = ElevationApiResponse(
            status: "partial",
            route: ElevationResult(status: "ok", metrics: ElevationMetrics(ascentMeters: 300, descentMeters: 150)),
            sections: [
                ElevationSectionResult(sectionKey: Self.edgeA, status: "ok", metrics: ElevationMetrics(ascentMeters: 40, descentMeters: 15)),
                ElevationSectionResult(sectionKey: Self.edgeB, status: "unavailable", metrics: nil),
            ]
        )

        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore()
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "202", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil { viewModel.routeElevation != nil }

        let selectedSection = try XCTUnwrap(viewModel.plannedSections.last)

        viewModel.exitPlanningMode()
        viewModel.selectTrail(
            selection: TrailInspectionSelection(
                trailID: selectedSection.trailID,
                anchorEdgeID: selectedSection.edgeID,
                segment: nil
            )
        )

        let routeContext = try XCTUnwrap(viewModel.selectedRouteDetailContext)

        XCTAssertEqual(routeContext.formattedElevationLabel, "↑ 300 m  ↓ 150 m")
        XCTAssertNil(routeContext.formattedSelectedSectionElevationLabel)
        XCTAssertEqual(routeContext.selectedSectionElevation?.status, "unavailable")
        XCTAssertEqual(
            routeContext.selectedSectionElevationDetailLabel,
            RouteAwareTrailDetailContext.sectionElevationUnavailableNote
        )
    }

    @MainActor
    func testWatchTransferAvailabilityTracksPrerequisiteStates() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let watchTransferService = WatchRouteTransferServiceSpy()
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(
                destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                trailsByDestination: [
                    "1": [
                        try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                        try makeTrailSegment(id: 102, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    ],
                ]
            ),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore(),
            watchTransferService: watchTransferService
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }

        XCTAssertEqual(viewModel.watchTransferAvailability, .unavailableNoPairedWatch)

        watchTransferService.pushSessionState(.init(isSupported: true, isPaired: true, isWatchAppInstalled: false, isSessionReady: false))
        await waitUntil { viewModel.watchTransferAvailability == .unavailableWatchAppMissing }
        XCTAssertEqual(viewModel.watchTransferAvailability, .unavailableWatchAppMissing)

        watchTransferService.pushSessionState(.init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: false))
        await waitUntil { viewModel.watchTransferAvailability == .unavailableNoActiveRoute }
        XCTAssertEqual(viewModel.watchTransferAvailability, .unavailableNoActiveRoute)

        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "102", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil { viewModel.watchTransferAvailability == .temporarilyUnavailableSessionNotReady }

        XCTAssertEqual(viewModel.watchTransferAvailability, .temporarilyUnavailableSessionNotReady)

        watchTransferService.pushSessionState(.init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: true))
        await waitUntil { viewModel.watchTransferAvailability == .ready }
        XCTAssertEqual(viewModel.watchTransferAvailability, .ready)
    }

    @MainActor
    func testWatchTransferEnvelopeMatchesSharedFixture() async throws {
        let fixture: WatchTransferEnvelopeFixture = try FixtureLoader.decode("route-plan/transfer-derived-watch.v2.json")
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let apiClient = BrowseAPISpy(
            destinationsResponse: [
                makeDestination(id: "100", name: "Primary plus preview sector", latitude: 59.91, longitude: 10.75),
                makeDestination(id: "200", name: "Preview sector", latitude: 59.91, longitude: 10.78),
            ],
            trailsByDestination: [
                "100": [
                    try makeTrailSegment(id: 1, destinationId: 100, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                    try makeTrailSegment(id: 2, destinationId: 100, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                ],
                "200": [
                    try makeTrailSegment(id: 3, destinationId: 200, startLongitude: 10.77, startLatitude: 59.91, endLongitude: 10.78, endLatitude: 59.91),
                ],
            ]
        )
        let watchTransferService = WatchRouteTransferServiceSpy(
            sessionState: .init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: true)
        )
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore(),
            watchTransferService: watchTransferService
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "100", manual: true)
        await waitUntil { viewModel.primaryTrails.count == 2 }
        await waitUntil { viewModel.previewTrails.count == 1 }

        viewModel.enterPlanningMode()
        fixture.canonical.anchorEdgeIds.forEach { anchorEdgeID in
            let trailID = apiClient.trailID(for: anchorEdgeID)
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: trailID, anchorEdgeID: anchorEdgeID, segment: nil))
        }

        viewModel.sendRouteToWatch()

        let queuedEnvelope = try XCTUnwrap(watchTransferService.lastQueuedEnvelope)
        XCTAssertEqual(queuedEnvelope.version, fixture.version)
        XCTAssertEqual(queuedEnvelope.canonical, try XCTUnwrap(viewModel.canonicalRoutePlan))
        // routeLabel uses the stable canonical owner destination name, not the current browse-focus destination.
        XCTAssertEqual(queuedEnvelope.derived?.routeLabel, fixture.derived.routeLabel)
        XCTAssertEqual(queuedEnvelope.derived?.sectionSummaries, fixture.derived.sectionSummaries)
        XCTAssertEqual(queuedEnvelope.derived?.routeGeometry?.coordinates, fixture.derived.routeGeometry?.coordinates)
        XCTAssertTrue(
            Set(queuedEnvelope.derived?.sectionSummaries.map(\.destinationId) ?? []).isSubset(of: Set(queuedEnvelope.canonical.destinationIds))
        )
    }

    @MainActor
    func testWatchTransferUnavailableWhenASectionCannotResolveDestinationID() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let watchTransferService = WatchRouteTransferServiceSpy(
            sessionState: .init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: true)
        )
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(
                destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                trailsByDestination: [
                    "1": [
                        try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                        try makeTrailSegmentWithoutDestinationID(id: 102, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    ],
                ]
            ),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore(),
            watchTransferService: watchTransferService
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "102", anchorEdgeID: Self.edgeB, segment: nil))

        XCTAssertEqual(viewModel.watchTransferAvailability, .unavailableNoActiveRoute)

        viewModel.sendRouteToWatch()

        XCTAssertEqual(viewModel.watchTransferSendState, .failure("Add a route before sending it to Apple Watch."))
        XCTAssertNil(watchTransferService.lastQueuedEnvelope)
    }

    @MainActor
    func testWatchTransferSendTransitionsPendingThenSuccessAfterAcknowledgement() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let watchTransferService = WatchRouteTransferServiceSpy(
            sessionState: .init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: true)
        )
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(
                destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                trailsByDestination: [
                    "1": [
                        try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                        try makeTrailSegment(id: 102, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    ],
                ]
            ),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore(),
            watchTransferService: watchTransferService
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "102", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil { viewModel.watchTransferAvailability == .ready }

        viewModel.sendRouteToWatch()

        guard case .pending(let transferID) = viewModel.watchTransferSendState else {
            return XCTFail("Expected pending watch transfer state after queueing")
        }

        watchTransferService.sendAcknowledgement(
            WatchRouteTransferAcknowledgement(transferID: transferID, result: .success)
        )
        await waitUntil {
            if case .success(let acknowledgedTransferID) = viewModel.watchTransferSendState {
                return acknowledgedTransferID == transferID
            }

            return false
        }

        guard case .success(let acknowledgedTransferID) = viewModel.watchTransferSendState else {
            return XCTFail("Expected successful watch transfer acknowledgement")
        }

        XCTAssertEqual(acknowledgedTransferID, transferID)
    }

    @MainActor
    func testWatchTransferIgnoresStaleAcknowledgementsAfterResend() async throws {
        let routePlanUserDefaults = try makeCleanUserDefaultsSuite(named: "PlanningContractTests.\(#function)")
        let watchTransferService = WatchRouteTransferServiceSpy(
            sessionState: .init(isSupported: true, isPaired: true, isWatchAppInstalled: true, isSessionReady: true)
        )
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(
                destinationsResponse: [makeDestination(id: "1", name: "Oslo", latitude: 59.9139, longitude: 10.7522)],
                trailsByDestination: [
                    "1": [
                        try makeTrailSegment(id: 101, destinationId: 1, startLongitude: 10.75, startLatitude: 59.91, endLongitude: 10.76, endLatitude: 59.91),
                        try makeTrailSegment(id: 102, destinationId: 1, startLongitude: 10.76, startLatitude: 59.91, endLongitude: 10.77, endLatitude: 59.91),
                    ],
                ]
            ),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate,
            routePlanStore: UserDefaultsRoutePlanStore(userDefaults: routePlanUserDefaults),
            browseSettingsStore: InMemoryBrowseSettingsStore(),
            watchTransferService: watchTransferService
        )

        viewModel.start()
        await waitUntil { !viewModel.destinations.isEmpty }
        viewModel.selectDestination(id: "1", manual: true)
        await waitUntil { !viewModel.primaryTrails.isEmpty }
        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "101", anchorEdgeID: Self.edgeA, segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "102", anchorEdgeID: Self.edgeB, segment: nil))

        await waitUntil { viewModel.watchTransferAvailability == .ready }

        viewModel.sendRouteToWatch()
        guard case .pending(let firstTransferID) = viewModel.watchTransferSendState else {
            return XCTFail("Expected first transfer to be pending")
        }

        watchTransferService.sendError = WatchRouteTransferSendError.serializationFailed
        viewModel.sendRouteToWatch()
        XCTAssertEqual(viewModel.watchTransferSendState, .failure("The route could not be prepared for watch transfer."))

        watchTransferService.sendError = nil
        viewModel.sendRouteToWatch()

        guard case .pending(let secondTransferID) = viewModel.watchTransferSendState else {
            return XCTFail("Expected second transfer to be pending")
        }

        XCTAssertNotEqual(firstTransferID, secondTransferID)

        watchTransferService.sendAcknowledgement(
            WatchRouteTransferAcknowledgement(transferID: firstTransferID, result: .success)
        )
        await waitUntil {
            if case .pending(let pendingTransferID) = viewModel.watchTransferSendState {
                return pendingTransferID == secondTransferID
            }

            return false
        }
        XCTAssertEqual(viewModel.watchTransferSendState, .pending(transferID: secondTransferID))
    }
}

// MARK: - Fixture types

private struct SharedRoutePlanFixture: Decodable {
    let anchorEdgeIds: [String]
}

private struct CanonicalRoutePlanFixture: Decodable {
    let version: Int
    let destinationId: String
    let destinationIds: [String]
    let anchorEdgeIds: [String]
}

private struct PartialHydrationFixture: Decodable {
    let canonical: CanonicalRoutePlanFixture
    let expectedHydration: ExpectedHydrationFixture
}

private struct ExpectedHydrationFixture: Decodable {
    let status: String
    let validAnchorEdgeIds: [String]
    let staleAnchorEdgeIds: [String]
}

private struct LegacyMigrationFixture: Decodable {
    let encoded: String
    let expectedCanonical: CanonicalRoutePlanFixture
}

private struct NormalizationFixture: Decodable {
    let inputPayload: CanonicalRoutePlanFixture
    let expectedCanonical: CanonicalRoutePlanFixture
}

private struct WatchTransferEnvelopeFixture: Decodable {
    let version: Int
    let canonical: CanonicalRoutePlan
    let derived: WatchRouteTransferDerivedPayload
}

private struct FocusChangeStableOwnerFixture: Decodable {
    let canonicalOwner: CanonicalRoutePlan
    let browseFocusDestinationId: String
    let expectedCanonicalAfterFocusChange: CanonicalRoutePlan
    let expectedUrlAfterFocusChange: String
}

// MARK: - Test helpers (mirror BrowseContractTests helpers)

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

private func makeTrailSegment(
    id: Int,
    destinationId: Int,
    startLongitude: Double,
    startLatitude: Double,
    endLongitude: Double,
    endLatitude: Double
) throws -> TrailFeature {
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
                [startLongitude, startLatitude],
                [endLongitude, endLatitude],
            ],
        ],
    ]

    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(TrailFeature.self, from: data)
}

private func makeTrailSegmentWithoutDestinationID(
    id: Int,
    startLongitude: Double,
    startLatitude: Double,
    endLongitude: Double,
    endLatitude: Double
) throws -> TrailFeature {
    let object: [String: Any] = [
        "type": "Feature",
        "properties": [
            "id": id,
            "trailtypesymbol": 30,
            "prepsymbol": 20,
            "has_classic": true,
            "has_skating": true,
            "st_length(shape)": 1000,
        ],
        "geometry": [
            "type": "LineString",
            "coordinates": [
                [startLongitude, startLatitude],
                [endLongitude, endLatitude],
            ],
        ],
    ]

    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(TrailFeature.self, from: data)
}

private func makeBentTrail(
    id: Int,
    destinationId: Int,
    coordinates: [CLLocationCoordinate2D]
) throws -> TrailFeature {
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
            "coordinates": coordinates.map { [$0.longitude, $0.latitude] },
        ],
    ]

    let data = try JSONSerialization.data(withJSONObject: object)
    return try JSONDecoder().decode(TrailFeature.self, from: data)
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

@MainActor
private final class BrowseAPISpy: BrowseAPIClient {
    private let destinationsFixture: DestinationFeatureCollection
    private let trailFixtures: [String: TrailFeatureCollection]
    private let trailIDsByEdgeID: [String: String]
    private(set) var requestedDestinationIDs: [String] = []
    var elevationResponse: ElevationApiResponse?
    var queuedElevationResponses: [ElevationApiResponse] = []
    var queuedElevationResponseDelaysNanoseconds: [UInt64] = []
    var elevationShouldThrow = false
    private(set) var elevationCallCount = 0

    init(destinationsResponse: [Destination], trailsByDestination: [String: [TrailFeature]]) {
        self.destinationsFixture = makeDestinationFeatureCollection(destinationsResponse)
        self.trailFixtures = trailsByDestination.mapValues(TrailFeatureCollection.init(features:))
        let allTrails = trailsByDestination.flatMap(\.value)
        trailIDsByEdgeID = allTrails.reduce(into: [String: String]()) { result, trail in
            for edgeID in trail.planningAnchorEdgeIDs(allTrails: allTrails) {
                result[edgeID] = trail.id
            }
        }
    }

    func fetchDestinations() async throws -> DestinationFeatureCollection {
        destinationsFixture
    }

    func fetchTrails(destinationID: String) async throws -> TrailFeatureCollection {
        requestedDestinationIDs.append(destinationID)
        return trailFixtures[destinationID] ?? TrailFeatureCollection(features: [])
    }

    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection {
        TrailFeatureCollection(features: [])
    }

    func fetchElevation(request: ElevationApiRequest) async throws -> ElevationApiResponse {
        elevationCallCount += 1

        if !queuedElevationResponseDelaysNanoseconds.isEmpty {
            let delayNanoseconds = queuedElevationResponseDelaysNanoseconds.removeFirst()
            if delayNanoseconds > 0 {
                try await Task.sleep(nanoseconds: delayNanoseconds)
            }
        }

        if elevationShouldThrow {
            throw URLError(.badServerResponse)
        }

        if !queuedElevationResponses.isEmpty {
            return queuedElevationResponses.removeFirst()
        }

        guard let response = elevationResponse else {
            throw URLError(.badServerResponse)
        }
        return response
    }

    func trailID(for edgeID: String) -> String {
        trailIDsByEdgeID[edgeID] ?? ""
    }
}

private final class LocationServiceSpy: BrowseLocationServing {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)?
    var onAuthorizationUnavailable: (() -> Void)?
    func start() {}
    func requestCurrentLocation() {}
}

private final class WatchRouteTransferServiceSpy: WatchRouteTransferServing {
    var onSessionStateChange: ((WatchRouteTransferSessionState) -> Void)?
    var onAcknowledgement: ((WatchRouteTransferAcknowledgement) -> Void)?

    private(set) var activationCallCount = 0
    private(set) var lastQueuedTransferID: String?
    private(set) var lastQueuedEnvelope: WatchRouteTransferEnvelope?
    private var sessionState: WatchRouteTransferSessionState
    var sendError: Error?

    init(sessionState: WatchRouteTransferSessionState = .unsupported) {
        self.sessionState = sessionState
    }

    func activate() {
        activationCallCount += 1
    }

    func currentSessionState() -> WatchRouteTransferSessionState {
        sessionState
    }

    func queueTransfer(id: String, envelope: WatchRouteTransferEnvelope) throws {
        if let sendError {
            throw sendError
        }

        lastQueuedTransferID = id
        lastQueuedEnvelope = envelope
    }

    func pushSessionState(_ sessionState: WatchRouteTransferSessionState) {
        self.sessionState = sessionState
        onSessionStateChange?(sessionState)
    }

    func sendAcknowledgement(_ acknowledgement: WatchRouteTransferAcknowledgement) {
        onAcknowledgement?(acknowledgement)
    }
}

private func makeCleanUserDefaultsSuite(named suiteName: String) throws -> UserDefaults {
    guard let userDefaults = UserDefaults(suiteName: suiteName) else {
        throw NSError(domain: "PlanningContractTests", code: 1)
    }

    userDefaults.removePersistentDomain(forName: suiteName)
    return userDefaults
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

    let object: [String: Any] = ["features": featureObjects]
    let data = try! JSONSerialization.data(withJSONObject: object)
    return try! JSONDecoder().decode(DestinationFeatureCollection.self, from: data)
}
