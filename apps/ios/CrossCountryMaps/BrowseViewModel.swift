import CoreLocation
import Foundation
import MapKit

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
    func fetchElevation(request: ElevationApiRequest) async throws -> ElevationApiResponse
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

protocol BrowseSettingsPersisting {
    func readBrowseSettings() -> BrowseSettings?
    func writeBrowseSettings(_ settings: BrowseSettings)
}

struct PersistedMapRegion: Codable, Equatable {
    let latitude: Double
    let longitude: Double
    let latitudeDelta: Double
    let longitudeDelta: Double

    init(
        latitude: Double,
        longitude: Double,
        latitudeDelta: Double,
        longitudeDelta: Double
    ) {
        self.latitude = latitude
        self.longitude = longitude
        self.latitudeDelta = latitudeDelta
        self.longitudeDelta = longitudeDelta
    }

    init(region: MKCoordinateRegion) {
        self.init(
            latitude: region.center.latitude,
            longitude: region.center.longitude,
            latitudeDelta: region.span.latitudeDelta,
            longitudeDelta: region.span.longitudeDelta
        )
    }

    var center: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var coordinateRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: center,
            span: MKCoordinateSpan(latitudeDelta: latitudeDelta, longitudeDelta: longitudeDelta)
        )
    }

    static let fallback = PersistedMapRegion(
        latitude: AppConfig.defaultCenter.latitude,
        longitude: AppConfig.defaultCenter.longitude,
        latitudeDelta: 0.45,
        longitudeDelta: 0.45
    )
}

struct BrowseSettings: Codable, Equatable {
    let destinationID: String
    let mapRegion: PersistedMapRegion?
    let isPlanningModeActive: Bool

    enum CodingKeys: String, CodingKey {
        case destinationID = "destination"
        case mapRegion
        case isPlanningModeActive = "planningModeActive"
    }

    init(
        destinationID: String,
        mapRegion: PersistedMapRegion?,
        isPlanningModeActive: Bool = false
    ) {
        self.destinationID = destinationID
        self.mapRegion = mapRegion
        self.isPlanningModeActive = isPlanningModeActive
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        destinationID = try container.decode(String.self, forKey: .destinationID)
        mapRegion = try container.decodeIfPresent(PersistedMapRegion.self, forKey: .mapRegion)
        isPlanningModeActive = try container.decodeIfPresent(Bool.self, forKey: .isPlanningModeActive) ?? false
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(destinationID, forKey: .destinationID)
        try container.encodeIfPresent(mapRegion, forKey: .mapRegion)
        try container.encode(isPlanningModeActive, forKey: .isPlanningModeActive)
    }
}

struct UserDefaultsBrowseSettingsStore: BrowseSettingsPersisting {
    private let userDefaults: UserDefaults
    private let storageKey: String

    init(
        userDefaults: UserDefaults = .standard,
        storageKey: String = AppConfig.routePlanStorageKey
    ) {
        self.userDefaults = userDefaults
        self.storageKey = storageKey
    }

    func readBrowseSettings() -> BrowseSettings? {
        guard let rawValue = userDefaults.string(forKey: storageKey),
              let data = rawValue.data(using: .utf8) else {
            return nil
        }

        return try? JSONDecoder().decode(BrowseSettings.self, from: data)
    }

    func writeBrowseSettings(_ settings: BrowseSettings) {
        guard let data = try? JSONEncoder().encode(settings),
              let encoded = String(data: data, encoding: .utf8) else {
            return
        }

        userDefaults.set(encoded, forKey: storageKey)
    }
}

final class InMemoryBrowseSettingsStore: BrowseSettingsPersisting {
    private var settings: BrowseSettings?

    init(settings: BrowseSettings? = nil) {
        self.settings = settings
    }

    func readBrowseSettings() -> BrowseSettings? {
        settings
    }

    func writeBrowseSettings(_ settings: BrowseSettings) {
        self.settings = settings
    }
}

