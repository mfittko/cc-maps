import CoreLocation
import XCTest
@testable import CrossCountryMaps

// MARK: - Planning mode transition tests

final class PlanningContractTests: XCTestCase {

    // MARK: RoutePlanState unit tests

    func testInitialStateIsEmpty() {
        let plan = RoutePlanState()
        XCTAssertTrue(plan.isEmpty)
        XCTAssertEqual(plan.sectionCount, 0)
        XCTAssertEqual(plan.anchorTrailIDs, [])
    }

    func testToggleAnchorAppendsWhenAbsent() {
        var plan = RoutePlanState()
        plan.toggleAnchor("trail-1")
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-1"])
        XCTAssertTrue(plan.contains("trail-1"))
    }

    func testToggleAnchorRemovesWhenPresent() {
        var plan = RoutePlanState(anchorTrailIDs: ["trail-1", "trail-2"])
        plan.toggleAnchor("trail-1")
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-2"])
        XCTAssertFalse(plan.contains("trail-1"))
    }

    func testMultipleTogglesPreserveInsertionOrder() {
        var plan = RoutePlanState()
        plan.toggleAnchor("trail-A")
        plan.toggleAnchor("trail-B")
        plan.toggleAnchor("trail-C")
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-A", "trail-B", "trail-C"])
    }

    func testRemoveAtIndexLeavesOtherAnchorsStable() {
        var plan = RoutePlanState(anchorTrailIDs: ["trail-A", "trail-B", "trail-C"])
        plan.removeAnchor(at: 1)
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-A", "trail-C"])
    }

    func testRemoveAtOutOfBoundsIndexIsNoop() {
        var plan = RoutePlanState(anchorTrailIDs: ["trail-A"])
        plan.removeAnchor(at: 5)
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-A"])
    }

    func testReverseInvertsOrderWithoutMutatingIdentity() {
        var plan = RoutePlanState(anchorTrailIDs: ["trail-A", "trail-B", "trail-C"])
        plan.reverse()
        XCTAssertEqual(plan.anchorTrailIDs, ["trail-C", "trail-B", "trail-A"])
    }

    func testDoubleReverseRestoresOriginalOrder() {
        let original = ["trail-A", "trail-B", "trail-C"]
        var plan = RoutePlanState(anchorTrailIDs: original)
        plan.reverse()
        plan.reverse()
        XCTAssertEqual(plan.anchorTrailIDs, original)
    }

    func testClearRemovesAllAnchors() {
        var plan = RoutePlanState(anchorTrailIDs: ["trail-A", "trail-B"])
        plan.clear()
        XCTAssertTrue(plan.isEmpty)
        XCTAssertEqual(plan.anchorTrailIDs, [])
    }

    func testSectionCountMatchesAnchorCount() {
        let plan = RoutePlanState(anchorTrailIDs: ["trail-A", "trail-B", "trail-C"])
        XCTAssertEqual(plan.sectionCount, 3)
    }

    // MARK: Fixture-backed parity tests

    func testOrderedTapSequenceMatchesFixture() throws {
        let fixture: PlanningOrderedAnchorsFixture = try FixtureLoader.decode("planning-ordered-anchors.json")

        var plan = RoutePlanState()
        for trailID in fixture.tapSequence {
            plan.toggleAnchor(trailID)
        }

        XCTAssertEqual(
            plan.anchorTrailIDs,
            fixture.expectedAnchorIDs,
            "Anchor order after tap sequence must match fixture"
        )
    }

    func testReverseMatchesFixture() throws {
        let fixture: PlanningOrderedAnchorsFixture = try FixtureLoader.decode("planning-ordered-anchors.json")

        var plan = RoutePlanState(anchorTrailIDs: fixture.expectedAnchorIDs)
        plan.reverse()

        XCTAssertEqual(
            plan.anchorTrailIDs,
            fixture.reversedAnchorIDs,
            "Reversed anchor order must match fixture"
        )
    }

