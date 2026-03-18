import CoreLocation
import Foundation

enum LoadPhase: Equatable {
    case idle
    case loading
    case success
    case failure(String)

    var message: String? {
        switch self {
        case .idle:
            return nil
        case .loading:
            return "Loading"
        case .success:
            return nil
        case .failure(let error):
            return error
        }
    }
}

protocol BrowseAPIClient {
    func fetchDestinations() async throws -> DestinationFeatureCollection
    func fetchTrails(destinationID: String) async throws -> TrailFeatureCollection
    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection
}

protocol BrowseLocationServing: AnyObject {
    var onLocationUpdate: ((CLLocationCoordinate2D) -> Void)? { get set }
    var onAuthorizationUnavailable: (() -> Void)? { get set }

    func start()
    func requestCurrentLocation()
}

struct BrowseTimingConfig {
    let destinationSuggestionDebounceNanoseconds: UInt64
    let initialFallbackDelayNanoseconds: UInt64

    static let live = BrowseTimingConfig(
        destinationSuggestionDebounceNanoseconds: AppConfig.destinationSuggestionDebounceNanoseconds,
        initialFallbackDelayNanoseconds: AppConfig.initialFallbackDelayNanoseconds
    )

    static let immediate = BrowseTimingConfig(
        destinationSuggestionDebounceNanoseconds: 0,
        initialFallbackDelayNanoseconds: 0
    )
}

@MainActor
final class BrowseViewModel: ObservableObject {
    @Published private(set) var destinations: [Destination] = []
    @Published private(set) var selectedDestinationID = ""
    @Published private(set) var primaryTrails: [TrailFeature] = []
    @Published private(set) var previewTrails: [TrailFeature] = []
    @Published private(set) var nearbyPreviewDestinations: [Destination] = []
    @Published private(set) var currentLocation: CLLocationCoordinate2D?
    @Published private(set) var destinationsPhase: LoadPhase = .idle
    @Published private(set) var trailsPhase: LoadPhase = .idle
    @Published private(set) var previewPhase: LoadPhase = .idle
    @Published private(set) var requestError: String?
    @Published private(set) var isManualDestinationSelection = false
    @Published private(set) var fitRequestID = 0
    @Published private(set) var locationFocusRequestID = 0
    private(set) var handledLocationUpdateCount = 0
    @Published private(set) var isInPlanningMode = false
    @Published private(set) var routePlan = RoutePlanState()

    @Published var selectedTrailID: String?
    @Published private(set) var selectedTrailSegment: TrailSegment?
    @Published var visibleRegionCenter: CLLocationCoordinate2D?

    let locationService: BrowseLocationServing

    private let apiClient: BrowseAPIClient
    private let timingConfig: BrowseTimingConfig
    private var hasStarted = false
    private var hasAutoSelectedDestination = false
    private var lastAutoLocation: CLLocationCoordinate2D?
    private var primaryLoadToken = UUID()
    private var previewLoadToken = UUID()
    private var fallbackTask: Task<Void, Never>?
    private var previewTask: Task<Void, Never>?

    init(
        apiClient: BrowseAPIClient = APIClient(),
        locationService: BrowseLocationServing = LocationService(),
        timingConfig: BrowseTimingConfig = .live
    ) {
        self.apiClient = apiClient
        self.locationService = locationService
        self.timingConfig = timingConfig

        locationService.onLocationUpdate = { [weak self] coordinate in
            Task { @MainActor in
                await self?.handleLocationUpdate(coordinate)
            }
        }

        locationService.onAuthorizationUnavailable = { [weak self] in
            Task { @MainActor in
                self?.scheduleFallbackSelection()
            }
        }
    }

    var selectedDestination: Destination? {
        destinations.first { $0.id == selectedDestinationID }
    }

    var selectedTrail: TrailFeature? {
        let displayedTrails = primaryTrails + previewTrails
        return displayedTrails.first { $0.id == selectedTrailID }
    }

    var statusSummary: String {
        if let destination = selectedDestination {
            return isManualDestinationSelection ? "Manual destination locked: \(destination.name)" : "Auto-selected destination: \(destination.name)"
        }

        if destinationsPhase == .loading {
            return "Loading destinations first"
        }

        return "Waiting for destination selection"
    }

    func start() {
        guard !hasStarted else {
            return
        }

        hasStarted = true
        visibleRegionCenter = AppConfig.defaultCenter
        destinationsPhase = .loading
        locationService.start()

        Task {
            await loadDestinations()
        }
    }

