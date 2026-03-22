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

enum LocationFollowMode: Equatable {
    case off
    case follow
    case followWithHeading

    var systemImageName: String {
        switch self {
        case .off:
            return "location"
        case .follow:
            return "location.fill"
        case .followWithHeading:
            return "location.north.line.fill"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .off:
            return "Center map on current location"
        case .follow:
            return "Enable heading-up auto rotate"
        case .followWithHeading:
            return "Turn off location follow"
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
    var onHeadingUpdate: ((CLLocationDirection?) -> Void)? { get set }
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
    let activeRouteOwnerDestinationID: String?

    enum CodingKeys: String, CodingKey {
        case destinationID = "destination"
        case mapRegion
        case isPlanningModeActive = "planningModeActive"
        case activeRouteOwnerDestinationID = "activeRouteOwnerDestination"
    }

    init(
        destinationID: String,
        mapRegion: PersistedMapRegion?,
        isPlanningModeActive: Bool = false,
        activeRouteOwnerDestinationID: String? = nil
    ) {
        self.destinationID = destinationID
        self.mapRegion = mapRegion
        self.isPlanningModeActive = isPlanningModeActive
        self.activeRouteOwnerDestinationID = activeRouteOwnerDestinationID
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        destinationID = try container.decode(String.self, forKey: .destinationID)
        mapRegion = try container.decodeIfPresent(PersistedMapRegion.self, forKey: .mapRegion)
        isPlanningModeActive = try container.decodeIfPresent(Bool.self, forKey: .isPlanningModeActive) ?? false
        activeRouteOwnerDestinationID = try container.decodeIfPresent(String.self, forKey: .activeRouteOwnerDestinationID)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(destinationID, forKey: .destinationID)
        try container.encodeIfPresent(mapRegion, forKey: .mapRegion)
        try container.encode(isPlanningModeActive, forKey: .isPlanningModeActive)
        try container.encodeIfPresent(activeRouteOwnerDestinationID, forKey: .activeRouteOwnerDestinationID)
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
    @Published private(set) var currentLocationHeading: CLLocationDirection?
    @Published private(set) var destinationsPhase: LoadPhase = .idle
    @Published private(set) var trailsPhase: LoadPhase = .idle
    @Published private(set) var previewPhase: LoadPhase = .idle
    @Published private(set) var requestError: String?
    @Published private(set) var isManualDestinationSelection = false
    @Published private(set) var fitRequestID = 0
    @Published private(set) var locationFocusRequestID = 0
    @Published private(set) var locationFollowMode: LocationFollowMode = .off
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
    @Published private(set) var selectedTrailSegments: [TrailSegment] = []
    @Published private(set) var selectedTrailSegment: TrailSegment?
    @Published private(set) var selectedRouteDetailSectionEdgeID: String?
    @Published private(set) var selectedRouteDetailResolvedSectionEdgeID: String?
    @Published private(set) var selectedRouteDetailContext: RouteAwareTrailDetailContext?
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
    private var pendingStoredRouteOwnerDestinationID: String?
    private var pendingMapRegionPreservationDestinationID: String?
    private var selectedTrailSegmentsRefreshID = UUID()
    private var isIgnoringMapRegionUpdatesDuringStartupRestore = false
    private var shouldPreserveMapRegionForNextAutoLocationSelection = false
    private var activeWatchTransferID: String?
    /// Stable canonical route owner. Set when the first anchor is added or a route is hydrated.
    /// Never mutated by browse-focus (selectedDestinationID) changes.
    private var routeOwnerDestinationID = ""
    /// Additive primary participants used for stable route rendering during restore and focus changes.
    /// This is intentionally stickier than canonical destinationIds so promoted sectors do not flicker
    /// back into preview rendering while the active route remains in play.
    private var primaryParticipantDestinationIDs: [String] = []

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

        locationService.onHeadingUpdate = { [weak self] heading in
            Task { @MainActor in
                self?.currentLocationHeading = heading
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

    private var routeOwnerDestination: Destination? {
        destinations.first { $0.id == routeOwnerDestinationID }
    }

    var canEnableAutoLocation: Bool {
        !isInPlanningMode
    }

    var isLocationFollowActive: Bool {
        locationFollowMode != .off
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

    private var lockedPrimaryDestinationIDs: Set<String> {
        var destinationIDs = Set<String>()

        if !selectedDestinationID.isEmpty {
            destinationIDs.insert(selectedDestinationID)
        }

        for destinationID in primaryParticipantDestinationIDs where !destinationID.isEmpty {
            destinationIDs.insert(destinationID)
        }

        return destinationIDs
    }

    var canonicalRoutePlan: CanonicalRoutePlan? {
        guard !routeOwnerDestinationID.isEmpty, !routePlan.anchorEdgeIDs.isEmpty else {
            return nil
        }

        return CanonicalRoutePlan(
            destinationId: routeOwnerDestinationID,
            anchorEdgeIds: routePlan.anchorEdgeIDs,
            destinationIds: activeRouteDestinationIDs
        )
    }

    var routeShareArtifact: RouteShareArtifact? {
        guard let canonicalRoutePlan,
              let destinationName = routeOwnerDestination?.name else {
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
              let ownerDestinationName = routeOwnerDestination?.name else {
            return nil
        }

        let sections = plannedSections
        guard !sections.isEmpty,
              sections.map(\.edgeID) == canonicalRoutePlan.anchorEdgeIds else {
            return nil
        }

        var sectionSummaries: [WatchRouteTransferSectionSummary] = []
        sectionSummaries.reserveCapacity(sections.count)

        for (index, section) in sections.enumerated() {
            guard let destinationID = section.destinationID else {
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
                routeLabel: "\(ownerDestinationName) route",
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
        pendingStoredRouteOwnerDestinationID = storedBrowseSettings?.activeRouteOwnerDestinationID
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
            disableLocationFollowIfNeeded()
        }

        if selectedDestinationID == id {
            persistBrowseSettings()
            return
        }

        let displayedTrails = primaryTrails + previewTrails
        if manual,
           !routePlan.isEmpty,
           (primaryParticipantDestinationIDs.contains(id) ||
            routeContainsDestination(
                id,
                anchorEdgeIDs: routePlan.anchorEdgeIDs,
                allTrails: displayedTrails
            )) {
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
        routeOwnerDestinationID = ""
        primaryParticipantDestinationIDs = []
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
        refreshSelectedTrailDerivedState(allTrails: primaryTrails + previewTrails)
        refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
    }

    func selectTrail(selection: TrailInspectionSelection?) {
        guard let trailID = selection?.trailID else {
            clearSelectedPlannedSection()
            selectedTrailID = nil
            selectedTrailSegments = []
            selectedTrailSegment = nil
            selectedRouteDetailSectionEdgeID = nil
            refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
            return
        }

        if isInPlanningMode {
            guard let anchorEdgeID = selection?.anchorEdgeID else {
                return
            }

            clearSelectedPlannedSection()

            let displayedTrails = primaryTrails + previewTrails

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
        } else {
            selectedTrailID = trailID
            refreshSelectedTrailDerivedState(allTrails: primaryTrails + previewTrails)
            selectedTrailSegment = selection?.segment
            selectedRouteDetailSectionEdgeID = selection?.anchorEdgeID
            refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
        }
    }

    func enterPlanningMode() {
        selectedTrailID = nil
        selectedTrailSegments = []
        selectedTrailSegment = nil
        selectedRouteDetailSectionEdgeID = nil
        clearSelectedPlannedSection()
        disableLocationFollowIfNeeded(forceFocusRefresh: isLocationFollowActive)
        isInPlanningMode = true
        refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)

        if !routePlan.isEmpty {
            fitRequestID += 1
        }

        persistBrowseSettings()
    }

    func exitPlanningMode() {
        clearSelectedPlannedSection()
        isInPlanningMode = false
        refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)

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

        disableLocationFollowForMapContextChange()
        fitRequestID += 1
    }

    func handleUserPanWhileLocationFollowing() {
        switch locationFollowMode {
        case .off:
            return
        case .follow:
            disableLocationFollowIfNeeded(forceFocusRefresh: true)
        case .followWithHeading:
            disableLocationFollowIfNeeded(forceFocusRefresh: true)
        }
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

        if selectedDestinationID == routePlan.destinationId {
            pendingRestoreContext = resolvePendingRestoreContext(for: routePlan.destinationId)

            if trailsPhase == .success {
                if hasLoadedAllRequiredPrimaryParticipants(
                    for: routePlan,
                    allTrails: primaryTrails + previewTrails
                ) {
                    applyPendingRouteHydrationIfNeeded()
                    schedulePreviewEvaluation()
                } else {
                    primaryLoadToken = UUID()
                    previewLoadToken = UUID()
                    trailsPhase = .loading
                    requestError = nil
                    loadPrimaryTrails(for: routePlan.destinationId, token: primaryLoadToken)
                }
            }

            return
        }

        selectDestination(id: routePlan.destinationId, manual: true)
    }

    func enableAutoLocation() {
        setLocationFollowMode(.follow, forceSelectionRefresh: true)
    }

    func toggleLocationFollow() {
        switch locationFollowMode {
        case .off:
            setLocationFollowMode(.follow, forceSelectionRefresh: true)
        case .follow:
            setLocationFollowMode(.followWithHeading, forceSelectionRefresh: true)
        case .followWithHeading:
            disableLocationFollowIfNeeded(forceFocusRefresh: true)
        }
    }

    func disableLocationFollowForMapContextChange() {
        guard locationFollowMode != .off else {
            return
        }

        disableLocationFollowIfNeeded(forceFocusRefresh: true)
    }

    private func setLocationFollowMode(
        _ mode: LocationFollowMode,
        forceSelectionRefresh: Bool
    ) {
        isManualDestinationSelection = false
        shouldPreserveMapRegionForNextAutoLocationSelection = true
        locationFollowMode = mode
        locationFocusRequestID += 1
        locationService.requestCurrentLocation()

        if let currentLocation {
            Task {
                await handleLocationUpdate(currentLocation, forceSelectionRefresh: forceSelectionRefresh)
            }
        }
    }

    private func disableLocationFollowIfNeeded(forceFocusRefresh: Bool = false) {
        guard locationFollowMode != .off || forceFocusRefresh else {
            return
        }

        locationFollowMode = .off
        locationFocusRequestID += 1
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

                let retainedRouteTrails = (primaryTrails + previewTrails).filter { trail in
                    guard let trailDestinationID = trail.destinationId else {
                        return false
                    }

                    return primaryParticipantDestinationIDs.contains(trailDestinationID) && trailDestinationID != destinationID
                }
                let primaryParticipantLoad = try await loadRequiredPrimaryParticipantTrailsIfNeeded(
                    for: destinationID,
                    baseTrails: response.features + retainedRouteTrails,
                    token: token
                )

                guard token == primaryLoadToken, destinationID == selectedDestinationID else {
                    return
                }

                replaceDisplayedTrails(with: primaryParticipantLoad)
                trailsPhase = .success

                if pendingMapRegionPreservationDestinationID == destinationID {
                    isIgnoringMapRegionUpdatesDuringStartupRestore = false
                    pendingMapRegionPreservationDestinationID = nil
                } else if pendingRestoreContext == nil {
                    fitRequestID += 1
                }

                applyPendingRouteHydrationIfNeeded()
                schedulePreviewEvaluation()

                let trails = primaryParticipantLoad
                Task.detached(priority: .utility) {
                    GeoMath.warmPlanningGraph(for: trails)
                }
            } catch {
                guard token == primaryLoadToken else {
                    return
                }

                isIgnoringMapRegionUpdatesDuringStartupRestore = false
                if routePlan.isEmpty {
                    primaryTrails = []
                    refreshRoutePresentationDerivedState(allTrails: primaryTrails + previewTrails)
                }
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
        let previewDestinations = GeoMath.boundedNearbyPreviewDestinations(
            destinations: destinations,
            reference: referenceCenter,
            radiusKilometers: AppConfig.suggestedDestinationRadiusKm,
            excludedID: selectedDestination.id,
            maxCount: AppConfig.maxNearbyDestinationPreviews
        ).filter { !lockedPrimaryDestinationIDs.contains($0.id) }

        let nextPreviewDestinationIDs = previewDestinations.map(\.id)
        let currentPreviewDestinationIDs = nearbyPreviewDestinations.map(\.id)
        let loadedPreviewDestinationIDs = Set(previewTrails.compactMap(\.destinationId))

        if nearbyPreviewDestinations != previewDestinations {
            nearbyPreviewDestinations = previewDestinations
        }

        if nextPreviewDestinationIDs == currentPreviewDestinationIDs,
           loadedPreviewDestinationIDs == Set(nextPreviewDestinationIDs) {
            previewPhase = .success
            return
        }

        guard !previewDestinations.isEmpty else {
            if !previewTrails.isEmpty {
                replaceDisplayedTrails(with: primaryTrails)
            }
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

            replaceDisplayedTrails(with: primaryTrails + nextPreviewTrails)
            previewPhase = .success

            let trails = primaryTrails + previewTrails
            Task.detached(priority: .background) {
                GeoMath.warmPlanningGraph(for: trails)
            }
        } catch {
            guard token == previewLoadToken else {
                return
            }

            replaceDisplayedTrails(with: primaryTrails)
            previewPhase = .failure("Nearby previews unavailable")
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

        if let pendingStoredRouteOwnerDestinationID,
           let storedRoutePlan = routePlanStore.readRoutePlan(for: pendingStoredRouteOwnerDestinationID),
           storedRoutePlan.destinationIds.contains(destinationID) {
            return PendingRouteRestoreContext(
                routePlan: storedRoutePlan,
                source: .storage,
                shouldEnterPlanningMode: pendingStoredPlanningModeActive && !storedRoutePlan.anchorEdgeIds.isEmpty
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

    private func applyPendingRouteHydrationIfNeeded() {
        guard let pendingRestoreContext,
              pendingRestoreContext.routePlan.destinationIds.contains(selectedDestinationID) else {
            return
        }

        // Restore the stable canonical route owner from the incoming plan.
        routeOwnerDestinationID = pendingRestoreContext.routePlan.destinationId

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
            routeOwnerDestinationID = ""
            primaryParticipantDestinationIDs = []
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
            promotePrimaryParticipants(activeRouteDestinationIDs)
            replaceDisplayedTrails(with: allTrails)
            persistCurrentRoutePlan()
            fitRequestID += 1

            let sections = GeoMath.planningSections(for: reorderedAnchorEdgeIDs, allTrails: primaryTrails + previewTrails)
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
            let storeKey = routeOwnerDestinationID.isEmpty ? selectedDestinationID : routeOwnerDestinationID
            routeOwnerDestinationID = ""
            primaryParticipantDestinationIDs = []
            activeRouteDestinationIDs = []
            routeElevation = nil
            routePlanStore.clearRoutePlan(for: storeKey)
            replaceDisplayedTrails(with: allTrails)
            schedulePreviewEvaluation()
            return
        }

        if routeOwnerDestinationID.isEmpty {
            routeOwnerDestinationID = selectedDestinationID
        }

        activeRouteDestinationIDs = routeDestinationIDs(for: anchorEdgeIDs, allTrails: allTrails)
        promotePrimaryParticipants(activeRouteDestinationIDs)
        replaceDisplayedTrails(with: allTrails)
        persistCurrentRoutePlan()
        schedulePreviewEvaluation()

        let sections = GeoMath.planningSections(for: anchorEdgeIDs, allTrails: primaryTrails + previewTrails)
        scheduleElevationFetch(sections: sections, destinationID: selectedDestinationID)
    }

    private func switchPrimaryDestinationPreservingRoute(to destinationID: String, allTrails: [TrailFeature]) {
        guard !destinationID.isEmpty,
              destinationID != selectedDestinationID else {
            return
        }

        resetWatchTransferLifecycle()
        let existingAnchorEdgeIDs = routePlan.anchorEdgeIDs
        let existingRouteDestinationIDs = activeRouteDestinationIDs

        previewTask?.cancel()
        pendingMapRegionPreservationDestinationID = nil
        isIgnoringMapRegionUpdatesDuringStartupRestore = false
        primaryLoadToken = UUID()
        previewLoadToken = UUID()
        selectedDestinationID = destinationID
        isManualDestinationSelection = true
        replaceDisplayedTrails(with: allTrails)
        nearbyPreviewDestinations = destinations.filter {
            !lockedPrimaryDestinationIDs.contains($0.id) && existingRouteDestinationIDs.contains($0.id)
        }
        trailsPhase = primaryTrails.isEmpty ? .loading : .success
        requestError = nil

        if existingAnchorEdgeIDs.isEmpty {
            activeRouteDestinationIDs = []
            routeElevation = nil
        } else {
            // routeOwnerDestinationID is kept stable; only browse focus (selectedDestinationID) changes.
            activeRouteDestinationIDs = CanonicalRoutePlan(
                destinationId: routeOwnerDestinationID,
                anchorEdgeIds: existingAnchorEdgeIDs,
                destinationIds: existingRouteDestinationIDs
            ).destinationIds
            promotePrimaryParticipants(activeRouteDestinationIDs)
            replaceDisplayedTrails(with: allTrails)
            persistCurrentRoutePlan()

            let sections = GeoMath.planningSections(for: existingAnchorEdgeIDs, allTrails: primaryTrails + previewTrails)
            scheduleElevationFetch(sections: sections, destinationID: destinationID)
        }

        persistBrowseSettings()
        loadPrimaryTrails(for: destinationID, token: primaryLoadToken)
    }

    private func replaceDisplayedTrails(with trails: [TrailFeature]) {
        let deduplicatedTrails = trails.reduce(into: [TrailFeature]()) { result, trail in
            guard !result.contains(where: {
                $0.id == trail.id && $0.destinationId == trail.destinationId
            }) else {
                return
            }

            result.append(trail)
        }

        let partitionedTrails = deduplicatedTrails.reduce(into: (primary: [TrailFeature](), preview: [TrailFeature]())) { result, trail in
            guard let destinationID = trail.destinationId else {
                result.preview.append(trail)
                return
            }

            if lockedPrimaryDestinationIDs.contains(destinationID) {
                result.primary.append(trail)
            } else {
                result.preview.append(trail)
            }
        }

        if primaryTrails != partitionedTrails.primary {
            primaryTrails = partitionedTrails.primary
        }

        if previewTrails != partitionedTrails.preview {
            previewTrails = partitionedTrails.preview
        }

        let displayedTrails = partitionedTrails.primary + partitionedTrails.preview
        refreshSelectedTrailDerivedState(allTrails: displayedTrails)
        refreshRoutePresentationDerivedState(allTrails: displayedTrails)
    }

    private func routeDestinationIDs(for anchorEdgeIDs: [String], allTrails: [TrailFeature]) -> [String] {
        guard !routeOwnerDestinationID.isEmpty else {
            return []
        }

        let sectionDestinationIDs = GeoMath.planningSections(for: anchorEdgeIDs, allTrails: allTrails).compactMap { section in
            section.destinationID
        }

        return ([routeOwnerDestinationID] + sectionDestinationIDs).reduce(into: [String]()) { result, destinationID in
            guard !destinationID.isEmpty, !result.contains(destinationID) else {
                return
            }

            result.append(destinationID)
        }
    }

    private func loadRequiredPrimaryParticipantTrailsIfNeeded(
        for destinationID: String,
        baseTrails: [TrailFeature],
        token: UUID
    ) async throws -> [TrailFeature] {
        guard let pendingRestoreContext,
              pendingRestoreContext.routePlan.destinationIds.contains(destinationID) else {
            return baseTrails
        }

        routeOwnerDestinationID = pendingRestoreContext.routePlan.destinationId
        promotePrimaryParticipants(pendingRestoreContext.routePlan.destinationIds)

        var combinedTrails = baseTrails
        var loadedDestinationIDs = Set(combinedTrails.compactMap(\.destinationId))
        let requiredDestinationIDs = pendingRestoreContext.routePlan.destinationIds.filter {
            $0 != destinationID && !loadedDestinationIDs.contains($0)
        }

        for requiredDestinationID in requiredDestinationIDs {
            let response = try await apiClient.fetchTrails(destinationID: requiredDestinationID)

            guard token == primaryLoadToken, destinationID == selectedDestinationID else {
                return combinedTrails
            }

            combinedTrails.append(contentsOf: response.features)
            loadedDestinationIDs.insert(requiredDestinationID)
        }

        return combinedTrails
    }

    private func hasLoadedAllRequiredPrimaryParticipants(
        for routePlan: CanonicalRoutePlan,
        allTrails: [TrailFeature]
    ) -> Bool {
        let loadedDestinationIDs = Set(allTrails.compactMap(\.destinationId))

        return routePlan.destinationIds.allSatisfy { loadedDestinationIDs.contains($0) }
    }

    private func promotePrimaryParticipants(_ destinationIDs: [String]) {
        primaryParticipantDestinationIDs = normalizedPrimaryParticipantDestinationIDs(
            existingDestinationIDs: primaryParticipantDestinationIDs,
            additionalDestinationIDs: destinationIDs
        )
    }

    private func normalizedPrimaryParticipantDestinationIDs(
        existingDestinationIDs: [String],
        additionalDestinationIDs: [String]
    ) -> [String] {
        ([routeOwnerDestinationID] + existingDestinationIDs + additionalDestinationIDs).reduce(into: [String]()) { result, destinationID in
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
        guard !routeOwnerDestinationID.isEmpty, !routePlan.anchorEdgeIDs.isEmpty else {
            return
        }

        routePlanStore.writeRoutePlan(
            CanonicalRoutePlan(
                destinationId: routeOwnerDestinationID,
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
                isPlanningModeActive: isInPlanningMode,
                activeRouteOwnerDestinationID: routeOwnerDestinationID.isEmpty ? nil : routeOwnerDestinationID
            )
        )
    }

    private func refreshSelectedTrailDerivedState(allTrails: [TrailFeature]) {
        let refreshID = UUID()
        selectedTrailSegmentsRefreshID = refreshID

        guard let selectedTrailID,
              let selectedTrail = allTrails.first(where: { $0.id == selectedTrailID }) else {
            selectedTrailSegments = []
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let segments = GeoMath.trailSegments(
                trail: selectedTrail,
                allTrails: allTrails,
                includeMidpoints: false
            )

            DispatchQueue.main.async {
                guard let self,
                      self.selectedTrailSegmentsRefreshID == refreshID,
                      self.selectedTrailID == selectedTrailID else {
                    return
                }

                self.selectedTrailSegments = segments
            }
        }
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

        refreshSelectedRouteDetailDerivedState(allTrails: allTrails)
    }

    private func refreshSelectedRouteDetailDerivedState(allTrails: [TrailFeature]) {
        guard !isInPlanningMode,
              !routePlan.anchorEdgeIDs.isEmpty else {
            selectedRouteDetailContext = nil
                        selectedRouteDetailResolvedSectionEdgeID = nil
            return
        }

        let plannedSections = GeoMath.planningSections(for: routePlan.anchorEdgeIDs, allTrails: allTrails)

        guard let matchingIndex = matchingPlannedSectionIndex(
            in: plannedSections,
            forSelectedTrailID: selectedTrailID,
            selectedAnchorEdgeID: selectedRouteDetailSectionEdgeID,
            selectedSegment: selectedTrailSegment
        ) else {
            selectedRouteDetailContext = nil
            selectedRouteDetailResolvedSectionEdgeID = nil
            return
        }

        let summary = RouteSummary.from(sections: plannedSections, elevationResponse: routeElevation)
        let routeMetrics = routeElevation?.route.status == "ok" ? routeElevation?.route.metrics : nil
        let selectedSection = plannedSections[matchingIndex]
        selectedRouteDetailResolvedSectionEdgeID = selectedSection.edgeID
        let selectedSectionElevation = routeElevation?.sectionElevation(for: selectedSection.edgeID)
        selectedRouteDetailContext = RouteAwareTrailDetailContext(
            selectedSectionNumber: routeDisplaySectionNumbersByEdgeID[selectedSection.edgeID] ?? (matchingIndex + 1),
            totalSections: summary.sectionCount,
            totalDistanceKm: summary.totalDistanceKm,
            ascentMeters: routeMetrics.map { Double($0.ascentMeters) },
            descentMeters: routeMetrics.map { Double($0.descentMeters) },
            selectedSectionElevation: selectedSectionElevation
        )
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
        in plannedSections: [PlanningSection],
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
            refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
            return
        }

        routeElevation = nil
        refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)

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
                refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
            } catch {
                guard selectedDestinationID == destinationID,
                      routePlan.anchorEdgeIDs == anchorEdgeIDs else {
                    return
                }
                routeElevation = nil
                refreshSelectedRouteDetailDerivedState(allTrails: primaryTrails + previewTrails)
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