enum BrowseSettingsStoreFactory {
    static func makeDefaultStore() -> BrowseSettingsPersisting {
        if AppConfig.isRunningTests {
            return InMemoryBrowseSettingsStore()
        }

        return UserDefaultsBrowseSettingsStore()
    }
}

private struct PendingRouteRestoreContext {
    enum Source {
        case url
        case storage
    }

    let routePlan: CanonicalRoutePlan
    let source: Source
    let shouldEnterPlanningMode: Bool
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
    @Published private(set) var routeHydrationNotice: RoutePlanHydrationNotice?
    @Published private(set) var activeRouteDestinationIDs: [String] = []
    @Published private(set) var visibleMapRegion: PersistedMapRegion?
    @Published private(set) var mapRegionRestoreRequestID = 0
    @Published private(set) var selectedPlannedSectionEdgeID: String?
    @Published private(set) var focusedPlannedSectionCoordinates: [CLLocationCoordinate2D] = []
    @Published private(set) var plannedSectionFocusRequestID = 0
    @Published private(set) var routeElevation: ElevationApiResponse?

    @Published var selectedTrailID: String?
    @Published private(set) var selectedTrailSegment: TrailSegment?
    @Published var visibleRegionCenter: CLLocationCoordinate2D?

    let locationService: BrowseLocationServing

    private let apiClient: BrowseAPIClient
    private let timingConfig: BrowseTimingConfig
    private let routePlanStore: RoutePlanPersisting
    private let browseSettingsStore: BrowseSettingsPersisting
    private var hasStarted = false
    private var hasAutoSelectedDestination = false
    private var lastAutoLocation: CLLocationCoordinate2D?
    private var primaryLoadToken = UUID()
    private var previewLoadToken = UUID()
    private var fallbackTask: Task<Void, Never>?
    private var previewTask: Task<Void, Never>?
    private var elevationTask: Task<Void, Never>?
    private var pendingIncomingRoutePlan: CanonicalRoutePlan?
    private var pendingRestoreContext: PendingRouteRestoreContext?
    private var pendingStoredDestinationID = ""
    private var pendingStoredPlanningModeActive = false
    private var pendingMapRegionPreservationDestinationID: String?
    private var isIgnoringMapRegionUpdatesDuringStartupRestore = false