    func selectDestination(id: String, manual: Bool) {
        guard selectedDestinationID != id || manual else {
            return
        }

        if manual {
            isManualDestinationSelection = true
        }

        fallbackTask?.cancel()
        previewTask?.cancel()
        primaryLoadToken = UUID()
        previewLoadToken = UUID()

        isInPlanningMode = false
        routePlan.clear()

        selectedDestinationID = id
        selectedTrailID = nil
        selectedTrailSegment = nil
        primaryTrails = []
        previewTrails = []
        nearbyPreviewDestinations = []
        trailsPhase = .loading
        previewPhase = .idle
        requestError = nil

        loadPrimaryTrails(for: id, token: primaryLoadToken)
    }

    func selectTrail(id: String?, segment: TrailSegment? = nil) {
        selectedTrailID = id
        selectedTrailSegment = id == nil ? nil : segment
    }

    func selectTrail(selection: TrailInspectionSelection?) {
        guard let trailID = selection?.trailID else {
            selectedTrailID = nil
            selectedTrailSegment = nil
            return
        }

        if isInPlanningMode {
            guard let anchorEdgeID = selection?.anchorEdgeID else {
                return
            }

            routePlan.toggleAnchorEdge(anchorEdgeID)
            routePlan.replaceAnchorEdges(with: GeoMath.reorderedAnchorEdgeIDs(
                routePlan.anchorEdgeIDs,
                allTrails: primaryTrails
            ))
        } else {
            selectedTrailID = trailID
            selectedTrailSegment = selection?.segment
        }
    }

    func enterPlanningMode() {
        selectedTrailID = nil
        selectedTrailSegment = nil
        isInPlanningMode = true
    }

    func exitPlanningMode() {
        isInPlanningMode = false
    }

    func reverseRoute() {
        routePlan.reverse()
    }

    func clearRoute() {
        routePlan.clear()
    }

    func removeRouteAnchor(at index: Int) {
        routePlan.removeAnchor(at: index)
    }

    func enableAutoLocation() {
        isManualDestinationSelection = false
        locationFocusRequestID += 1
        locationService.requestCurrentLocation()

        if let currentLocation {
            Task {
                await handleLocationUpdate(currentLocation)
            }
        } else {
            scheduleFallbackSelection()
        }
    }

    func updateVisibleRegionCenter(_ center: CLLocationCoordinate2D) {
        if let visibleRegionCenter,
           GeoMath.distanceKilometers(from: visibleRegionCenter, to: center) < AppConfig.previewRegionRecheckDistanceKm {
            return
        }

        visibleRegionCenter = center
        schedulePreviewEvaluation()
    }

