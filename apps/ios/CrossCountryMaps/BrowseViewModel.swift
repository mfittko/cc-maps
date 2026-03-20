import CoreLocation
import Foundation
import MapKit
import OSLog
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

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

    static let live = BrowseTimingConfig(
        destinationSuggestionDebounceNanoseconds: AppConfig.destinationSuggestionDebounceNanoseconds
    )

    static let immediate = BrowseTimingConfig(
        destinationSuggestionDebounceNanoseconds: 0
    )
}

protocol BrowseSettingsPersisting {
    func readBrowseSettings() -> BrowseSettings?
    func writeBrowseSettings(_ settings: BrowseSettings)
}

protocol WatchRouteTransferServing: AnyObject {
    var onSessionStateChange: ((WatchRouteTransferSessionState) -> Void)? { get set }
    var onAcknowledgement: ((WatchRouteTransferAcknowledgement) -> Void)? { get set }

    func activate()
    func currentSessionState() -> WatchRouteTransferSessionState
    func queueTransfer(id: String, envelope: WatchRouteTransferEnvelope) throws
}

enum WatchRouteTransferSendError: LocalizedError {
    case unsupported
    case noPairedWatch
    case watchAppMissing
    case sessionNotReady
    case serializationFailed

    var errorDescription: String? {
        switch self {
        case .unsupported, .noPairedWatch:
            return "No paired Apple Watch is available."
        case .watchAppMissing:
            return "Install the companion watch app before sending this route."
        case .sessionNotReady:
            return "The watch session is still activating. Wait for the watch companion connection to settle, then try again."
        case .serializationFailed:
            return "The route could not be prepared for watch transfer."
        }
    }
}

private struct WatchRouteTransferSubmission {
    static let messageTypeKey = "ccMapsMessageType"
    static let transferIDKey = "transferId"
    static let createdAtKey = "createdAt"
    static let envelopeKey = "envelope"
    static let routeTransferMessageType = "route-transfer"

    let id: String
    let createdAt: Date
    let envelope: WatchRouteTransferEnvelope

    var userInfo: [String: Any]? {
        guard let data = try? JSONEncoder().encode(envelope),
              let encodedEnvelope = String(data: data, encoding: .utf8) else {
            return nil
        }

        return [
            Self.messageTypeKey: Self.routeTransferMessageType,
            Self.transferIDKey: id,
            Self.createdAtKey: ISO8601DateFormatter().string(from: createdAt),
            Self.envelopeKey: encodedEnvelope,
        ]
    }
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
    @Published private(set) var routePresentationRefreshID = 0
    @Published private(set) var routeDisplaySections: [PlanningSection] = []
    @Published private(set) var routeDisplaySectionNumbersByEdgeID: [String: Int] = [:]
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
    @Published private(set) var watchTransferSessionState = WatchRouteTransferSessionState.unsupported
    @Published private(set) var watchTransferSendState: WatchRouteTransferSendState = .idle

    @Published var selectedTrailID: String?
    @Published private(set) var selectedTrailSegment: TrailSegment?
    @Published private(set) var selectedRouteDetailSectionEdgeID: String?
    @Published var visibleRegionCenter: CLLocationCoordinate2D?

    let locationService: BrowseLocationServing

    private let apiClient: BrowseAPIClient
    private let timingConfig: BrowseTimingConfig
    private let routePlanStore: RoutePlanPersisting
    private let browseSettingsStore: BrowseSettingsPersisting
    private let watchTransferService: WatchRouteTransferServing
    private var hasStarted = false
    private var lastAutoLocation: CLLocationCoordinate2D?
    private var primaryLoadToken = UUID()
    private var previewLoadToken = UUID()
    private var previewTask: Task<Void, Never>?
    private var elevationTask: Task<Void, Never>?
    private var pendingIncomingRoutePlan: CanonicalRoutePlan?
    private var pendingRestoreContext: PendingRouteRestoreContext?
    private var pendingStoredDestinationID = ""
    private var pendingStoredPlanningModeActive = false
    private var pendingMapRegionPreservationDestinationID: String?
    private var isIgnoringMapRegionUpdatesDuringStartupRestore = false
    private var shouldPreserveMapRegionForNextAutoLocationSelection = false
    private var activeWatchTransferID: String?