    init(
        apiClient: BrowseAPIClient = APIClient(),
        locationService: BrowseLocationServing = LocationService(),
        timingConfig: BrowseTimingConfig = .live,
        routePlanStore: RoutePlanPersisting = UserDefaultsRoutePlanStore(),
        browseSettingsStore: BrowseSettingsPersisting = BrowseSettingsStoreFactory.makeDefaultStore()
    ) {
        self.apiClient = apiClient
        self.locationService = locationService
        self.timingConfig = timingConfig
        self.routePlanStore = routePlanStore
        self.browseSettingsStore = browseSettingsStore

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

    var canEnableAutoLocation: Bool {
        autoEligibleDestination != nil
    }

    var selectedTrail: TrailFeature? {
        let displayedTrails = primaryTrails + previewTrails
        return displayedTrails.first { $0.id == selectedTrailID }
    }

    var allTrails: [TrailFeature] {
        primaryTrails + previewTrails
    }

    var plannedSections: [PlanningSection] {
        GeoMath.planningSections(for: routePlan.anchorEdgeIDs, allTrails: allTrails)
    }

    var routeSummary: RouteSummary {
        RouteSummary.from(sections: plannedSections, elevationResponse: routeElevation)
    }

    var routeUsesPreviewDestinations: Bool {
        activeRouteDestinationIDs.count > 1
    }

    var canonicalRoutePlan: CanonicalRoutePlan? {
        guard !selectedDestinationID.isEmpty, !routePlan.anchorEdgeIDs.isEmpty else {
            return nil
        }

        return CanonicalRoutePlan(
            destinationId: selectedDestinationID,
            anchorEdgeIds: routePlan.anchorEdgeIDs,
            destinationIds: activeRouteDestinationIDs
        )
    }

    var routeShareArtifact: RouteShareArtifact? {
        guard let canonicalRoutePlan,
              let destinationName = selectedDestination?.name else {
            return nil
        }

        return RouteShareArtifact(routePlan: canonicalRoutePlan, destinationName: destinationName)
    }

    var selectedRouteDetailContext: RouteAwareTrailDetailContext? {
        guard !isInPlanningMode,
              !routePlan.anchorEdgeIDs.isEmpty,
              let selectedTrailID,
              let matchingIndex = matchingPlannedSectionIndex(
                forSelectedTrailID: selectedTrailID,
                selectedSegment: selectedTrailSegment
              ) else {
            return nil
        }

        let summary = routeSummary
        let routeMetrics = routeElevation?.route.status == "ok" ? routeElevation?.route.metrics : nil

        return RouteAwareTrailDetailContext(
            selectedSectionNumber: matchingIndex + 1,
            totalSections: summary.sectionCount,
            totalDistanceKm: summary.totalDistanceKm,
            ascentMeters: routeMetrics.map { Double($0.ascentMeters) },
            descentMeters: routeMetrics.map { Double($0.descentMeters) }
        )
    }

    func makeRouteExportFile() -> RouteExportFile? {
        guard !plannedSections.isEmpty,
              let destinationName = selectedDestination?.name else {
            return nil
        }

        let routeName = "\(destinationName) route"
        let gpxContent = RouteExport.gpx(from: plannedSections, routeName: routeName)

        guard !gpxContent.isEmpty else {
            return nil
        }

        return RouteExportFile(
            fileName: RouteExport.fileName(for: routeName),
            content: gpxContent
        )
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
        let storedBrowseSettings = browseSettingsStore.readBrowseSettings()
        visibleMapRegion = storedBrowseSettings?.mapRegion
        visibleRegionCenter = storedBrowseSettings?.mapRegion?.center ?? AppConfig.defaultCenter
        pendingStoredDestinationID = storedBrowseSettings?.destinationID ?? ""
        pendingStoredPlanningModeActive = storedBrowseSettings?.isPlanningModeActive ?? false
        isManualDestinationSelection = !pendingStoredDestinationID.isEmpty
        isIgnoringMapRegionUpdatesDuringStartupRestore = visibleMapRegion != nil && !pendingStoredDestinationID.isEmpty
        pendingMapRegionPreservationDestinationID = visibleMapRegion == nil || pendingStoredDestinationID.isEmpty
            ? nil
            : pendingStoredDestinationID

        if visibleMapRegion != nil {
            mapRegionRestoreRequestID += 1
        }

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

        if pendingMapRegionPreservationDestinationID != id {
            pendingMapRegionPreservationDestinationID = nil
            isIgnoringMapRegionUpdatesDuringStartupRestore = false
        }

        if manual {
            isManualDestinationSelection = true
        }

        fallbackTask?.cancel()
        previewTask?.cancel()
        primaryLoadToken = UUID()
        previewLoadToken = UUID()

        isInPlanningMode = false
        routeHydrationNotice = nil
        routePlan.clear()
        activeRouteDestinationIDs = []
        clearSelectedPlannedSection()
        routeElevation = nil
        elevationTask?.cancel()
        elevationTask = nil

        selectedDestinationID = id
        selectedTrailID = nil
        selectedTrailSegment = nil
        primaryTrails = []
        previewTrails = []
        nearbyPreviewDestinations = []
        trailsPhase = .loading
        previewPhase = .idle
        requestError = nil
        pendingRestoreContext = resolvePendingRestoreContext(for: id)
        persistBrowseSettings()

        loadPrimaryTrails(for: id, token: primaryLoadToken)
    }

    func selectTrail(id: String?, segment: TrailSegment? = nil) {
        clearSelectedPlannedSection()
        selectedTrailID = id
        selectedTrailSegment = id == nil ? nil : segment
    }

    func selectTrail(selection: TrailInspectionSelection?) {
        guard let trailID = selection?.trailID else {
            clearSelectedPlannedSection()
            selectedTrailID = nil
            selectedTrailSegment = nil
            return
        }

        if isInPlanningMode {
            guard let anchorEdgeID = selection?.anchorEdgeID else {
                return
            }

            clearSelectedPlannedSection()

            var nextAnchorEdgeIDs = routePlan.anchorEdgeIDs

            if let existingIndex = nextAnchorEdgeIDs.firstIndex(of: anchorEdgeID) {
                nextAnchorEdgeIDs.remove(at: existingIndex)
            } else {
                nextAnchorEdgeIDs.append(anchorEdgeID)
            }

            applyRouteAnchorEdgeIDs(
                GeoMath.reorderedAnchorEdgeIDs(
                    nextAnchorEdgeIDs,
                    allTrails: primaryTrails + previewTrails
                ),
                allTrails: primaryTrails + previewTrails
            )
        } else {
            selectedTrailID = trailID
            selectedTrailSegment = selection?.segment
        }
    }

    func enterPlanningMode() {
        selectedTrailID = nil
        selectedTrailSegment = nil
        clearSelectedPlannedSection()
        isInPlanningMode = true

        if !routePlan.isEmpty {
            fitRequestID += 1
        }

        persistBrowseSettings()
    }

    func exitPlanningMode() {
        clearSelectedPlannedSection()
        isInPlanningMode = false

        if !routePlan.isEmpty {
            fitRequestID += 1
        }

        persistBrowseSettings()
    }

    func selectPlannedSection(edgeID: String) {
        guard isInPlanningMode else {
            return
        }

        let plannedSections = GeoMath.planningSections(for: routePlan.anchorEdgeIDs, allTrails: primaryTrails + previewTrails)

        guard let section = plannedSections.first(where: { $0.edgeID == edgeID }) else {
            return
        }

        selectedPlannedSectionEdgeID = section.edgeID
        focusedPlannedSectionCoordinates = section.coordinates
        plannedSectionFocusRequestID += 1
    }

    func selectPlannedSection(at index: Int) {
        guard isInPlanningMode else {
            return
        }

        let plannedSections = GeoMath.planningSections(for: routePlan.anchorEdgeIDs, allTrails: primaryTrails + previewTrails)

        guard plannedSections.indices.contains(index) else {
            return
        }

        selectPlannedSection(edgeID: plannedSections[index].edgeID)
    }

    func reverseRoute() {
        applyRouteAnchorEdgeIDs(Array(routePlan.anchorEdgeIDs.reversed()), allTrails: primaryTrails + previewTrails)
    }

    func clearRoute() {
        applyRouteAnchorEdgeIDs([], allTrails: primaryTrails + previewTrails)
    }

    func removeRouteAnchor(at index: Int) {
        guard routePlan.anchorEdgeIDs.indices.contains(index) else {
            return
        }

        var nextAnchorEdgeIDs = routePlan.anchorEdgeIDs
        nextAnchorEdgeIDs.remove(at: index)
        applyRouteAnchorEdgeIDs(nextAnchorEdgeIDs, allTrails: primaryTrails + previewTrails)
    }

    func removeRouteAnchor(edgeID: String) {
        guard let index = routePlan.anchorEdgeIDs.firstIndex(of: edgeID) else {
            return
        }

        removeRouteAnchor(at: index)
    }

    func handleIncomingURL(_ url: URL) {
        guard let routePlan = CanonicalRoutePlan.routePlan(from: url) else {
            return
        }

        pendingIncomingRoutePlan = routePlan

        if destinations.isEmpty {
            return
        }

        selectDestination(id: routePlan.destinationId, manual: true)
    }

    func enableAutoLocation() {
        guard autoEligibleDestination != nil else {
            return
        }

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

    func updateVisibleRegion(_ region: MKCoordinateRegion) {
        if isIgnoringMapRegionUpdatesDuringStartupRestore {
            return
        }

        let nextVisibleMapRegion = PersistedMapRegion(region: region)
        let previousVisibleRegionCenter = visibleRegionCenter

        visibleMapRegion = nextVisibleMapRegion
        visibleRegionCenter = region.center
        persistBrowseSettings()

        if let previousVisibleRegionCenter,
           GeoMath.distanceKilometers(from: previousVisibleRegionCenter, to: region.center) < AppConfig.previewRegionRecheckDistanceKm {
            return
        }

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

            if let pendingIncomingRoutePlan,
               loadedDestinations.contains(where: { $0.id == pendingIncomingRoutePlan.destinationId }) {
                selectDestination(id: pendingIncomingRoutePlan.destinationId, manual: true)
                return
            }

            if !pendingStoredDestinationID.isEmpty,
               loadedDestinations.contains(where: { $0.id == pendingStoredDestinationID }) {
                let destinationID = pendingStoredDestinationID
                pendingStoredDestinationID = ""
                selectDestination(id: destinationID, manual: true)
                return
            }

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

                if pendingMapRegionPreservationDestinationID == destinationID {
                    isIgnoringMapRegionUpdatesDuringStartupRestore = false
                    pendingMapRegionPreservationDestinationID = nil
                } else if pendingRestoreContext == nil {
                    fitRequestID += 1
                }

                schedulePreviewEvaluation()

                let trails = response.features
                Task.detached(priority: .utility) {
                    GeoMath.warmPlanningGraph(for: trails)
                }
            } catch {
                guard token == primaryLoadToken else {
                    return
                }

                isIgnoringMapRegionUpdatesDuringStartupRestore = false
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

        guard let fallbackDestination = autoEligibleDestination(for: coordinate) else {
            if selectedDestinationID.isEmpty {
                applyFallbackSelectionIfNeeded()
            }
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
        let nearbyCandidates = GeoMath.boundedNearbyPreviewDestinations(
            destinations: destinations,
            reference: referenceCenter,
            radiusKilometers: AppConfig.suggestedDestinationRadiusKm,
            excludedID: selectedDestination.id,
            maxCount: AppConfig.maxNearbyDestinationPreviews
        )
        let previewDestinations = mergedPreviewDestinations(
            nearbyPreviewDestinations: nearbyCandidates,
            requiredPreviewDestinations: requiredPreviewDestinations(for: selectedDestination.id)
        )

        self.nearbyPreviewDestinations = previewDestinations

        guard !previewDestinations.isEmpty else {
            previewTrails = []
            previewPhase = .success
            let trails = primaryTrails
            Task.detached(priority: .utility) {
                GeoMath.warmPlanningGraph(for: trails)
            }
            applyPendingRouteHydrationIfNeeded()
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

            let trails = primaryTrails + nextPreviewTrails
            Task.detached(priority: .background) {
                GeoMath.warmPlanningGraph(for: trails)
            }
            applyPendingRouteHydrationIfNeeded()
        } catch {
            guard token == previewLoadToken else {
                return
            }

            previewTrails = []
            previewPhase = .failure("Nearby previews unavailable")
            applyPendingRouteHydrationIfNeeded()
        }
    }

    private func resolvePendingRestoreContext(for destinationID: String) -> PendingRouteRestoreContext? {
        if let pendingIncomingRoutePlan, pendingIncomingRoutePlan.destinationId == destinationID {
            return PendingRouteRestoreContext(
                routePlan: pendingIncomingRoutePlan,
                source: .url,
                shouldEnterPlanningMode: !pendingIncomingRoutePlan.anchorEdgeIds.isEmpty
            )
        }

        if let storedRoutePlan = routePlanStore.readRoutePlan(for: destinationID), storedRoutePlan.destinationId == destinationID {
            return PendingRouteRestoreContext(
                routePlan: storedRoutePlan,
                source: .storage,
                shouldEnterPlanningMode: pendingStoredPlanningModeActive && !storedRoutePlan.anchorEdgeIds.isEmpty
            )
        }

        return nil
    }

    private func requiredPreviewDestinations(for destinationID: String) -> [Destination] {
        let requiredIDs = [
            pendingRestoreContext?.routePlan.previewDestinationIDs(excluding: destinationID) ?? [],
            activeRouteDestinationIDs.filter { $0 != destinationID },
        ]
        .flatMap { $0 }
        .reduce(into: [String]()) { result, nextID in
            guard !result.contains(nextID) else {
                return
            }

            result.append(nextID)
        }

        return requiredIDs.compactMap { requiredID in
            destinations.first { $0.id == requiredID }
        }
    }

    private func mergedPreviewDestinations(
        nearbyPreviewDestinations: [Destination],
        requiredPreviewDestinations: [Destination]
    ) -> [Destination] {
        (requiredPreviewDestinations + nearbyPreviewDestinations).reduce(into: [Destination]()) { result, destination in
            guard !result.contains(where: { $0.id == destination.id }) else {
                return
            }

            result.append(destination)
        }
    }

    private func applyPendingRouteHydrationIfNeeded() {
        guard let pendingRestoreContext, pendingRestoreContext.routePlan.destinationId == selectedDestinationID else {
            return
        }

        let allTrails = primaryTrails + previewTrails
        let hydrationResult = GeoMath.hydrateRoutePlan(pendingRestoreContext.routePlan, allTrails: allTrails)
        let restoreSource = pendingRestoreContext.source

        switch hydrationResult.status {
        case .ok:
            routeHydrationNotice = nil
        case .partial:
            routeHydrationNotice = .partial(staleAnchorEdgeIDs: hydrationResult.staleAnchorEdgeIds)
        case .empty:
            routeHydrationNotice = pendingRestoreContext.routePlan.anchorEdgeIds.isEmpty
                ? nil
                : .empty(staleAnchorEdgeIDs: hydrationResult.staleAnchorEdgeIds)
        }

        if hydrationResult.validAnchorEdgeIds.isEmpty {
            routePlan.clear()
            activeRouteDestinationIDs = []

            if restoreSource == .storage {
                routePlanStore.clearRoutePlan(for: pendingRestoreContext.routePlan.destinationId)
            }

            fitRequestID += 1
        } else {
            let reorderedAnchorEdgeIDs = GeoMath.reorderedAnchorEdgeIDs(
                hydrationResult.validAnchorEdgeIds,
                allTrails: allTrails
            )
            routePlan.replaceAnchorEdges(with: reorderedAnchorEdgeIDs)
            activeRouteDestinationIDs = routeDestinationIDs(for: reorderedAnchorEdgeIDs, allTrails: allTrails)
            persistCurrentRoutePlan()
            fitRequestID += 1

            let sections = GeoMath.planningSections(for: reorderedAnchorEdgeIDs, allTrails: allTrails)
            scheduleElevationFetch(sections: sections, destinationID: selectedDestinationID)
        }

        if pendingRestoreContext.shouldEnterPlanningMode {
            isInPlanningMode = true
        }

        persistBrowseSettings()

        if restoreSource == .url {
            pendingIncomingRoutePlan = nil
        }

        self.pendingRestoreContext = nil
    }

    private func applyRouteAnchorEdgeIDs(_ anchorEdgeIDs: [String], allTrails: [TrailFeature]) {
        clearSelectedPlannedSection()
        routePlan.replaceAnchorEdges(with: anchorEdgeIDs)
        routeHydrationNotice = nil

        guard !selectedDestinationID.isEmpty else {
            activeRouteDestinationIDs = []
            return
        }

        if anchorEdgeIDs.isEmpty {
            activeRouteDestinationIDs = []
            routeElevation = nil
            routePlanStore.clearRoutePlan(for: selectedDestinationID)
            schedulePreviewEvaluation()
            return
        }

        activeRouteDestinationIDs = routeDestinationIDs(for: anchorEdgeIDs, allTrails: allTrails)
        persistCurrentRoutePlan()
        schedulePreviewEvaluation()

        let sections = GeoMath.planningSections(for: anchorEdgeIDs, allTrails: allTrails)
        scheduleElevationFetch(sections: sections, destinationID: selectedDestinationID)
    }

    private func routeDestinationIDs(for anchorEdgeIDs: [String], allTrails: [TrailFeature]) -> [String] {
        guard !selectedDestinationID.isEmpty else {
            return []
        }

        let trailsByID = Dictionary(uniqueKeysWithValues: allTrails.map { ($0.id, $0) })
        let sectionDestinationIDs = GeoMath.planningSections(for: anchorEdgeIDs, allTrails: allTrails).compactMap { section in
            trailsByID[section.trailID]?.destinationId
        }

        return CanonicalRoutePlan(
            destinationId: selectedDestinationID,
            anchorEdgeIds: anchorEdgeIDs,
            destinationIds: sectionDestinationIDs
        ).destinationIds
    }

    private func persistCurrentRoutePlan() {
        guard !selectedDestinationID.isEmpty, !routePlan.anchorEdgeIDs.isEmpty else {
            return
        }

        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(
                destinationId: selectedDestinationID,
                anchorEdgeIds: routePlan.anchorEdgeIDs,
                destinationIds: activeRouteDestinationIDs
            )
        )
    }

    private func persistBrowseSettings() {
        browseSettingsStore.writeBrowseSettings(
            BrowseSettings(
                destinationID: selectedDestinationID,
                mapRegion: visibleMapRegion,
                isPlanningModeActive: isInPlanningMode
            )
        )
    }

    private func matchingPlannedSectionIndex(
        forSelectedTrailID selectedTrailID: String,
        selectedSegment: TrailSegment?
    ) -> Int? {
        let candidateIndices = plannedSections.indices.filter { plannedSections[$0].trailID == selectedTrailID }

        guard !candidateIndices.isEmpty else {
            return nil
        }

        guard let selectedSegment else {
            return candidateIndices.count == 1 ? candidateIndices[0] : nil
        }

        return candidateIndices.first { index in
            let section = plannedSections[index]
            return abs(section.startDistanceKm - selectedSegment.startDistanceKm) < 0.0001 &&
                abs(section.endDistanceKm - selectedSegment.endDistanceKm) < 0.0001
        }
    }

    private func clearSelectedPlannedSection() {
        selectedPlannedSectionEdgeID = nil
        focusedPlannedSectionCoordinates = []
    }

    private func scheduleElevationFetch(sections: [PlanningSection], destinationID: String) {
        elevationTask?.cancel()

        guard !sections.isEmpty else {
            routeElevation = nil
            return
        }

        let anchorEdgeIDs = routePlan.anchorEdgeIDs
        let traversal = sections.map { section in
            lineStringGeometry(from: section.coordinates)
        }
        let sectionEntries = sections.map { section in
            ElevationSectionRequest(
                sectionKey: section.edgeID,
                geometry: lineStringGeometry(from: section.coordinates)
            )
        }
        let request = ElevationApiRequest(
            destinationId: destinationID,
            routeTraversal: traversal,
            routeSections: sectionEntries
        )

        elevationTask = Task {
            do {
                let response = try await apiClient.fetchElevation(request: request)
                // Discard stale results if destination or route changed during the await
                guard selectedDestinationID == destinationID,
                      routePlan.anchorEdgeIDs == anchorEdgeIDs else {
                    return
                }
                routeElevation = response
            } catch {
                guard selectedDestinationID == destinationID,
                      routePlan.anchorEdgeIDs == anchorEdgeIDs else {
                    return
                }
                routeElevation = nil
            }
        }
    }

    private var autoEligibleDestination: Destination? {
        guard let currentLocation else {
            return nil
        }

        return autoEligibleDestination(for: currentLocation)
    }

    private func autoEligibleDestination(for coordinate: CLLocationCoordinate2D) -> Destination? {
        guard let destination = GeoMath.closestDestination(destinations: destinations, reference: coordinate) else {
            return nil
        }

        let distanceKm = GeoMath.distanceKilometers(from: coordinate, to: destination.coordinate)
        return distanceKm <= AppConfig.autoLocationDestinationRadiusKm ? destination : nil
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

    func fetchElevation(request: ElevationApiRequest) async throws -> ElevationApiResponse {
        let requestURL = try makeURL(path: "/api/elevation", queryItems: [])
        let requestBody = try JSONEncoder().encode(request)
        var urlRequest = URLRequest(url: requestURL)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = requestBody
        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.badServerResponse)
        }
        return try decoder.decode(ElevationApiResponse.self, from: data)
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