    private func loadDestinations() async {
        do {
            let response = try await apiClient.fetchDestinations()
            let loadedDestinations = response.features
                .map { Destination(feature: $0) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

            destinations = loadedDestinations
            destinationsPhase = .success

            if let currentLocation {
                await handleLocationUpdate(currentLocation)
            } else {
                scheduleFallbackSelection()
            }
        } catch {
            destinationsPhase = .failure("Failed to load destinations")
            requestError = error.localizedDescription
        }
    }

    private func loadPrimaryTrails(for destinationID: String, token: UUID) {
        Task {
            do {
                let response = try await apiClient.fetchTrails(destinationID: destinationID)

                guard token == primaryLoadToken, destinationID == selectedDestinationID else {
                    return
                }

                primaryTrails = response.features
                trailsPhase = .success
                fitRequestID += 1
                schedulePreviewEvaluation()

                let trails = response.features
                Task.detached(priority: .utility) {
                    GeoMath.warmPlanningGraph(for: trails)
                }
            } catch {
                guard token == primaryLoadToken else {
                    return
                }

                primaryTrails = []
                trailsPhase = .failure("Failed to load trails for the selected destination")
                requestError = error.localizedDescription
            }
        }
    }

    private func scheduleFallbackSelection() {
        fallbackTask?.cancel()
        fallbackTask = Task { [weak self] in
            if let self, self.timingConfig.initialFallbackDelayNanoseconds > 0 {
                try? await Task.sleep(nanoseconds: self.timingConfig.initialFallbackDelayNanoseconds)
            }
            self?.applyFallbackSelectionIfNeeded()
        }
    }

    private func applyFallbackSelectionIfNeeded() {
        guard !isManualDestinationSelection, selectedDestinationID.isEmpty else {
            return
        }

        guard let fallbackDestination = GeoMath.closestDestination(destinations: destinations, reference: AppConfig.defaultCenter) else {
            return
        }

        hasAutoSelectedDestination = true
        selectDestination(id: fallbackDestination.id, manual: false)
    }

    private func handleLocationUpdate(_ coordinate: CLLocationCoordinate2D) async {
        handledLocationUpdateCount += 1
        currentLocation = coordinate

        guard !isManualDestinationSelection, !destinations.isEmpty else {
            return
        }

        if let lastAutoLocation,
           GeoMath.distanceKilometers(from: lastAutoLocation, to: coordinate) < AppConfig.currentLocationRecheckDistanceKm {
            return
        }

        lastAutoLocation = coordinate

        do {
            let nearbyTrails = try await apiClient.fetchNearbyTrails(reference: coordinate)
            if let matchedDestination = GeoMath.closestDestinationByTrailProximity(
                destinations: destinations,
                trails: nearbyTrails.features,
                reference: coordinate,
                thresholdKilometers: AppConfig.currentLocationTrackMatchThresholdKm
            ), matchedDestination.id != selectedDestinationID {
                hasAutoSelectedDestination = true
                selectDestination(id: matchedDestination.id, manual: false)
                return
            }
        } catch {
            // Nearby trail matching is an optimization. Fallback still preserves destination-first behavior.
        }

        guard let fallbackDestination = GeoMath.closestDestination(destinations: destinations, reference: coordinate) else {
            return
        }

        if !hasAutoSelectedDestination || selectedDestinationID.isEmpty || selectedDestinationID != fallbackDestination.id {
            hasAutoSelectedDestination = true
            selectDestination(id: fallbackDestination.id, manual: false)
        }
    }

    private func schedulePreviewEvaluation() {
        previewTask?.cancel()

        guard trailsPhase == .success, let selectedDestination else {
            return
        }

        previewTask = Task { [weak self, selectedDestinationID] in
            if let self, self.timingConfig.destinationSuggestionDebounceNanoseconds > 0 {
                try? await Task.sleep(nanoseconds: self.timingConfig.destinationSuggestionDebounceNanoseconds)
            }
            await self?.loadPreviewTrailsIfNeeded(for: selectedDestinationID, selectedDestination: selectedDestination)
        }
    }

    private func loadPreviewTrailsIfNeeded(for destinationID: String, selectedDestination: Destination) async {
        guard destinationID == selectedDestinationID else {
            return
        }

        let referenceCenter = visibleRegionCenter ?? selectedDestination.coordinate
        let previewDestinations = GeoMath.boundedNearbyPreviewDestinations(
            destinations: destinations,
            reference: referenceCenter,
            radiusKilometers: AppConfig.suggestedDestinationRadiusKm,
            excludedID: selectedDestination.id,
            maxCount: AppConfig.maxNearbyDestinationPreviews
        )

        nearbyPreviewDestinations = previewDestinations

        guard !previewDestinations.isEmpty else {
            previewTrails = []
            previewPhase = .success
            let trails = primaryTrails
            Task.detached(priority: .utility) {
                GeoMath.warmPlanningGraph(for: trails)
            }
            return
        }

        let token = UUID()
        previewLoadToken = token
        previewPhase = .loading

        do {
            var nextPreviewTrails: [TrailFeature] = []

            for destination in previewDestinations {
                let trailsResponse = try await apiClient.fetchTrails(destinationID: destination.id)
                nextPreviewTrails.append(contentsOf: trailsResponse.features)
            }

            guard token == previewLoadToken, destinationID == selectedDestinationID else {
                return
            }

            previewTrails = nextPreviewTrails
            previewPhase = .success
        } catch {
            guard token == previewLoadToken else {
                return
            }

            previewTrails = []
            previewPhase = .failure("Nearby previews unavailable")
        }
    }
}

struct APIClient: BrowseAPIClient {
    private let decoder = JSONDecoder()

    func fetchDestinations() async throws -> DestinationFeatureCollection {
        try await fetch(path: "/api/destinations")
    }

    func fetchTrails(destinationID: String) async throws -> TrailFeatureCollection {
        try await fetch(path: "/api/trails", queryItems: [URLQueryItem(name: "destinationid", value: destinationID)])
    }

    func fetchNearbyTrails(reference: CLLocationCoordinate2D) async throws -> TrailFeatureCollection {
        try await fetch(
            path: "/api/trails",
            queryItems: [
                URLQueryItem(name: "lng", value: String(reference.longitude)),
                URLQueryItem(name: "lat", value: String(reference.latitude)),
            ]
        )
    }

    private func fetch<Response: Decodable>(path: String, queryItems: [URLQueryItem] = []) async throws -> Response {
        let requestURL = try makeURL(path: path, queryItems: queryItems)
        let (data, response) = try await URLSession.shared.data(from: requestURL)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }

        return try decoder.decode(Response.self, from: data)
    }

    private func makeURL(path: String, queryItems: [URLQueryItem]) throws -> URL {
        guard var components = URLComponents(url: AppConfig.apiBaseURL, resolvingAgainstBaseURL: false) else {
            throw URLError(.badURL)
        }

        let basePath = components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path
        components.path = basePath + path
        components.queryItems = queryItems.isEmpty ? nil : queryItems

        guard let url = components.url else {
            throw URLError(.badURL)
        }

        return url
    }
}