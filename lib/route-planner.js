/**
 * Destination-local routing engine.
 *
 * Resolves connector paths between ordered anchor edges in a destination-local
 * route graph produced by buildRouteGraph from lib/route-graph.js.
 *
 * Return contract
 * ---------------
 * resolveRoute returns a RouteResult:
 *
 * @typedef {{
 *   anchors: string[],
 *   connections: RouteConnection[],
 *   totalConnectorDistanceKm: number,
 *   hasUnresolvedGaps: boolean,
 * }} RouteResult
 *
 * @typedef {{
 *   fromAnchor: string,
 *   toAnchor: string,
 *   connectorEdgeIds: string[] | null,
 *   distanceKm: number | null,
 * }} RouteConnection
 *
 * - `anchors` is the ordered list of anchor edge IDs exactly as provided.
 * - `connections` has one entry per adjacent anchor pair, in order.
 * - `connectorEdgeIds` is an ordered list of graph edge IDs forming the
 *   connector path.  An empty array means the two anchors share an endpoint
 *   (no gap).  null means no path exists (disconnected components or unknown
 *   anchor ID).
 * - `distanceKm` is the total connector path distance. null when no path.
 * - `totalConnectorDistanceKm` is the sum of distanceKm across all resolved
 *   connections (unresolved gaps contribute 0).
 * - `hasUnresolvedGaps` is true if any connection has connectorEdgeIds === null.
 *
 * Routing cost model
 * ------------------
 * Edge cost = distanceKm + FRESHNESS_TIE_BREAK × freshnessComponent(freshness)
 *
 * FRESHNESS_TIE_BREAK is intentionally tiny so freshness remains only a
 * secondary tie-break on otherwise comparable paths and cannot outweigh a
 * genuinely shorter route under the routing scenarios this helper is designed
 * to serve.
 *
 * freshnessComponent is 1 / (freshness + 1) for non-null freshness, mapping
 * higher freshness values to lower cost.  A null freshness is treated as
 * neutral (0 component).
 *
 * Anchor endpoint policy
 * ----------------------
 * Each anchor edge has two graph endpoints (from, to).  resolveRoute runs a
 * multi-source Dijkstra from both endpoints of the source anchor and selects
 * the target endpoint of the destination anchor that yields the minimum
 * composite cost.  This is an explicit, deterministic policy that callers can
 * rely on without applying UI-level heuristics.
 */

/**
 * Freshness tie-break weight. Multiplied by the per-edge freshness component,
 * this is deliberately tiny so freshness acts only as a deterministic
 * secondary preference rather than a primary routing cost.
 */
const FRESHNESS_TIE_BREAK = 1e-9;

class MinPriorityQueue {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;

    const first = this.items[0];
    const last = this.items.pop();

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  bubbleUp(index) {
    let currentIndex = index;

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2);
      if (!this.isLess(currentIndex, parentIndex)) break;

      this.swap(currentIndex, parentIndex);
      currentIndex = parentIndex;
    }
  }

  bubbleDown(index) {
    let currentIndex = index;

    while (true) {
      const leftIndex = currentIndex * 2 + 1;
      const rightIndex = currentIndex * 2 + 2;
      let smallestIndex = currentIndex;

      if (leftIndex < this.items.length && this.isLess(leftIndex, smallestIndex)) {
        smallestIndex = leftIndex;
      }

      if (rightIndex < this.items.length && this.isLess(rightIndex, smallestIndex)) {
        smallestIndex = rightIndex;
      }

      if (smallestIndex === currentIndex) break;

      this.swap(currentIndex, smallestIndex);
      currentIndex = smallestIndex;
    }
  }

  isLess(leftIndex, rightIndex) {
    const left = this.items[leftIndex];
    const right = this.items[rightIndex];

    if (left.totalCost !== right.totalCost) {
      return left.totalCost < right.totalCost;
    }

    return left.nodeId < right.nodeId;
  }

  swap(leftIndex, rightIndex) {
    [this.items[leftIndex], this.items[rightIndex]] = [
      this.items[rightIndex],
      this.items[leftIndex],
    ];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return a freshness penalty in [0, 1] for a single edge.
 * Higher freshness values yield a lower penalty (preferred).
 * A null or undefined freshness value is treated as neutral (0).
 *
 * @param {number|null|undefined} freshness
 * @returns {number}
 */
function freshnessEdgePenalty(freshness) {
  if (freshness == null) return 0;
  return 1 / (Math.max(0, freshness) + 1);
}

/**
 * Compute the composite routing cost for a single graph edge.
 *
 * @param {{ distanceKm: number, freshness: number|null }} edge
 * @returns {number}
 */
function edgeRoutingCost(edge) {
  return edge.distanceKm + FRESHNESS_TIE_BREAK * freshnessEdgePenalty(edge.freshness);
}

/**
 * Build a bidirectional adjacency list from a route graph.
 *
 * @param {{ edges: Map<string, object> }} graph
 * @returns {Map<string, Array<{ edgeId: string, neighborId: string, cost: number, distanceKm: number }>>}
 */
function buildAdjacency(graph) {
  const adjacency = new Map();
  for (const [edgeId, edge] of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    const cost = edgeRoutingCost(edge);
    adjacency.get(edge.from).push({ edgeId, neighborId: edge.to, cost, distanceKm: edge.distanceKm });
    adjacency.get(edge.to).push({ edgeId, neighborId: edge.from, cost, distanceKm: edge.distanceKm });
  }
  return adjacency;
}

/**
 * Run Dijkstra from one or more start nodes.  Returns the settled distance
 * table for all reachable nodes.
 *
 * @param {Map<string, Array>} adjacency
 * @param {string[]} startNodeIds
 * @returns {Map<string, { totalCost: number, distanceKm: number, prevNodeId: string|null, prevEdgeId: string|null }>}
 */
function dijkstraFromSources(adjacency, startNodeIds) {
  /** @type {Map<string, { totalCost: number, distanceKm: number, prevNodeId: string|null, prevEdgeId: string|null }>} */
  const dist = new Map();
  const queue = new MinPriorityQueue();

  for (const nodeId of startNodeIds) {
    if (!dist.has(nodeId)) {
      dist.set(nodeId, { totalCost: 0, distanceKm: 0, prevNodeId: null, prevEdgeId: null });
      queue.push({ nodeId, totalCost: 0 });
    }
  }

  const visited = new Set();

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;

    const { nodeId, totalCost } = current;
    const currentBest = dist.get(nodeId);
    if (!currentBest || totalCost !== currentBest.totalCost) continue;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const neighbors = adjacency.get(nodeId) ?? [];
    const currentDistKm = currentBest.distanceKm;

    for (const { edgeId, neighborId, cost, distanceKm } of neighbors) {
      if (visited.has(neighborId)) continue;

      const newTotalCost = totalCost + cost;
      const newDistKm = currentDistKm + distanceKm;

      const existing = dist.get(neighborId);
      if (!existing || newTotalCost < existing.totalCost) {
        dist.set(neighborId, {
          totalCost: newTotalCost,
          distanceKm: newDistKm,
          prevNodeId: nodeId,
          prevEdgeId: edgeId,
        });
        queue.push({ nodeId: neighborId, totalCost: newTotalCost });
      }
    }
  }

  return dist;
}

