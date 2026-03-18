import Foundation

/// Ordered list of trail IDs that form a planned route.
/// Anchor identity is immutable: only order changes through explicit reverse or remove actions.
struct RoutePlanState: Equatable {
    private(set) var anchorTrailIDs: [String]

    init(anchorTrailIDs: [String] = []) {
        self.anchorTrailIDs = anchorTrailIDs
    }

    var isEmpty: Bool { anchorTrailIDs.isEmpty }
    var sectionCount: Int { anchorTrailIDs.count }

    func contains(_ trailID: String) -> Bool {
        anchorTrailIDs.contains(trailID)
    }

    /// Appends the trail to the end of the plan if not already present.
    /// If the trail is already in the plan, removes it (toggle semantics matching the web planner).
    mutating func toggleAnchor(_ trailID: String) {
        if let idx = anchorTrailIDs.firstIndex(of: trailID) {
            anchorTrailIDs.remove(at: idx)
        } else {
            anchorTrailIDs.append(trailID)
        }
    }

    /// Removes the anchor at the given index without affecting other anchor identities or their order.
    mutating func removeAnchor(at index: Int) {
        guard anchorTrailIDs.indices.contains(index) else { return }
        anchorTrailIDs.remove(at: index)
    }

    /// Inverts anchor order without mutating anchor identities.
    mutating func reverse() {
        anchorTrailIDs = anchorTrailIDs.reversed()
    }

    /// Removes all anchors and resets derived route state.
    mutating func clear() {
        anchorTrailIDs.removeAll()
    }
}
