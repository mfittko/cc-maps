import Foundation

/// Ordered list of canonical graph edge IDs that form a planned route.
/// Anchor identity is immutable: only order changes through explicit reverse or remove actions.
struct RoutePlanState: Equatable {
    private(set) var anchorEdgeIDs: [String]

    init(anchorEdgeIDs: [String] = []) {
        self.anchorEdgeIDs = anchorEdgeIDs
    }

    var isEmpty: Bool { anchorEdgeIDs.isEmpty }
    var sectionCount: Int { anchorEdgeIDs.count }

    func contains(_ edgeID: String) -> Bool {
        anchorEdgeIDs.contains(edgeID)
    }

    /// Appends the edge to the end of the plan if not already present.
    /// If the edge is already in the plan, removes it (toggle semantics matching the web planner).
    mutating func toggleAnchorEdge(_ edgeID: String) {
        if let idx = anchorEdgeIDs.firstIndex(of: edgeID) {
            anchorEdgeIDs.remove(at: idx)
        } else {
            anchorEdgeIDs.append(edgeID)
        }
    }

    mutating func replaceAnchorEdges(with edgeIDs: [String]) {
        anchorEdgeIDs = edgeIDs
    }

    /// Removes the anchor at the given index without affecting other anchor identities or their order.
    mutating func removeAnchor(at index: Int) {
        guard anchorEdgeIDs.indices.contains(index) else { return }
        anchorEdgeIDs.remove(at: index)
    }

    /// Inverts anchor order without mutating anchor identities.
    mutating func reverse() {
        anchorEdgeIDs.reverse()
    }

    /// Removes all anchors and resets derived route state.
    mutating func clear() {
        anchorEdgeIDs.removeAll()
    }
}

protocol RoutePlanPersisting {
    func readRoutePlan(for destinationID: String) -> CanonicalRoutePlan?
    func writeRoutePlan(_ routePlan: CanonicalRoutePlan)
    func clearRoutePlan(for destinationID: String)
}

struct UserDefaultsRoutePlanStore: RoutePlanPersisting {
    private let userDefaults: UserDefaults
    private let storageKey: String

    init(
        userDefaults: UserDefaults = .standard,
        storageKey: String = AppConfig.routePlanStorageKey
    ) {
        self.userDefaults = userDefaults
        self.storageKey = storageKey
    }

    func readRoutePlan(for destinationID: String) -> CanonicalRoutePlan? {
        guard let rawValue = userDefaults.string(forKey: Self.storageKey(for: destinationID, storageKey: storageKey)) else {
            return nil
        }

        return CanonicalRoutePlan.decodeStoredPayload(rawValue)
    }

    func writeRoutePlan(_ routePlan: CanonicalRoutePlan) {
        guard let encoded = routePlan.encodedForStorage else {
            return
        }

        userDefaults.set(encoded, forKey: Self.storageKey(for: routePlan.destinationId, storageKey: storageKey))
    }

    func clearRoutePlan(for destinationID: String) {
        userDefaults.removeObject(forKey: Self.storageKey(for: destinationID, storageKey: storageKey))
    }

    static func storageKey(for destinationID: String, storageKey: String) -> String {
        "\(storageKey):plan:\(destinationID)"
    }
}

struct CanonicalRoutePlan: Codable, Equatable {
    static let currentVersion = 2
    static let legacyVersion = 1

    let version: Int
    let destinationId: String
    let destinationIds: [String]
    let anchorEdgeIds: [String]

    init(destinationId: String, anchorEdgeIds: [String], destinationIds: [String] = []) {
        version = Self.currentVersion
        self.destinationId = destinationId
        self.destinationIds = Self.normalizeDestinationIDs(primaryDestinationID: destinationId, destinationIDs: destinationIds)
        self.anchorEdgeIds = anchorEdgeIds
    }

