import CoreLocation
import XCTest
@testable import CrossCountryMaps

final class BrowseContractTests: XCTestCase {
    func testFallbackDestinationSelectionMatchesSharedFixture() throws {
        let fixture: FallbackDestinationFixture = try FixtureLoader.decode("default-destination-fallback.json")

        XCTAssertEqual(
            GeoMath.closestDestination(
                destinations: fixture.destinations,
                reference: fixture.referenceCoordinate
            )?.id,
            fixture.expectedDestinationId
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

    @MainActor
    func testBrowseBootstrapLoadsDestinationsBeforeDestinationScopedTrails() async throws {
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
            viewModel.trailsPhase == .success
        }

        XCTAssertEqual(apiClient.callLog, [.destinations, .trails("1")])
        XCTAssertEqual(viewModel.selectedDestinationID, "1")
        XCTAssertEqual(viewModel.fitRequestID, 1)
        XCTAssertEqual(locationService.startCallCount, 1)
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
        let viewModel = BrowseViewModel(
            apiClient: apiClient,
            locationService: locationService,
            timingConfig: .immediate
        )

        viewModel.start()

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
        locationService.sendLocation(CLLocationCoordinate2D(latitude: 59.9139, longitude: 10.7522))

        try? await Task.sleep(nanoseconds: 50_000_000)

        XCTAssertTrue(viewModel.isManualDestinationSelection)
        XCTAssertEqual(viewModel.selectedDestinationID, "2")
        XCTAssertEqual(apiClient.callLog.count, callCountBeforeLocationUpdate)
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

        await waitUntil {
            apiClient.callLog == [.destinations, .trails("1")]
        }

        viewModel.updateVisibleRegionCenter(CLLocationCoordinate2D(latitude: 61.1153, longitude: 10.4662))
        viewModel.selectDestination(id: "2", manual: true)

        await waitUntil {
            viewModel.selectedDestinationID == "2" &&
            viewModel.primaryTrails.map(\.id) == ["202"] &&
            viewModel.trailsPhase == .success
        }

        apiClient.resumeTrails(for: "1")
        try? await Task.sleep(nanoseconds: 50_000_000)

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

        await waitUntil {
            viewModel.previewPhase == .success &&
            viewModel.previewTrails.map(\.id) == ["202"]
        }

        XCTAssertEqual(viewModel.fitRequestID, 1)
        XCTAssertEqual(apiClient.callLog, [.destinations, .trails("1"), .trails("2")])
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

        return trailFixtures[destinationID] ?? TrailFeatureCollection(features: [])
    }

    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection {
        callLog.append(.nearbyTrails)
        return nearbyFixture
    }

    func resumeTrails(for destinationID: String) {
        trailContinuations.removeValue(forKey: destinationID)?.resume()
    }
}

@MainActor
private final class LocationServiceSpy: BrowseLocationServing {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)?
    var onAuthorizationUnavailable: (() -> Void)?
    var startCallCount = 0
    var requestCurrentLocationCallCount = 0

    func start() {
        startCallCount += 1
    }

    func requestCurrentLocation() {
        requestCurrentLocationCallCount += 1
    }

    func sendLocation(_ coordinate: CLLocationCoordinate2D) {
        onLocationUpdate?(coordinate)
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
