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