    var encodedForStorage: String? {
        guard let data = try? JSONEncoder().encode(self) else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    var encodedForURL: String? {
        guard Self.isValidCurrentPayload(self) else {
            return nil
        }

        return "\(version)|\(destinationId)|\(destinationIds.joined(separator: ";"))|\(anchorEdgeIds.joined(separator: ","))"
    }

    func previewDestinationIDs(excluding primaryDestinationID: String) -> [String] {
        destinationIds.filter { $0 != primaryDestinationID }
    }

    static func decodeStoredPayload(_ rawValue: String) -> CanonicalRoutePlan? {
        guard let data = rawValue.data(using: .utf8),
              let payload = try? JSONDecoder().decode(RoutePlanPayload.self, from: data) else {
            return nil
        }

        return migrated(from: payload)
    }

    static func decodeFromURL(_ encoded: String?) -> CanonicalRoutePlan? {
        guard let encoded, !encoded.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }

        guard let firstPipe = encoded.firstIndex(of: "|") else {
            return nil
        }

        let afterFirstPipe = encoded.index(after: firstPipe)
        guard let secondPipe = encoded[afterFirstPipe...].firstIndex(of: "|") else {
            return nil
        }

        let versionString = String(encoded[..<firstPipe])
        let destinationID = String(encoded[afterFirstPipe..<secondPipe])

        guard let version = Int(versionString), version >= 1, isNumericIdentifier(destinationID) else {
            return nil
        }

        if version == legacyVersion {
            let anchorsStartIndex = encoded.index(after: secondPipe)
            let anchorsValue = String(encoded[anchorsStartIndex...])
            let anchorEdgeIDs = anchorsValue.isEmpty ? [] : anchorsValue.split(separator: ",").map(String.init)

            guard anchorEdgeIDs.allSatisfy({ !$0.isEmpty }) else {
                return nil
            }

            return CanonicalRoutePlan(destinationId: destinationID, anchorEdgeIds: anchorEdgeIDs, destinationIds: [destinationID])
        }

        guard version == currentVersion else {
            return nil
        }

        let afterSecondPipe = encoded.index(after: secondPipe)
        guard let thirdPipe = encoded[afterSecondPipe...].firstIndex(of: "|") else {
            return nil
        }

        let destinationIDsValue = String(encoded[afterSecondPipe..<thirdPipe])
        let anchorIDsValue = String(encoded[encoded.index(after: thirdPipe)...])
        let destinationIDs = destinationIDsValue.isEmpty ? [] : destinationIDsValue.split(separator: ";").map(String.init)
        let anchorEdgeIDs = anchorIDsValue.isEmpty ? [] : anchorIDsValue.split(separator: ",").map(String.init)

        guard destinationIDs.allSatisfy(isNumericIdentifier), anchorEdgeIDs.allSatisfy({ !$0.isEmpty }) else {
            return nil
        }

        return CanonicalRoutePlan(destinationId: destinationID, anchorEdgeIds: anchorEdgeIDs, destinationIds: destinationIDs)
    }

    static func routePlan(from url: URL) -> CanonicalRoutePlan? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }

        let routeValue = components.queryItems?.first { $0.name == "route" }?.value
        return decodeFromURL(routeValue)
    }

    private static func migrated(from payload: RoutePlanPayload) -> CanonicalRoutePlan? {
        if isValidCurrentPayload(payload) {
            return CanonicalRoutePlan(
                destinationId: payload.destinationId ?? "",
                anchorEdgeIds: payload.anchorEdgeIds ?? [],
                destinationIds: payload.destinationIds ?? []
            )
        }

        if isValidLegacyPayload(payload), let destinationID = payload.destinationId {
            return CanonicalRoutePlan(
                destinationId: destinationID,
                anchorEdgeIds: payload.anchorEdgeIds ?? [],
                destinationIds: [destinationID]
            )
        }

        return nil
    }

    private static func isValidCurrentPayload(_ payload: RoutePlanPayload) -> Bool {
        guard payload.version == currentVersion,
              let destinationID = payload.destinationId,
              let destinationIDs = payload.destinationIds,
              let anchorEdgeIDs = payload.anchorEdgeIds,
              isNumericIdentifier(destinationID),
              !destinationIDs.isEmpty,
              destinationIDs.allSatisfy(isNumericIdentifier),
              anchorEdgeIDs.allSatisfy({ !$0.isEmpty }) else {
            return false
        }

        return true
    }

    private static func isValidCurrentPayload(_ payload: CanonicalRoutePlan) -> Bool {
        isNumericIdentifier(payload.destinationId) &&
            !payload.destinationIds.isEmpty &&
            payload.destinationIds.allSatisfy(isNumericIdentifier) &&
            payload.anchorEdgeIds.allSatisfy { !$0.isEmpty }
    }

    private static func isValidLegacyPayload(_ payload: RoutePlanPayload) -> Bool {
        guard payload.version == legacyVersion,
              let destinationID = payload.destinationId,
              let anchorEdgeIDs = payload.anchorEdgeIds,
              isNumericIdentifier(destinationID),
              anchorEdgeIDs.allSatisfy({ !$0.isEmpty }) else {
            return false
        }

        return true
    }

    private static func normalizeDestinationIDs(primaryDestinationID: String, destinationIDs: [String]) -> [String] {
        var normalizedDestinationIDs = [primaryDestinationID]

        for candidateID in destinationIDs {
            guard isNumericIdentifier(candidateID), !normalizedDestinationIDs.contains(candidateID) else {
                continue
            }

            normalizedDestinationIDs.append(candidateID)
        }

        return normalizedDestinationIDs
    }

    private static func isNumericIdentifier(_ value: String) -> Bool {
        !value.isEmpty && value.allSatisfy(\.isNumber)
    }

    private struct RoutePlanPayload: Decodable {
        let version: Int?
        let destinationId: String?
        let destinationIds: [String]?
        let anchorEdgeIds: [String]?
    }
}