    init(
        apiClient: BrowseAPIClient = APIClient(),
        locationService: BrowseLocationServing = LocationService(),
        timingConfig: BrowseTimingConfig = .live,
        routePlanStore: RoutePlanPersisting = UserDefaultsRoutePlanStore(),
        browseSettingsStore: BrowseSettingsPersisting = BrowseSettingsStoreFactory.makeDefaultStore(),
        watchTransferService: WatchRouteTransferServing = WatchRouteTransferController()
    ) {
        self.apiClient = apiClient
        self.locationService = locationService
        self.timingConfig = timingConfig
        self.routePlanStore = routePlanStore
        self.browseSettingsStore = browseSettingsStore
        self.watchTransferService = watchTransferService
        watchTransferSessionState = watchTransferService.currentSessionState()

        locationService.onLocationUpdate = { [weak self] coordinate in
            Task { @MainActor in
                await self?.handleLocationUpdate(coordinate)
            }
        }

        locationService.onAuthorizationUnavailable = { [weak self] in
            Task { @MainActor in
                self?.requestError = nil
            }
        }

        watchTransferService.onSessionStateChange = { [weak self] sessionState in
            Task { @MainActor in
                self?.watchTransferSessionState = sessionState
            }
        }

        watchTransferService.onAcknowledgement = { [weak self] acknowledgement in
            Task { @MainActor in
                self?.handleWatchTransferAcknowledgement(acknowledgement)
            }
        }
    }

    var selectedDestination: Destination? {
        destinations.first { $0.id == selectedDestinationID }
    }