/**
 * Reconstruct the ordered list of edge IDs from the Dijkstra distance table
 * back to one of the start nodes.
 *
 * @param {Map<string, { prevNodeId: string|null, prevEdgeId: string|null }>} dist
 * @param {string} targetNodeId
 * @returns {string[]}
 */
function reconstructPath(dist, targetNodeId) {
  const edgeIds = [];
  let current = targetNodeId;
  while (dist.get(current)?.prevEdgeId != null) {
    const info = dist.get(current);
    edgeIds.unshift(info.prevEdgeId);
    current = info.prevNodeId;
  }
  return edgeIds;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve connector paths between ordered anchor edges within a
 * destination-local route graph.
 *
 * @param {{ nodes: Map<string, object>, edges: Map<string, object> } | null | undefined} graph
 *   Route graph produced by buildRouteGraph.
 * @param {string[] | null | undefined} anchorEdgeIds
 *   Ordered list of anchor edge IDs selected by the user.
 * @returns {RouteResult}
 */
export function resolveRoute(graph, anchorEdgeIds) {
  const anchors = Array.isArray(anchorEdgeIds) ? [...anchorEdgeIds] : [];

  if (!graph || anchors.length < 2) {
    return {
      anchors,
      connections: [],
      totalConnectorDistanceKm: 0,
      hasUnresolvedGaps: false,
    };
  }

  const adjacency = buildAdjacency(graph);
  const connections = [];
  let totalConnectorDistanceKm = 0;
  let hasUnresolvedGaps = false;

  for (let i = 0; i < anchors.length - 1; i += 1) {
    const fromAnchorId = anchors[i];
    const toAnchorId = anchors[i + 1];

    const fromEdge = graph.edges.get(fromAnchorId);
    const toEdge = graph.edges.get(toAnchorId);

    if (!fromEdge || !toEdge) {
      connections.push({
        fromAnchor: fromAnchorId,
        toAnchor: toAnchorId,
        connectorEdgeIds: null,
        distanceKm: null,
      });
      hasUnresolvedGaps = true;
      continue;
    }

    // Multi-source Dijkstra from both endpoints of the source anchor.
    const startNodes = [...new Set([fromEdge.from, fromEdge.to])];
    const dist = dijkstraFromSources(adjacency, startNodes);

    // Select the target anchor endpoint that yields the minimum composite cost.
    let bestTarget = null;
    for (const targetId of [toEdge.from, toEdge.to]) {
      if (!dist.has(targetId)) continue;
      const d = dist.get(targetId);
      if (!bestTarget || d.totalCost < bestTarget.totalCost) {
        bestTarget = { targetId, totalCost: d.totalCost, distanceKm: d.distanceKm };
      }
    }

    if (!bestTarget) {
      connections.push({
        fromAnchor: fromAnchorId,
        toAnchor: toAnchorId,
        connectorEdgeIds: null,
        distanceKm: null,
      });
      hasUnresolvedGaps = true;
      continue;
    }

    const connectorEdgeIds = reconstructPath(dist, bestTarget.targetId);
    const distanceKm = bestTarget.distanceKm;
    totalConnectorDistanceKm += distanceKm;

    connections.push({
      fromAnchor: fromAnchorId,
      toAnchor: toAnchorId,
      connectorEdgeIds,
      distanceKm,
    });
  }

  return {
    anchors,
    connections,
    totalConnectorDistanceKm,
    hasUnresolvedGaps,
  };
}