struct WatchRouteTransferEnvelope: Codable, Equatable {
    let version: Int
    let canonical: CanonicalRoutePlan
    let derived: WatchRouteTransferDerivedPayload?

    init(canonical: CanonicalRoutePlan, derived: WatchRouteTransferDerivedPayload?) {
        version = CanonicalRoutePlan.currentVersion
        self.canonical = canonical
        self.derived = derived
    }
}

struct WatchRouteTransferDerivedPayload: Codable, Equatable {
    let routeLabel: String?
    let routeGeometry: WatchRouteTransferGeometry?
    let totalDistanceKm: Double?
    let elevationGainM: Double?
    let elevationLossM: Double?
    let sectionSummaries: [WatchRouteTransferSectionSummary]
}

struct WatchRouteTransferGeometry: Codable, Equatable {
    let type: String
    let coordinates: [[Double]]
}

struct WatchRouteTransferSectionSummary: Codable, Equatable {
    let anchorEdgeId: String
    let destinationId: String
    let distanceKm: Double
    let label: String?
}

enum WatchRouteTransferAvailability: Equatable {
    case unavailableNoPairedWatch
    case unavailableWatchAppMissing
    case unavailableNoActiveRoute
    case temporarilyUnavailableSessionNotReady
    case ready
}

enum WatchRouteTransferSendState: Equatable {
    case idle
    case pending(transferID: String)
    case success(transferID: String)
    case failure(String)
}

struct WatchRouteTransferSessionState: Equatable {
    let isSupported: Bool
    let isPaired: Bool
    let isWatchAppInstalled: Bool
    let isSessionReady: Bool

    static let unsupported = WatchRouteTransferSessionState(
        isSupported: false,
        isPaired: false,
        isWatchAppInstalled: false,
        isSessionReady: false
    )
}

enum WatchRouteTransferAcknowledgementResult: String, Codable, Equatable {
    case success = "acknowledged-success"
    case invalidPayload = "acknowledged-rejected-invalid-payload"
    case persistenceFailure = "acknowledged-persistence-failure"

    var failureMessage: String? {
        switch self {
        case .success:
            return nil
        case .invalidPayload:
            return "The watch rejected this route payload."
        case .persistenceFailure:
            return "The watch received the route but could not store it."
        }
    }
}

struct WatchRouteTransferAcknowledgement: Equatable {
    let transferID: String
    let result: WatchRouteTransferAcknowledgementResult
}

enum RoutePlanHydrationStatus: String, Equatable {
    case ok
    case partial
    case empty
}

struct RoutePlanHydrationResult: Equatable {
    let status: RoutePlanHydrationStatus
    let validAnchorEdgeIds: [String]
    let staleAnchorEdgeIds: [String]
}

enum RoutePlanHydrationNotice: Equatable {
    case partial(staleAnchorEdgeIDs: [String])
    case empty(staleAnchorEdgeIDs: [String])

    var message: String {
        switch self {
        case .partial(let staleAnchorEdgeIDs):
            let count = staleAnchorEdgeIDs.count
            return count == 1
                ? "1 saved route section could not be restored. You can keep editing the valid remainder."
                : "\(count) saved route sections could not be restored. You can keep editing the valid remainder."
        case .empty(let staleAnchorEdgeIDs):
            let count = staleAnchorEdgeIDs.count
            return count == 1
                ? "The saved route could not be restored because 1 section is no longer available."
                : "The saved route could not be restored because \(count) sections are no longer available."
        }
    }
}