    func testRemoveAtIndex1MatchesFixture() throws {
        let fixture: PlanningOrderedAnchorsFixture = try FixtureLoader.decode("planning-ordered-anchors.json")

        var plan = RoutePlanState(anchorTrailIDs: fixture.expectedAnchorIDs)
        plan.removeAnchor(at: 1)

        XCTAssertEqual(
            plan.anchorTrailIDs,
            fixture.afterRemovingIndex1,
            "Anchor list after removing index 1 must match fixture"
        )
    }

    func testToggleRemoveFirstAnchorMatchesFixture() throws {
        let fixture: PlanningOrderedAnchorsFixture = try FixtureLoader.decode("planning-ordered-anchors.json")

        var plan = RoutePlanState(anchorTrailIDs: fixture.expectedAnchorIDs)
        plan.toggleAnchor(fixture.tapSequence[0])

        XCTAssertEqual(
            plan.anchorTrailIDs,
            fixture.afterToggleRemoveA,
            "Toggle-removing the first anchor must match fixture"
        )
    }

    func testClearMatchesFixture() throws {
        let fixture: PlanningOrderedAnchorsFixture = try FixtureLoader.decode("planning-ordered-anchors.json")

        var plan = RoutePlanState(anchorTrailIDs: fixture.expectedAnchorIDs)
        plan.clear()

        XCTAssertEqual(
            plan.anchorTrailIDs,
            fixture.afterClear,
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
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", segment: nil))
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
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", segment: nil))

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
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-1", segment: nil))

        XCTAssertNil(viewModel.selectedTrailID, "Inspect selection must be nil when planning mode is on")
        XCTAssertEqual(viewModel.routePlan.anchorTrailIDs, ["trail-1"], "Trail must be added to plan")
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
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-A", segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-B", segment: nil))
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-C", segment: nil))

        XCTAssertEqual(viewModel.routePlan.anchorTrailIDs, ["trail-A", "trail-B", "trail-C"])
    }

    @MainActor
    func testReverseRouteViaViewModel() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        for id in ["trail-A", "trail-B", "trail-C"] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: id, segment: nil))
        }

        viewModel.reverseRoute()
        XCTAssertEqual(viewModel.routePlan.anchorTrailIDs, ["trail-C", "trail-B", "trail-A"])
    }

    @MainActor
    func testClearRouteViaViewModel() {
        let viewModel = BrowseViewModel(
            apiClient: BrowseAPISpy(destinationsResponse: [], trailsByDestination: [:]),
            locationService: LocationServiceSpy(),
            timingConfig: .immediate
        )
        viewModel.enterPlanningMode()
        for id in ["trail-A", "trail-B"] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: id, segment: nil))
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
        for id in ["trail-A", "trail-B", "trail-C"] {
            viewModel.selectTrail(selection: TrailInspectionSelection(trailID: id, segment: nil))
        }

        viewModel.removeRouteAnchor(at: 1)
        XCTAssertEqual(viewModel.routePlan.anchorTrailIDs, ["trail-A", "trail-C"])
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
        viewModel.selectTrail(selection: TrailInspectionSelection(trailID: "trail-A", segment: nil))
        XCTAssertTrue(viewModel.isInPlanningMode)
        XCTAssertFalse(viewModel.routePlan.isEmpty)

        viewModel.selectDestination(id: "2", manual: true)

        XCTAssertFalse(viewModel.isInPlanningMode, "Planning mode must exit on destination change")
        XCTAssertTrue(viewModel.routePlan.isEmpty, "Route must clear on destination change (destination-scoped)")
    }
}

// MARK: - Fixture types

private struct PlanningOrderedAnchorsFixture: Decodable {
    let tapSequence: [String]
    let expectedAnchorIDs: [String]
    let reversedAnchorIDs: [String]
    let afterRemovingIndex1: [String]
    let afterToggleRemoveA: [String]
    let afterClear: [String]
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
