import Foundation
import OSLog
import SwiftUI
#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

struct WatchRootView: View {
    @StateObject private var routeStore = WatchRouteStore()

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: routeStore.isRouteAvailable ? "checkmark.applewatch" : "applewatch.radiowaves.left.and.right")
                .font(.system(size: 28))
                .foregroundStyle(routeStore.isRouteAvailable ? Color.green : Color.accentColor)

            Text("Cross-Country maps")
                .font(.headline)
                .multilineTextAlignment(.center)

            if let storedRoute = routeStore.storedRoute {
                Text(storedRoute.routeLabel)
                    .font(.caption.weight(.semibold))
                    .multilineTextAlignment(.center)

                if let routeSummary = routeStore.routeSummaryText {
                    Text(routeSummary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                Text("Stored from iPhone")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Text(routeStore.receivedAtText(for: storedRoute))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("Waiting for a planned route from iPhone.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            if let lastFailureMessage = routeStore.lastFailureMessage {
                Text(lastFailureMessage)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .task {
            routeStore.activate()
        }
    }
}

#Preview {
    WatchRootView()
}

private struct WatchStoredRouteRecord: Codable, Equatable {
    let transferID: String
    let receivedAt: Date
    let envelope: WatchTransferEnvelope

    var routeLabel: String {
        envelope.derived?.routeLabel ?? "Planned route"
    }

    var sectionCount: Int {
        if let sectionSummaries = envelope.derived?.sectionSummaries,
           !sectionSummaries.isEmpty {
            return sectionSummaries.count
        }

        return envelope.canonical.anchorEdgeIds.count
    }
}

private struct WatchTransferEnvelope: Codable, Equatable {
    static let currentVersion = 2

    let version: Int
    let canonical: WatchCanonicalRoutePlan
    let derived: WatchTransferDerivedPayload?

    var isValid: Bool {
        guard version == Self.currentVersion,
              canonical.isValid else {
            return false
        }

        if let sectionSummaries = derived?.sectionSummaries,
           !hasValidSectionSummaries(sectionSummaries) {
            return false
        }

        if let geometry = derived?.routeGeometry,
           (geometry.type != "LineString" || geometry.coordinates.count < 2 || !geometry.coordinates.allSatisfy({ $0.count == 2 })) {
            return false
        }

        return true
    }

    private func hasValidSectionSummaries(_ sectionSummaries: [WatchTransferSectionSummary]) -> Bool {
        let containsOnlyKnownAnchors = sectionSummaries.allSatisfy { summary in
            canonical.anchorEdgeIds.contains(summary.anchorEdgeId) &&
                canonical.destinationIds.contains(summary.destinationId) &&
                summary.destinationId.allSatisfy(\.isNumber)
        }
        let coversCanonicalAnchors = Set(sectionSummaries.map(\.anchorEdgeId)) == Set(canonical.anchorEdgeIds)
        return containsOnlyKnownAnchors && coversCanonicalAnchors
    }
}

private struct WatchCanonicalRoutePlan: Codable, Equatable {
    let version: Int
    let destinationId: String
    let destinationIds: [String]
    let anchorEdgeIds: [String]

    var isValid: Bool {
        !destinationId.isEmpty &&
            destinationId.allSatisfy(\.isNumber) &&
            !destinationIds.isEmpty &&
            destinationIds.allSatisfy { !$0.isEmpty && $0.allSatisfy(\.isNumber) } &&
            !anchorEdgeIds.isEmpty &&
            anchorEdgeIds.allSatisfy { !$0.isEmpty }
    }
}

private struct WatchTransferDerivedPayload: Codable, Equatable {
    let routeLabel: String?
    let routeGeometry: WatchTransferGeometry?
    let totalDistanceKm: Double?
    let elevationGainM: Double?
    let elevationLossM: Double?
    let sectionSummaries: [WatchTransferSectionSummary]
}

private struct WatchTransferGeometry: Codable, Equatable {
    let type: String
    let coordinates: [[Double]]
}

private struct WatchTransferSectionSummary: Codable, Equatable {
    let anchorEdgeId: String
    let destinationId: String
    let distanceKm: Double
    let label: String?
}

private enum WatchTransferAcknowledgementResult: String, Codable {
    case success = "acknowledged-success"
    case invalidPayload = "acknowledged-rejected-invalid-payload"
    case persistenceFailure = "acknowledged-persistence-failure"
}

@MainActor
private final class WatchRouteStore: NSObject, ObservableObject {
    @Published private(set) var storedRoute: WatchStoredRouteRecord?
    @Published private(set) var lastFailureMessage: String?

    private let logger = Logger(subsystem: "cc-maps", category: "WatchTransferWatch")
    private let userDefaults: UserDefaults
    private let storageKey = "cc-maps:watch-route-transfer"
    private let session: WCSession?
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(userDefaults: UserDefaults = .standard) {
        self.userDefaults = userDefaults
        session = WCSession.isSupported() ? WCSession.default : nil
        super.init()
        session?.delegate = self
        storedRoute = loadStoredRoute()
        if let storedRoute {
            logger.notice(
                "Loaded persisted watch route \(storedRoute.transferID, privacy: .public) with \(storedRoute.sectionCount) sections"
            )
        } else {
            logger.notice("No persisted watch route available at launch")
        }
    }

    var isRouteAvailable: Bool {
        storedRoute != nil
    }

    var routeSummaryText: String? {
        guard let storedRoute else {
            return nil
        }

        let distanceLabel = storedRoute.envelope.derived?.totalDistanceKm.map { String(format: "%.1f km", $0) }
        let sectionLabel = "\(storedRoute.sectionCount) section\(storedRoute.sectionCount == 1 ? "" : "s")"

        if let distanceLabel {
            return "\(distanceLabel) • \(sectionLabel)"
        }

        return sectionLabel
    }

    func activate() {
        logSessionSnapshot(reason: "Activating watch session")
        session?.activate()
    }

    func receivedAtText(for storedRoute: WatchStoredRouteRecord) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: storedRoute.receivedAt, relativeTo: Date())
    }

    private func loadStoredRoute() -> WatchStoredRouteRecord? {
        guard let rawValue = userDefaults.string(forKey: storageKey),
              let data = rawValue.data(using: .utf8) else {
            return nil
        }

        do {
            return try decoder.decode(WatchStoredRouteRecord.self, from: data)
        } catch {
            logger.error("Failed to decode persisted watch route: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    private func storeRoute(_ storedRoute: WatchStoredRouteRecord) throws {
        let data = try encoder.encode(storedRoute)
        guard let encoded = String(data: data, encoding: .utf8) else {
            throw CocoaError(.coderInvalidValue)
        }

        userDefaults.set(encoded, forKey: storageKey)
        self.storedRoute = storedRoute
        lastFailureMessage = nil
        logger.notice(
            "Persisted watch route \(storedRoute.transferID, privacy: .public) with \(storedRoute.sectionCount) sections"
        )
    }

    private func acknowledge(transferID: String, result: WatchTransferAcknowledgementResult) {
        guard let session else {
            logger.error(
                "Unable to send watch acknowledgement \(result.rawValue, privacy: .public) for transfer \(transferID, privacy: .public): session unavailable"
            )
            return
        }

        logger.notice(
            "Queueing watch acknowledgement \(result.rawValue, privacy: .public) for transfer \(transferID, privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
        )
        let transfer = session.transferUserInfo([
            "ccMapsMessageType": "route-transfer-ack",
            "transferId": transferID,
            "result": result.rawValue,
            "receivedAt": ISO8601DateFormatter().string(from: Date()),
        ])
        logger.notice(
            "Queued watch acknowledgement \(result.rawValue, privacy: .public) for transfer \(transferID, privacy: .public). isTransferring=\(transfer.isTransferring) pendingTransfers=\(session.outstandingUserInfoTransfers.count)"
        )
    }

    private func handleTransfer(userInfo: [String: Any]) {
        let keys = userInfo.keys.sorted().joined(separator: ",")
        logger.notice("Handling incoming watch route userInfo. keys=\(keys, privacy: .public)")

        guard let transferID = userInfo["transferId"] as? String else {
            logger.error("Rejecting watch route payload: missing transferId. keys=\(keys, privacy: .public)")
            lastFailureMessage = "The latest route payload could not be validated."
            return
        }

        guard let encodedEnvelope = userInfo["envelope"] as? String,
              let data = encodedEnvelope.data(using: .utf8) else {
            logger.error(
                "Rejecting watch route payload \(transferID, privacy: .public): missing envelope data"
            )
            lastFailureMessage = "The latest route payload could not be validated."
            acknowledge(transferID: transferID, result: .invalidPayload)
            return
        }

        let envelope: WatchTransferEnvelope
        do {
            envelope = try decoder.decode(WatchTransferEnvelope.self, from: data)
        } catch {
            logger.error(
                "Rejecting watch route payload \(transferID, privacy: .public): decode failed with error=\(String(describing: error), privacy: .public)"
            )
            lastFailureMessage = "The latest route payload could not be validated."
            acknowledge(transferID: transferID, result: .invalidPayload)
            return
        }

        guard envelope.isValid else {
            logger.error(
                "Rejecting watch route payload \(transferID, privacy: .public): envelope validation failed. canonicalAnchors=\(envelope.canonical.anchorEdgeIds.count) canonicalDestinations=\(envelope.canonical.destinationIds.count)"
            )
            lastFailureMessage = "The latest route payload could not be validated."
            acknowledge(transferID: transferID, result: .invalidPayload)
            return
        }

        logger.notice(
            "Validated watch route payload \(transferID, privacy: .public). anchors=\(envelope.canonical.anchorEdgeIds.count) destinations=\(envelope.canonical.destinationIds.count) hasDerived=\(envelope.derived != nil)"
        )

        let storedRoute = WatchStoredRouteRecord(
            transferID: transferID,
            receivedAt: Date(),
            envelope: envelope
        )

        do {
            try storeRoute(storedRoute)
            logger.notice("Accepted watch route payload \(transferID, privacy: .public) and persisted it successfully")
            acknowledge(transferID: transferID, result: .success)
        } catch {
            logger.error(
                "Failed to persist watch route payload \(transferID, privacy: .public): \(String(describing: error), privacy: .public)"
            )
            lastFailureMessage = "The latest route could not be stored on the watch."
            acknowledge(transferID: transferID, result: .persistenceFailure)
        }
    }

#if canImport(WatchConnectivity)
    private func sessionSnapshot(for session: WCSession) -> String {
        "activation=\(session.activationState.rawValue) companionInstalled=\(session.isCompanionAppInstalled) reachable=\(session.isReachable) hasContentPending=\(session.hasContentPending) pendingTransfers=\(session.outstandingUserInfoTransfers.count)"
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
extension WatchRouteStore: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        Task { @MainActor in
            if let error {
                self.logger.error(
                    "Watch session activation completed with error. state=\(activationState.rawValue) error=\(String(describing: error), privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
                )
            } else {
                self.logger.notice(
                    "Watch session activation completed. state=\(activationState.rawValue). \(self.sessionSnapshot(for: session), privacy: .public)"
                )
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        let keys = userInfo.keys.sorted().joined(separator: ",")
        Task { @MainActor in
            self.logger.notice(
                "Watch didReceiveUserInfo callback fired. keys=\(keys, privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
            )
        }

        guard let messageType = userInfo["ccMapsMessageType"] as? String,
              messageType == "route-transfer" else {
            Task { @MainActor in
                self.logger.error("Ignoring unexpected watch userInfo payload. keys=\(keys, privacy: .public)")
            }
            return
        }

        Task { @MainActor in
            self.handleTransfer(userInfo: userInfo)
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.logSessionSnapshot(reason: "Watch session reachability changed", session: session)
        }
    }

    nonisolated func session(
        _ session: WCSession,
        didFinish userInfoTransfer: WCSessionUserInfoTransfer,
        error: (any Error)?
    ) {
        let transferID = (userInfoTransfer.userInfo?["transferId"] as? String) ?? "unknown"
        Task { @MainActor in
            if let error {
                self.logger.error(
                    "Finished queued watch userInfo transfer \(transferID, privacy: .public) with error=\(String(describing: error), privacy: .public). \(self.sessionSnapshot(for: session), privacy: .public)"
                )
            } else {
                self.logger.notice(
                    "Finished queued watch userInfo transfer \(transferID, privacy: .public) successfully. \(self.sessionSnapshot(for: session), privacy: .public)"
                )
            }
        }
    }
}
#endif
