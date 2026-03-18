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

        await waitUntil { viewModel.trailsPhase == .success }

        viewModel.enterPlanningMode()
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-A", anchorEdgeID: Self.edgeA, segment: nil))
        XCTAssertTrue(viewModel.isInPlanningMode)
        XCTAssertFalse(viewModel.routePlan.isEmpty)

        viewModel.selectDestination(id: "2", manual: true)

        XCTAssertFalse(viewModel.isInPlanningMode, "Planning mode must exit on destination change")
        XCTAssertTrue(viewModel.routePlan.isEmpty, "Route must clear on destination change (destination-scoped)")
    }
}

// MARK: - Fixture types

private struct SharedRoutePlanFixture: Decodable {
    let anchorEdgeIds: [String]
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

    init(destinationsResponse: [Destination], trailsByDestination: [String: [TrailFeature]]) {
        self.destinationsFixture = makeDestinationFeatureCollection(destinationsResponse)
        self.trailFixtures = trailsByDestination.mapValues(TrailFeatureCollection.init(features:))
    }

    func fetchDestinations() async throws -> DestinationFeatureCollection {
        destinationsFixture
    }

    func fetchTrails(destinationID: String) async throws -> TrailFeatureCollection {
        trailFixtures[destinationID] ?? TrailFeatureCollection(features: [])
    }

    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection {
        TrailFeatureCollection(features: [])
    }
}

private final class LocationServiceSpy: BrowseLocationServing {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)?
    var onAuthorizationUnavailable: (() -> Void)?
    func start() {}
    func requestCurrentLocation() {}
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