    var canEnableAutoLocation: Bool {
        true
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

    var watchTransferAvailability: WatchRouteTransferAvailability {
        guard watchTransferSessionState.isSupported, watchTransferSessionState.isPaired else {
            return .unavailableNoPairedWatch
        }

        guard watchTransferSessionState.isWatchAppInstalled else {
            return .unavailableWatchAppMissing
        }

        guard watchRouteTransferEnvelope != nil else {
            return .unavailableNoActiveRoute
        }

        guard watchTransferSessionState.isSessionReady else {
            return .temporarilyUnavailableSessionNotReady
        }

        return .ready
    }

    var canSendRouteToWatch: Bool {
        watchTransferAvailability == .ready && !isWatchTransferPending
    }

    var watchTransferStatusTitle: String {
        switch watchTransferSendState {
        case .idle:
            switch watchTransferAvailability {
            case .unavailableNoPairedWatch:
                return "Apple Watch unavailable"
            case .unavailableWatchAppMissing:
                return "Install watch companion"
            case .unavailableNoActiveRoute:
                return "No active route"
            case .temporarilyUnavailableSessionNotReady:
                return "Watch session starting"
            case .ready:
                return "Ready to send"
            }
        case .pending:
            return "Sending to watch"
        case .success:
            return "Route stored on watch"
        case .failure:
            return "Watch transfer failed"
        }
    }

    var watchTransferStatusMessage: String {
        switch watchTransferSendState {
        case .idle:
            switch watchTransferAvailability {
            case .unavailableNoPairedWatch:
                return "No paired Apple Watch is available."
            case .unavailableWatchAppMissing:
                return "Install the companion watch app before sending this route."
            case .unavailableNoActiveRoute:
                return "Add a route before sending it to Apple Watch."
            case .temporarilyUnavailableSessionNotReady:
                return "The watch session is still activating. Try again in a moment."
            case .ready:
                return "This route is ready for background-capable watch delivery."
            }
        case .pending:
            return "Waiting for the watch to accept and store this route."
        case .success:
            return "The watch accepted and persisted the latest route."
        case .failure(let message):
            return message
        }
    }

    var watchTransferButtonLabel: String {
        switch watchTransferSendState {
        case .success:
            return "Send Again"
        case .failure:
            return "Try Again"
        default:
            return "Send to Watch"
        }
    }

    var watchTransferShouldShowSendButton: Bool {
        watchTransferAvailability == .ready || isWatchTransferTerminal
    }

    var selectedRouteDetailContext: RouteAwareTrailDetailContext? {
        guard !isInPlanningMode,
              !routePlan.anchorEdgeIDs.isEmpty,
              let matchingIndex = matchingPlannedSectionIndex(
                forSelectedTrailID: selectedTrailID,
                selectedAnchorEdgeID: selectedRouteDetailSectionEdgeID,
                selectedSegment: selectedTrailSegment
              ) else {
            return nil
        }

        let summary = routeSummary
        let routeMetrics = routeElevation?.route.status == "ok" ? routeElevation?.route.metrics : nil
        let selectedSection = plannedSections[matchingIndex]
        let selectedSectionElevation = routeElevation?.sectionElevation(for: selectedSection.edgeID)
        return RouteAwareTrailDetailContext(
            selectedSectionNumber: routeDisplaySectionNumbersByEdgeID[selectedSection.edgeID] ?? (matchingIndex + 1),
            totalSections: summary.sectionCount,
            totalDistanceKm: summary.totalDistanceKm,
            ascentMeters: routeMetrics.map { Double($0.ascentMeters) },
            descentMeters: routeMetrics.map { Double($0.descentMeters) },
            selectedSectionElevation: selectedSectionElevation
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

        return "Waiting for current location or destination selection"
    }

    private var watchRouteTransferEnvelope: WatchRouteTransferEnvelope? {
        guard let canonicalRoutePlan,
              let destinationName = selectedDestination?.name else {
            return nil
        }

        let sections = plannedSections
        guard !sections.isEmpty,
              sections.map(\.edgeID) == canonicalRoutePlan.anchorEdgeIds else {
            return nil
        }

        let trailsByID = allTrails.keyedByIDPreservingFirst()
        var sectionSummaries: [WatchRouteTransferSectionSummary] = []
        sectionSummaries.reserveCapacity(sections.count)

        for (index, section) in sections.enumerated() {
            guard let destinationID = trailsByID[section.trailID]?.destinationId else {
                return nil
            }

            sectionSummaries.append(
                WatchRouteTransferSectionSummary(
                    anchorEdgeId: section.edgeID,
                    destinationId: destinationID,
                    distanceKm: roundedWatchTransferDistance(section.distanceKm),
                    label: "Section \(index + 1)"
                )
            )
        }

        let coordinates = mergedWatchTransferCoordinates(sections: sections)
        let geometry = coordinates.count >= 2
            ? WatchRouteTransferGeometry(
                type: "LineString",
                coordinates: coordinates.map { [$0.longitude, $0.latitude] }
            )
            : nil

        return WatchRouteTransferEnvelope(
            canonical: canonicalRoutePlan,
            derived: WatchRouteTransferDerivedPayload(
                routeLabel: "\(destinationName) route",
                routeGeometry: geometry,
                totalDistanceKm: routeSummary.totalDistanceKm,
                elevationGainM: routeSummary.ascentMeters,
                elevationLossM: routeSummary.descentMeters,
                sectionSummaries: sectionSummaries
            )
        )
    }

    private var isWatchTransferPending: Bool {
        if case .pending = watchTransferSendState {
            return true
        }

        return false
    }

    private var isWatchTransferTerminal: Bool {
        switch watchTransferSendState {
        case .success, .failure:
            return true
        case .idle, .pending:
            return false
        }
    }

    func start() {
        guard !hasStarted else {
            return
        }

        hasStarted = true
        watchTransferService.activate()
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

    func selectDestination(id: String, manual: Bool, preserveMapRegion: Bool = false) {
        guard selectedDestinationID != id || manual else {
            return
        }

        if manual {
            isManualDestinationSelection = true
        }

        if selectedDestinationID == id {
            persistBrowseSettings()
            return
        }

        let displayedTrails = primaryTrails + previewTrails
        if manual,
           !routePlan.isEmpty,
           routeContainsDestination(
               id,
               anchorEdgeIDs: routePlan.anchorEdgeIDs,
               allTrails: displayedTrails
           ) {
            isInPlanningMode = false
            selectedTrailID = nil
            selectedTrailSegment = nil
            selectedRouteDetailSectionEdgeID = nil
            clearSelectedPlannedSection()
            switchPrimaryDestinationPreservingRoute(to: id, allTrails: displayedTrails)
            return
        }

        if preserveMapRegion {
            pendingMapRegionPreservationDestinationID = id
            isIgnoringMapRegionUpdatesDuringStartupRestore = true
        } else if pendingMapRegionPreservationDestinationID != id {
            pendingMapRegionPreservationDestinationID = nil
            isIgnoringMapRegionUpdatesDuringStartupRestore = false
        }

        previewTask?.cancel()
        primaryLoadToken = UUID()
        previewLoadToken = UUID()
        resetWatchTransferLifecycle()

        isInPlanningMode = false
        routeHydrationNotice = nil
        routePlan.clear()
        refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
        activeRouteDestinationIDs = []
        clearSelectedPlannedSection()
        routeElevation = nil
        elevationTask?.cancel()
        elevationTask = nil

        selectedDestinationID = id
        selectedTrailID = nil
        selectedTrailSegment = nil
        selectedRouteDetailSectionEdgeID = nil
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
        selectedRouteDetailSectionEdgeID = nil
    }

    func selectTrail(selection: TrailInspectionSelection?) {
        guard let trailID = selection?.trailID else {
            clearSelectedPlannedSection()
            selectedTrailID = nil
            selectedTrailSegment = nil
            selectedRouteDetailSectionEdgeID = nil
            return
        }

        if isInPlanningMode {
            guard let anchorEdgeID = selection?.anchorEdgeID else {
                return
            }

            clearSelectedPlannedSection()

            let displayedTrails = primaryTrails + previewTrails
            let selectedTrailDestinationID = displayedTrails.first { $0.id == trailID }?.destinationId

            var nextAnchorEdgeIDs = routePlan.anchorEdgeIDs

            if let existingIndex = nextAnchorEdgeIDs.firstIndex(of: anchorEdgeID) {
                nextAnchorEdgeIDs.remove(at: existingIndex)
            } else {
                nextAnchorEdgeIDs.append(anchorEdgeID)
            }

            let reorderedAnchorEdgeIDs = GeoMath.reorderedAnchorEdgeIDs(
                nextAnchorEdgeIDs,
                allTrails: displayedTrails
            )

            applyRouteAnchorEdgeIDs(
                reorderedAnchorEdgeIDs,
                allTrails: displayedTrails
            )

            if let selectedTrailDestinationID,
               !selectedTrailDestinationID.isEmpty,
               selectedTrailDestinationID != selectedDestinationID,
               routeContainsDestination(
                   selectedTrailDestinationID,
                   anchorEdgeIDs: reorderedAnchorEdgeIDs,
                   allTrails: displayedTrails
               ) {
                switchPrimaryDestinationPreservingRoute(
                    to: selectedTrailDestinationID,
                    allTrails: displayedTrails
                )
            }
        } else {
            selectedTrailID = trailID
            selectedTrailSegment = selection?.segment
            selectedRouteDetailSectionEdgeID = selection?.anchorEdgeID
        }
    }

    func enterPlanningMode() {
        selectedTrailID = nil
        selectedTrailSegment = nil
        selectedRouteDetailSectionEdgeID = nil
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

    func focusPlannedRouteIfAvailable() {
        guard !isInPlanningMode, !routePlan.isEmpty else {
            return
        }

        fitRequestID += 1
    }

    func sendRouteToWatch() {
        guard watchTransferAvailability == .ready else {
            watchTransferSendState = .failure(watchTransferStatusMessage)
            return
        }

        guard let watchRouteTransferEnvelope else {
            watchTransferSendState = .failure("Add a route before sending it to Apple Watch.")
            return
        }

        let transferID = UUID().uuidString

        do {
            try watchTransferService.queueTransfer(
                id: transferID,
                envelope: watchRouteTransferEnvelope
            )
            activeWatchTransferID = transferID
            watchTransferSendState = .pending(transferID: transferID)
        } catch {
            activeWatchTransferID = nil
            watchTransferSendState = .failure(error.localizedDescription)
        }
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
        isManualDestinationSelection = false
        shouldPreserveMapRegionForNextAutoLocationSelection = true
        locationFocusRequestID += 1
        locationService.requestCurrentLocation()

        if let currentLocation {
            Task {
                await handleLocationUpdate(currentLocation, forceSelectionRefresh: true)
            }
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
                refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
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
                refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
                trailsPhase = .failure("Failed to load trails for the selected destination")
                requestError = error.localizedDescription
            }
        }
    }

    private func handleLocationUpdate(
        _ coordinate: CLLocationCoordinate2D,
        forceSelectionRefresh: Bool = false
    ) async {
        handledLocationUpdateCount += 1
        currentLocation = coordinate
        let shouldPreserveMapRegion = shouldPreserveMapRegionForNextAutoLocationSelection
        shouldPreserveMapRegionForNextAutoLocationSelection = false

        guard !isManualDestinationSelection, !destinations.isEmpty else {
            return
        }

          if !forceSelectionRefresh,
              let lastAutoLocation,
           GeoMath.distanceKilometers(from: lastAutoLocation, to: coordinate) < AppConfig.currentLocationRecheckDistanceKm {
            return
        }

        lastAutoLocation = coordinate

        do {
            if let matchedDestination = try await matchedDestinationForCurrentLocation(coordinate),
               matchedDestination.id != selectedDestinationID {
                selectDestination(
                    id: matchedDestination.id,
                    manual: false,
                    preserveMapRegion: shouldPreserveMapRegion
                )
                return
            }
        } catch {
            // Live destination switching must stay trail-based. If nearby-trail lookup fails,
            // keep the current selection rather than falling back to destination-center proximity.
        }
    }

    private func matchedDestinationForCurrentLocation(
        _ coordinate: CLLocationCoordinate2D
    ) async throws -> Destination? {
        let nearbyTrails = try await apiClient.fetchNearbyTrails(reference: coordinate)

        if let matchedDestination = GeoMath.closestDestinationByTrailProximity(
            destinations: destinations,
            trails: nearbyTrails.features,
            reference: coordinate,
            thresholdKilometers: AppConfig.currentLocationTrackMatchThresholdKm
        ) {
            return matchedDestination
        }

        return GeoMath.closestDestinationByNearestTrail(
            destinations: destinations,
            trails: nearbyTrails.features,
            reference: coordinate
        )
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
            refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
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
            refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
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
            refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
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
            refreshRoutePresentationDerivedState(allTrails: allTrails)

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
            refreshRoutePresentationDerivedState(allTrails: allTrails)
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
        resetWatchTransferLifecycle()
        clearSelectedPlannedSection()
        routePlan.replaceAnchorEdges(with: anchorEdgeIDs)
        refreshRoutePresentationDerivedState(allTrails: allTrails)
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

    private func switchPrimaryDestinationPreservingRoute(to destinationID: String, allTrails: [TrailFeature]) {
        guard !destinationID.isEmpty,
              destinationID != selectedDestinationID else {
            return
        }

        let previousDestinationID = selectedDestinationID
        let existingAnchorEdgeIDs = routePlan.anchorEdgeIDs
        let existingRouteDestinationIDs = activeRouteDestinationIDs
        let repartitionedPrimaryTrails = allTrails.filter { $0.destinationId == destinationID }
        let repartitionedPreviewTrails = allTrails.filter { $0.destinationId != destinationID }

        previewTask?.cancel()
        pendingMapRegionPreservationDestinationID = nil
        isIgnoringMapRegionUpdatesDuringStartupRestore = false
        primaryLoadToken = UUID()
        previewLoadToken = UUID()
        selectedDestinationID = destinationID
        isManualDestinationSelection = true
        primaryTrails = repartitionedPrimaryTrails
        previewTrails = repartitionedPreviewTrails
        refreshRoutePresentationDerivedState(allTrails: repartitionedPrimaryTrails + repartitionedPreviewTrails)
        nearbyPreviewDestinations = destinations.filter {
            existingRouteDestinationIDs.contains($0.id) && $0.id != destinationID
        }
        trailsPhase = repartitionedPrimaryTrails.isEmpty ? .loading : .success
        requestError = nil

        if !previousDestinationID.isEmpty {
            routePlanStore.clearRoutePlan(for: previousDestinationID)
        }

        if existingAnchorEdgeIDs.isEmpty {
            activeRouteDestinationIDs = []
            routeElevation = nil
        } else {
            activeRouteDestinationIDs = CanonicalRoutePlan(
                destinationId: destinationID,
                anchorEdgeIds: existingAnchorEdgeIDs,
                destinationIds: existingRouteDestinationIDs
            ).destinationIds
            refreshRoutePresentationDerivedState(allTrails: allTrails)
            persistCurrentRoutePlan()

            let sections = GeoMath.planningSections(for: existingAnchorEdgeIDs, allTrails: allTrails)
            scheduleElevationFetch(sections: sections, destinationID: destinationID)
        }

        persistBrowseSettings()
        loadPrimaryTrails(for: destinationID, token: primaryLoadToken)
    }

    private func routeDestinationIDs(for anchorEdgeIDs: [String], allTrails: [TrailFeature]) -> [String] {
        guard !selectedDestinationID.isEmpty else {
            return []
        }

        let trailsByID = allTrails.keyedByIDPreservingFirst()
        let sectionDestinationIDs = GeoMath.planningSections(for: anchorEdgeIDs, allTrails: allTrails).compactMap { section in
            trailsByID[section.trailID]?.destinationId
        }

        return ([selectedDestinationID] + sectionDestinationIDs).reduce(into: [String]()) { result, destinationID in
            guard !destinationID.isEmpty, !result.contains(destinationID) else {
                return
            }

            result.append(destinationID)
        }
    }

    private func routeContainsDestination(
        _ destinationID: String,
        anchorEdgeIDs: [String],
        allTrails: [TrailFeature]
    ) -> Bool {
        routeDestinationIDs(for: anchorEdgeIDs, allTrails: allTrails).contains(destinationID)
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

    private func refreshRoutePresentationDerivedState(allTrails: [TrailFeature]) {
        let nextDisplaySections = GeoMath.displayOrderedPlanningSections(
            for: routePlan.anchorEdgeIDs,
            allTrails: allTrails
        )
        let nextDisplaySectionNumbersByEdgeID = Dictionary(
            uniqueKeysWithValues: nextDisplaySections.enumerated().map { index, section in
                (section.edgeID, index + 1)
            }
        )

        let didChange = nextDisplaySections != routeDisplaySections ||
            nextDisplaySectionNumbersByEdgeID != routeDisplaySectionNumbersByEdgeID

        routeDisplaySections = nextDisplaySections
        routeDisplaySectionNumbersByEdgeID = nextDisplaySectionNumbersByEdgeID

        if didChange {
            routePresentationRefreshID += 1
        }
    }

    private func handleWatchTransferAcknowledgement(_ acknowledgement: WatchRouteTransferAcknowledgement) {
        guard acknowledgement.transferID == activeWatchTransferID else {
            return
        }

        switch acknowledgement.result {
        case .success:
            watchTransferSendState = .success(transferID: acknowledgement.transferID)
        case .invalidPayload, .persistenceFailure:
            watchTransferSendState = .failure(
                acknowledgement.result.failureMessage ?? "The watch could not store this route."
            )
        }
    }

    private func resetWatchTransferLifecycle() {
        activeWatchTransferID = nil
        watchTransferSendState = .idle
    }

    private func roundedWatchTransferDistance(_ value: Double) -> Double {
        let factor = 100.0
        return (value * factor).rounded() / factor
    }

    private func mergedWatchTransferCoordinates(sections: [PlanningSection]) -> [CLLocationCoordinate2D] {
        sections.reduce(into: [CLLocationCoordinate2D]()) { coordinates, section in
            for coordinate in section.coordinates {
                if let previous = coordinates.last,
                   abs(previous.latitude - coordinate.latitude) < 0.000_001,
                   abs(previous.longitude - coordinate.longitude) < 0.000_001 {
                    continue
                }

                coordinates.append(coordinate)
            }
        }
    }

    private func matchingPlannedSectionIndex(
        forSelectedTrailID selectedTrailID: String?,
        selectedAnchorEdgeID: String?,
        selectedSegment: TrailSegment?
    ) -> Int? {
        if let selectedAnchorEdgeID,
           let selectedIndex = plannedSections.firstIndex(where: { $0.edgeID == selectedAnchorEdgeID }) {
            return selectedIndex
        }

        guard let selectedTrailID else {
            return nil
        }

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

        routeElevation = nil

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

final class WatchRouteTransferController: NSObject, WatchRouteTransferServing {
    var onSessionStateChange: ((WatchRouteTransferSessionState) -> Void)?
    var onAcknowledgement: ((WatchRouteTransferAcknowledgement) -> Void)?
    private let logger = Logger(subsystem: "cc-maps", category: "WatchTransferPhone")

#if canImport(WatchConnectivity)
    private let session: WCSession?

    override init() {
        session = WCSession.isSupported() ? WCSession.default : nil
        super.init()
        session?.delegate = self
    }
#else
    override init() {
        super.init()
    }
#endif

    func activate() {
#if canImport(WatchConnectivity)
    logSessionSnapshot(reason: "Activating watch session")
        session?.activate()
        onSessionStateChange?(currentSessionState())
#else
    logger.notice("WatchConnectivity unsupported while activating watch transfer session")
#endif
    }

    func currentSessionState() -> WatchRouteTransferSessionState {
#if canImport(WatchConnectivity)
        guard let session else {
            return .unsupported
        }

        return WatchRouteTransferSessionState(
            isSupported: true,
            isPaired: session.isPaired,
            isWatchAppInstalled: session.isWatchAppInstalled,
            isSessionReady: session.activationState == .activated
        )
#else
        return .unsupported
#endif
    }

    func queueTransfer(id: String, envelope: WatchRouteTransferEnvelope) throws {
#if canImport(WatchConnectivity)
        guard let session else {
            logger.error("Route transfer \(id, privacy: .public) failed: WatchConnectivity session unavailable")
            throw WatchRouteTransferSendError.unsupported
        }

        guard session.isPaired else {
            logger.error("Route transfer \(id, privacy: .public) failed: no paired watch. \(self.sessionSnapshot(for: session), privacy: .public)")
            throw WatchRouteTransferSendError.noPairedWatch
        }

        guard session.isWatchAppInstalled else {
            logger.error("Route transfer \(id, privacy: .public) failed: watch app missing. \(self.sessionSnapshot(for: session), privacy: .public)")
            throw WatchRouteTransferSendError.watchAppMissing
        }

        guard session.activationState == .activated else {
            logger.error("Route transfer \(id, privacy: .public) failed: session not ready. \(self.sessionSnapshot(for: session), privacy: .public)")
            throw WatchRouteTransferSendError.sessionNotReady
        }

        let submission = WatchRouteTransferSubmission(
            id: id,
            createdAt: Date(),
            envelope: envelope
        )

        guard let userInfo = submission.userInfo else {
            logger.error(
                "Route transfer \(id, privacy: .public) failed: envelope serialization. anchors=\(envelope.canonical.anchorEdgeIds.count) destinations=\(envelope.canonical.destinationIds.count)"
            )
            throw WatchRouteTransferSendError.serializationFailed
        }

        let payloadBytes = (userInfo[WatchRouteTransferSubmission.envelopeKey] as? String)?.utf8.count ?? 0
        logger.notice(
            "Queueing route transfer \(id, privacy: .public). payloadBytes=\(payloadBytes) anchors=\(envelope.canonical.anchorEdgeIds.count) destinations=\(envelope.canonical.destinationIds.count) outstandingBefore=\(session.outstandingUserInfoTransfers.count). \(self.sessionSnapshot(for: session), privacy: .public)"
        )
        let transfer = session.transferUserInfo(userInfo)
        logger.notice(
            "Queued route transfer \(id, privacy: .public). isTransferring=\(transfer.isTransferring) outstandingAfter=\(session.outstandingUserInfoTransfers.count)"
        )
#else
        logger.error("Route transfer \(id, privacy: .public) failed: WatchConnectivity unsupported")
        throw WatchRouteTransferSendError.unsupported
#endif
    }

#if canImport(WatchConnectivity)
    private func sessionSnapshot(for session: WCSession) -> String {
        "activation=\(session.activationState.rawValue) paired=\(session.isPaired) watchAppInstalled=\(session.isWatchAppInstalled) reachable=\(session.isReachable) outstandingTransfers=\(session.outstandingUserInfoTransfers.count)"
    }

    private func logSessionSnapshot(reason: String, session: WCSession? = nil) {
        guard let activeSession = session ?? self.session else {
            logger.notice("\(reason, privacy: .public): WatchConnectivity session unavailable")
            return
        }

        logger.notice("\(reason, privacy: .public): \(self.sessionSnapshot(for: activeSession), privacy: .public)")
    }
#endif
}

#if canImport(WatchConnectivity)
extension WatchRouteTransferController: WCSessionDelegate {
    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        if let error {
            logger.error(
                "Watch session activation completed with error. state=\(activationState.rawValue) error=\(String(describing: error), privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
            )
        } else {
            logger.notice(
                "Watch session activation completed. state=\(activationState.rawValue). \(self.sessionSnapshot(for: session), privacy: .public)"
            )
        }
        onSessionStateChange?(currentSessionState())
    }

    func sessionDidBecomeInactive(_ session: WCSession) {
        logSessionSnapshot(reason: "Watch session became inactive", session: session)
        onSessionStateChange?(currentSessionState())
    }

    func sessionDidDeactivate(_ session: WCSession) {
        logSessionSnapshot(reason: "Watch session did deactivate", session: session)
        onSessionStateChange?(currentSessionState())
        session.activate()
        logSessionSnapshot(reason: "Reactivating watch session after deactivation", session: session)
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        logSessionSnapshot(reason: "Watch session reachability changed", session: session)
        onSessionStateChange?(currentSessionState())
    }

    func sessionWatchStateDidChange(_ session: WCSession) {
        logSessionSnapshot(reason: "Watch session watch state changed", session: session)
        onSessionStateChange?(currentSessionState())
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        let keys = userInfo.keys.sorted().joined(separator: ",")
        guard let messageType = userInfo["ccMapsMessageType"] as? String,
              messageType == "route-transfer-ack",
              let transferID = userInfo["transferId"] as? String,
              let resultValue = userInfo["result"] as? String,
              let result = WatchRouteTransferAcknowledgementResult(rawValue: resultValue) else {
            logger.error(
                "Received unexpected watch userInfo on phone. keys=\(keys, privacy: .public) \(self.sessionSnapshot(for: session), privacy: .public)"
            )
            return
        }

        logger.notice(
            "Received watch acknowledgement \(result.rawValue, privacy: .public) for transfer \(transferID, privacy: .public). keys=\(keys, privacy: .public)"
        )
        onAcknowledgement?(WatchRouteTransferAcknowledgement(transferID: transferID, result: result))
    }

    func session(
        _ session: WCSession,
        didFinish userInfoTransfer: WCSessionUserInfoTransfer,
        error: (any Error)?
    ) {
        let transferID = (userInfoTransfer.userInfo[WatchRouteTransferSubmission.transferIDKey] as? String) ?? "unknown"
        if let error {
            logger.error(
                "Finished queued phone transfer \(transferID, privacy: .public) with error=\(String(describing: error), privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
            )
        } else {
            logger.notice(
                "Finished queued phone transfer \(transferID, privacy: .public) successfully. \(self.sessionSnapshot(for: session), privacy: .public)"
            )
        }
    }
}
#endif
