import Foundation
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
                .foregroundStyle(routeStore.isRouteAvailable ? .green : .tint)

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
    let version: Int
    let canonical: WatchCanonicalRoutePlan
    let derived: WatchTransferDerivedPayload?

    var isValid: Bool {
        guard version == 2,
              canonical.version == 2,
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

        return try? decoder.decode(WatchStoredRouteRecord.self, from: data)
    }

    private func storeRoute(_ storedRoute: WatchStoredRouteRecord) throws {
        let data = try encoder.encode(storedRoute)
        guard let encoded = String(data: data, encoding: .utf8) else {
            throw CocoaError(.coderInvalidValue)
        }

        userDefaults.set(encoded, forKey: storageKey)
        self.storedRoute = storedRoute
        lastFailureMessage = nil
    }

    private func acknowledge(transferID: String, result: WatchTransferAcknowledgementResult) {
        session?.transferUserInfo([
            "ccMapsMessageType": "route-transfer-ack",
            "transferId": transferID,
            "result": result.rawValue,
            "receivedAt": ISO8601DateFormatter().string(from: Date()),
        ])
    }

    private func handleTransfer(userInfo: [String: Any]) {
        guard let transferID = userInfo["transferId"] as? String,
              let encodedEnvelope = userInfo["envelope"] as? String,
              let data = encodedEnvelope.data(using: .utf8),
              let envelope = try? decoder.decode(WatchTransferEnvelope.self, from: data),
              envelope.isValid else {
            if let transferID = userInfo["transferId"] as? String {
                acknowledge(transferID: transferID, result: .invalidPayload)
            }
            lastFailureMessage = "The latest route payload could not be validated."
            return
        }

        let storedRoute = WatchStoredRouteRecord(
            transferID: transferID,
            receivedAt: Date(),
            envelope: envelope
        )

        do {
            try storeRoute(storedRoute)
            acknowledge(transferID: transferID, result: .success)
        } catch {
            lastFailureMessage = "The latest route could not be stored on the watch."
            acknowledge(transferID: transferID, result: .persistenceFailure)
        }
    }
}

#if canImport(WatchConnectivity)
extension WatchRouteStore: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {}

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String : Any]) {
        guard let messageType = userInfo["ccMapsMessageType"] as? String,
              messageType == "route-transfer" else {
            return
        }

        Task { @MainActor in
            self.handleTransfer(userInfo: userInfo)
        }
    }
}
#endif
