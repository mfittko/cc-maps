import { describe, expect, it } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph.js';
import { resolveRoute } from '../lib/route-planner.js';

// ---------------------------------------------------------------------------
// Shared GeoJSON test fixtures
// ---------------------------------------------------------------------------

/**
 * A linear chain of four trail sections sharing endpoints:
 *   A=[10.75,59.91] --[AB]--> B=[10.76,59.91] --[BC]--> C=[10.77,59.91] --[CD]--> D=[10.78,59.91]
 *
 * Produces graph nodes A, B, C, D and edges AB, BC, CD.
 */
const chainGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, trailtypesymbol: 30, prepsymbol: 20 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.75, 59.91],
          [10.76, 59.91],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 2, trailtypesymbol: 30, prepsymbol: 20 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.76, 59.91],
          [10.77, 59.91],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 3, trailtypesymbol: 30, prepsymbol: 20 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.77, 59.91],
          [10.78, 59.91],
        ],
      },
    },
  ],
};

/**
 * A longer chain with five sections sharing endpoints:
 *   A --[AB]--> B --[BC]--> C --[CD]--> D --[DE]--> E
 *
 * Used to verify multi-hop connector resolution.
 */
const longChainGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.75, 59.91], [10.76, 59.91]] },
    },
    {
      type: 'Feature',
      properties: { id: 2, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.76, 59.91], [10.77, 59.91]] },
    },
    {
      type: 'Feature',
      properties: { id: 3, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.77, 59.91], [10.78, 59.91]] },
    },
    {
      type: 'Feature',
      properties: { id: 4, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.78, 59.91], [10.79, 59.91]] },
    },
  ],
};

/**
 * Two disconnected trail groups with no shared nodes or crossings.
 *   Group 1: A --[AB]--> B (at lat 59.91)
 *   Group 2: C --[CD]--> D (at lat 60.50, far from group 1)
 */
const disconnectedGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.75, 59.91], [10.76, 59.91]] },
    },
    {
      type: 'Feature',
      properties: { id: 2, prepsymbol: 20 },
      geometry: { type: 'LineString', coordinates: [[10.75, 60.50], [10.76, 60.50]] },
    },
  ],
};

// ---------------------------------------------------------------------------
// Helper: deterministic edge ID builder (mirrors lib/route-graph.js logic)
// ---------------------------------------------------------------------------

const COORD_PRECISION = 6;

function roundCoord(v) {
  const f = 10 ** COORD_PRECISION;
  return Math.round(v * f) / f;
}

function nodeId([lng, lat]) {
  return roundCoord(lng).toFixed(COORD_PRECISION) + ':' + roundCoord(lat).toFixed(COORD_PRECISION);
}

function edgeId(a, b) {
  const [first, second] = [a, b].sort();
  return first + '~' + second;
}

// Pre-computed node/edge IDs for chain fixture coordinates.
const N = {
  A: nodeId([10.75, 59.91]),
  B: nodeId([10.76, 59.91]),
  C: nodeId([10.77, 59.91]),
  D: nodeId([10.78, 59.91]),
  E: nodeId([10.79, 59.91]),
};

const E = {
  AB: edgeId(N.A, N.B),
  BC: edgeId(N.B, N.C),
  CD: edgeId(N.C, N.D),
  DE: edgeId(N.D, N.E),
};

// ---------------------------------------------------------------------------
// Empty and degenerate input
// ---------------------------------------------------------------------------

describe('resolveRoute — empty and degenerate input', () => {
  it('returns empty result for null graph', () => {
    const result = resolveRoute(null, [E.AB, E.CD]);
    expect(result.anchors).toEqual([E.AB, E.CD]);
    expect(result.connections).toEqual([]);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('returns empty result for undefined graph', () => {
    const result = resolveRoute(undefined, [E.AB]);
    expect(result.anchors).toEqual([E.AB]);
    expect(result.connections).toEqual([]);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('returns empty result for null anchorEdgeIds', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, null);
    expect(result.anchors).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('returns empty result for empty anchor list', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, []);
    expect(result.anchors).toEqual([]);
    expect(result.connections).toEqual([]);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('returns anchor only for single anchor — no connections needed', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB]);
    expect(result.anchors).toEqual([E.AB]);
    expect(result.connections).toHaveLength(0);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('marks gap for unknown anchor edge IDs', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, ['no-such-edge', E.CD]);
    expect(result.hasUnresolvedGaps).toBe(true);
    expect(result.connections[0].connectorEdgeIds).toBeNull();
    expect(result.connections[0].distanceKm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adjacent anchors (shared node → empty connector)
// ---------------------------------------------------------------------------

describe('resolveRoute — adjacent anchors sharing a node', () => {
  it('produces an empty connector when two anchors share a graph node', () => {
    // AB ends at B; BC starts at B → they share node B → no connector needed.
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.BC]);

    expect(result.anchors).toEqual([E.AB, E.BC]);
    expect(result.connections).toHaveLength(1);

    const conn = result.connections[0];
    expect(conn.fromAnchor).toBe(E.AB);
    expect(conn.toAnchor).toBe(E.BC);
    expect(conn.connectorEdgeIds).toEqual([]);
    expect(conn.distanceKm).toBe(0);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('produces empty connectors for a fully-adjacent three-anchor chain', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.BC, E.CD]);

    expect(result.connections).toHaveLength(2);
    expect(result.connections[0].connectorEdgeIds).toEqual([]);
    expect(result.connections[1].connectorEdgeIds).toEqual([]);
    expect(result.totalConnectorDistanceKm).toBe(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Single-hop connector
// ---------------------------------------------------------------------------

describe('resolveRoute — single-hop connector', () => {
  it('resolves the single intermediate edge between separated anchors', () => {
    // Anchor AB ends at B; anchor CD starts at C.  The only path is B→C via BC.
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.CD]);

    expect(result.anchors).toEqual([E.AB, E.CD]);
    expect(result.connections).toHaveLength(1);

    const conn = result.connections[0];
    expect(conn.fromAnchor).toBe(E.AB);
    expect(conn.toAnchor).toBe(E.CD);
    expect(conn.connectorEdgeIds).toEqual([E.BC]);
    expect(conn.distanceKm).toBeGreaterThan(0);
    expect(result.totalConnectorDistanceKm).toBeCloseTo(conn.distanceKm, 10);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('connector distance equals the intermediate edge distance', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const bcEdge = graph.edges.get(E.BC);
    const result = resolveRoute(graph, [E.AB, E.CD]);

    expect(result.connections[0].distanceKm).toBeCloseTo(bcEdge.distanceKm, 10);
  });
});

// ---------------------------------------------------------------------------
// Multi-hop connector
// ---------------------------------------------------------------------------

describe('resolveRoute — multi-hop connector', () => {
  it('resolves a two-hop connector across multiple intermediate edges', () => {
    // Anchor AB and anchor DE with two intermediate edges BC and CD.
    const graph = buildRouteGraph(longChainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.DE]);

    expect(result.connections).toHaveLength(1);
    const conn = result.connections[0];
    // Path from B to D goes through B→C→D (edges BC and CD in that order).
    expect(conn.connectorEdgeIds).toEqual([E.BC, E.CD]);
    expect(conn.distanceKm).toBeGreaterThan(0);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('connector distance equals sum of intermediate edge distances', () => {
    const graph = buildRouteGraph(longChainGeoJson);
    const bcEdge = graph.edges.get(E.BC);
    const cdEdge = graph.edges.get(E.CD);
    const result = resolveRoute(graph, [E.AB, E.DE]);

    expect(result.connections[0].distanceKm).toBeCloseTo(
      bcEdge.distanceKm + cdEdge.distanceKm,
      10,
    );
  });

  it('resolves three separate connections in a multi-anchor plan', () => {
    const graph = buildRouteGraph(longChainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.CD, E.DE]);

    expect(result.connections).toHaveLength(2);
    // AB→CD: one hop via BC
    expect(result.connections[0].connectorEdgeIds).toEqual([E.BC]);
    // CD→DE: shared node D — empty connector
    expect(result.connections[1].connectorEdgeIds).toEqual([]);
    expect(result.hasUnresolvedGaps).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Freshness tie-break
// ---------------------------------------------------------------------------

describe('resolveRoute — freshness tie-break', () => {
  /**
   * Manually constructed graph with two equal-distance paths from P2 to P3:
   *   Path north: P2 --[north-1]--> N --[north-2]--> P3  (freshness 30)
   *   Path south: P2 --[south-1]--> S --[south-2]--> P3  (freshness 5)
   *
   * Both paths have total distanceKm = 1.0 km.  The fresher north path
   * must be chosen because its composite cost is lower.
   */
  const makeTieBreakGraph = () => {
    const nodes = new Map([
      ['P1', { id: 'P1', coordinates: [0, 0], kind: 'endpoint' }],
      ['P2', { id: 'P2', coordinates: [0, 1], kind: 'endpoint' }],
      ['N', { id: 'N', coordinates: [1, 1.5], kind: 'endpoint' }],
      ['S', { id: 'S', coordinates: [-1, 0.5], kind: 'endpoint' }],
      ['P3', { id: 'P3', coordinates: [0, 2], kind: 'endpoint' }],
      ['P4', { id: 'P4', coordinates: [0, 3], kind: 'endpoint' }],
    ]);

    const edges = new Map([
      ['anchor-start', { id: 'anchor-start', from: 'P1', to: 'P2', distanceKm: 1.0, freshness: 20, trailFeatureId: 1, trailType: null }],
      ['north-1',      { id: 'north-1',      from: 'P2', to: 'N',  distanceKm: 0.5, freshness: 30, trailFeatureId: 2, trailType: null }],
      ['north-2',      { id: 'north-2',      from: 'N',  to: 'P3', distanceKm: 0.5, freshness: 30, trailFeatureId: 2, trailType: null }],
      ['south-1',      { id: 'south-1',      from: 'P2', to: 'S',  distanceKm: 0.5, freshness: 5,  trailFeatureId: 3, trailType: null }],
      ['south-2',      { id: 'south-2',      from: 'S',  to: 'P3', distanceKm: 0.5, freshness: 5,  trailFeatureId: 3, trailType: null }],
      ['anchor-end',   { id: 'anchor-end',   from: 'P3', to: 'P4', distanceKm: 1.0, freshness: 20, trailFeatureId: 4, trailType: null }],
    ]);

    return { nodes, edges };
  };

  it('selects the fresher equal-distance path as connector', () => {
    const graph = makeTieBreakGraph();
    const result = resolveRoute(graph, ['anchor-start', 'anchor-end']);

    expect(result.connections).toHaveLength(1);
    const conn = result.connections[0];
    // Both paths have distanceKm = 1.0; north path is fresher (prepsymbol 30 > 5).
    expect(conn.connectorEdgeIds).toEqual(['north-1', 'north-2']);
    expect(conn.distanceKm).toBeCloseTo(1.0, 10);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('freshness does not override a genuinely shorter path', () => {
    /**
     * Graph: same anchor endpoints, but now the south path is SHORTER (0.4 km
     * each vs 0.5 km each for north) while having lower freshness.
     * The shorter south path must win despite its lower freshness.
     */
    const nodes = new Map([
      ['P1', { id: 'P1', coordinates: [0, 0], kind: 'endpoint' }],
      ['P2', { id: 'P2', coordinates: [0, 1], kind: 'endpoint' }],
      ['N',  { id: 'N',  coordinates: [1, 1.5], kind: 'endpoint' }],
      ['S',  { id: 'S',  coordinates: [-1, 0.5], kind: 'endpoint' }],
      ['P3', { id: 'P3', coordinates: [0, 2], kind: 'endpoint' }],
      ['P4', { id: 'P4', coordinates: [0, 3], kind: 'endpoint' }],
    ]);

    const edges = new Map([
      ['anchor-start', { id: 'anchor-start', from: 'P1', to: 'P2', distanceKm: 1.0, freshness: 20, trailFeatureId: 1, trailType: null }],
      ['north-1',      { id: 'north-1',      from: 'P2', to: 'N',  distanceKm: 0.5, freshness: 30, trailFeatureId: 2, trailType: null }],
      ['north-2',      { id: 'north-2',      from: 'N',  to: 'P3', distanceKm: 0.5, freshness: 30, trailFeatureId: 2, trailType: null }],
      ['south-1',      { id: 'south-1',      from: 'P2', to: 'S',  distanceKm: 0.4, freshness: 5,  trailFeatureId: 3, trailType: null }],
      ['south-2',      { id: 'south-2',      from: 'S',  to: 'P3', distanceKm: 0.4, freshness: 5,  trailFeatureId: 3, trailType: null }],
      ['anchor-end',   { id: 'anchor-end',   from: 'P3', to: 'P4', distanceKm: 1.0, freshness: 20, trailFeatureId: 4, trailType: null }],
    ]);

    const graph = { nodes, edges };
    const result = resolveRoute(graph, ['anchor-start', 'anchor-end']);

    const conn = result.connections[0];
    // South is 0.8 km total; north is 1.0 km. Shorter south path must win.
    expect(conn.connectorEdgeIds).toEqual(['south-1', 'south-2']);
    expect(conn.distanceKm).toBeCloseTo(0.8, 10);
  });

  it('freshness null is treated neutrally and does not block routing', () => {
    const nodes = new Map([
      ['X', { id: 'X', coordinates: [0, 0], kind: 'endpoint' }],
      ['Y', { id: 'Y', coordinates: [0, 1], kind: 'endpoint' }],
      ['Z', { id: 'Z', coordinates: [0, 2], kind: 'endpoint' }],
    ]);
    const edges = new Map([
      ['XY', { id: 'XY', from: 'X', to: 'Y', distanceKm: 1.0, freshness: null, trailFeatureId: 1, trailType: null }],
      ['YZ', { id: 'YZ', from: 'Y', to: 'Z', distanceKm: 1.0, freshness: null, trailFeatureId: 2, trailType: null }],
    ]);
    const graph = { nodes, edges };
    const result = resolveRoute(graph, ['XY', 'YZ']);
    expect(result.connections[0].connectorEdgeIds).toEqual([]);
    expect(result.hasUnresolvedGaps).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No-path / disconnected graph
// ---------------------------------------------------------------------------

describe('resolveRoute — no-path and disconnected graph', () => {
  it('returns null connector for anchors in disconnected components', () => {
    // Two trails with no shared nodes or crossings.
    const graph = buildRouteGraph(disconnectedGeoJson);

    const allEdgeIds = [...graph.edges.keys()];
    expect(allEdgeIds).toHaveLength(2);

    const [edgeA, edgeB] = allEdgeIds;
    const result = resolveRoute(graph, [edgeA, edgeB]);

    expect(result.connections).toHaveLength(1);
    expect(result.connections[0].connectorEdgeIds).toBeNull();
    expect(result.connections[0].distanceKm).toBeNull();
    expect(result.hasUnresolvedGaps).toBe(true);
    expect(result.totalConnectorDistanceKm).toBe(0);
  });

  it('marks a gap when the source anchor ID is not in the graph', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, ['ghost-edge', E.CD]);

    expect(result.hasUnresolvedGaps).toBe(true);
    expect(result.connections[0].connectorEdgeIds).toBeNull();
  });

  it('marks a gap when the target anchor ID is not in the graph', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, 'ghost-edge']);

    expect(result.hasUnresolvedGaps).toBe(true);
    expect(result.connections[0].connectorEdgeIds).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Partial-plan output
// ---------------------------------------------------------------------------

describe('resolveRoute — partial-plan output', () => {
  it('resolves some connections and marks others as gaps in the same plan', () => {
    /**
     * Three anchors: AB (resolvable to CD), CD (in the chain graph),
     * and 'phantom' (not in the graph).
     * Expect: first connection resolved, second connection is a gap.
     */
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.CD, 'phantom-edge']);

    expect(result.anchors).toEqual([E.AB, E.CD, 'phantom-edge']);
    expect(result.connections).toHaveLength(2);

    // First connection: AB → CD, resolvable via BC.
    expect(result.connections[0].connectorEdgeIds).toEqual([E.BC]);
    expect(result.connections[0].distanceKm).toBeGreaterThan(0);

    // Second connection: CD → phantom, unresolvable.
    expect(result.connections[1].connectorEdgeIds).toBeNull();
    expect(result.connections[1].distanceKm).toBeNull();

    expect(result.hasUnresolvedGaps).toBe(true);
    // Total connector distance counts only the resolved segment.
    expect(result.totalConnectorDistanceKm).toBeCloseTo(result.connections[0].distanceKm, 10);
  });

  it('returns hasUnresolvedGaps false when all connections are resolved', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.CD]);
    expect(result.hasUnresolvedGaps).toBe(false);
  });

  it('hasUnresolvedGaps is true only when at least one connection has no path', () => {
    const graph = buildRouteGraph(disconnectedGeoJson);
    const allEdgeIds = [...graph.edges.keys()];
    const result = resolveRoute(graph, allEdgeIds);
    expect(result.hasUnresolvedGaps).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Return contract shape
// ---------------------------------------------------------------------------

describe('resolveRoute — return contract shape', () => {
  it('anchors array is an independent copy of the input', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const input = [E.AB, E.CD];
    const result = resolveRoute(graph, input);
    input.push('extra');
    expect(result.anchors).toHaveLength(2);
  });

  it('each connection has fromAnchor and toAnchor set correctly', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.BC, E.CD]);

    expect(result.connections[0].fromAnchor).toBe(E.AB);
    expect(result.connections[0].toAnchor).toBe(E.BC);
    expect(result.connections[1].fromAnchor).toBe(E.BC);
    expect(result.connections[1].toAnchor).toBe(E.CD);
  });

  it('totalConnectorDistanceKm is the sum of resolved connection distances', () => {
    const graph = buildRouteGraph(longChainGeoJson);
    // AB → CD: one hop via BC.  CD → DE: shared node, dist 0.
    const result = resolveRoute(graph, [E.AB, E.CD, E.DE]);

    const expected = result.connections.reduce((sum, c) => sum + (c.distanceKm ?? 0), 0);
    expect(result.totalConnectorDistanceKm).toBeCloseTo(expected, 10);
  });

  it('connectorEdgeIds is an array (possibly empty) not null for reachable anchors', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const result = resolveRoute(graph, [E.AB, E.BC]);
    // Adjacent anchors → empty array, not null.
    expect(result.connections[0].connectorEdgeIds).toBeInstanceOf(Array);
    expect(result.connections[0].connectorEdgeIds).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Route reversal
// ---------------------------------------------------------------------------

describe('resolveRoute — route reversal', () => {
  it('reversed anchor order yields the same connector distance as forward', () => {
    const graph = buildRouteGraph(chainGeoJson);

    const forward = resolveRoute(graph, [E.AB, E.CD]);
    const reversed = resolveRoute(graph, [E.CD, E.AB]);

    // Undirected graph: total distance must be symmetric.
    expect(reversed.totalConnectorDistanceKm).toBeCloseTo(
      forward.totalConnectorDistanceKm,
      6,
    );
  });

  it('reversed plan produces valid connections (not null) for a connected graph', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const reversed = resolveRoute(graph, [E.CD, E.AB]);

    expect(reversed.connections).toHaveLength(1);
    expect(reversed.connections[0].connectorEdgeIds).not.toBeNull();
    expect(reversed.hasUnresolvedGaps).toBe(false);
  });

  it('reversed multi-anchor plan has the same number of connections', () => {
    const graph = buildRouteGraph(chainGeoJson);
    const forward = resolveRoute(graph, [E.AB, E.BC, E.CD]);
    const reversed = resolveRoute(graph, [E.CD, E.BC, E.AB]);

    expect(reversed.connections).toHaveLength(forward.connections.length);
    expect(reversed.anchors).toEqual([E.CD, E.BC, E.AB]);
  });

  it('reversed plan uses the same connector edges as the forward plan', () => {
    // For an undirected graph the connector between two anchors consists of
    // the same graph edges regardless of direction.
    const graph = buildRouteGraph(chainGeoJson);
    const forward = resolveRoute(graph, [E.AB, E.CD]);
    const reversed = resolveRoute(graph, [E.CD, E.AB]);

    const forwardEdgeSet = new Set(forward.connections[0].connectorEdgeIds);
    const reversedEdgeSet = new Set(reversed.connections[0].connectorEdgeIds);

    expect(forwardEdgeSet).toEqual(reversedEdgeSet);
  });
});

// ---------------------------------------------------------------------------
// Dijkstra selects shortest path when alternatives exist
// ---------------------------------------------------------------------------

describe('resolveRoute — shortest-path selection', () => {
  /**
   * Diamond-shaped graph: two paths from START to END.
   *   START --[short1]--> MID --[short2]--> END   (total 0.5 km)
   *   START --[long1]---> FAR --[long2]---> END   (total 2.0 km)
   *
   * Routing must always prefer the shorter path.
   */
  const makeShortestPathGraph = () => {
    const nodes = new Map([
      ['START', { id: 'START', coordinates: [0, 0], kind: 'endpoint' }],
      ['MID',   { id: 'MID',   coordinates: [0, 1], kind: 'crossing' }],
      ['FAR',   { id: 'FAR',   coordinates: [10, 0], kind: 'crossing' }],
      ['END',   { id: 'END',   coordinates: [0, 2], kind: 'endpoint' }],
      ['S',     { id: 'S',     coordinates: [-1, 0], kind: 'endpoint' }],
      ['T',     { id: 'T',     coordinates: [1, 2], kind: 'endpoint' }],
    ]);

    const edges = new Map([
      ['anchor-s', { id: 'anchor-s', from: 'S',     to: 'START', distanceKm: 0.1,  freshness: 20, trailFeatureId: 0, trailType: null }],
      ['short-1',  { id: 'short-1',  from: 'START', to: 'MID',   distanceKm: 0.25, freshness: 20, trailFeatureId: 1, trailType: null }],
      ['short-2',  { id: 'short-2',  from: 'MID',   to: 'END',   distanceKm: 0.25, freshness: 20, trailFeatureId: 1, trailType: null }],
      ['long-1',   { id: 'long-1',   from: 'START', to: 'FAR',   distanceKm: 1.0,  freshness: 20, trailFeatureId: 2, trailType: null }],
      ['long-2',   { id: 'long-2',   from: 'FAR',   to: 'END',   distanceKm: 1.0,  freshness: 20, trailFeatureId: 2, trailType: null }],
      ['anchor-t', { id: 'anchor-t', from: 'END',   to: 'T',     distanceKm: 0.1,  freshness: 20, trailFeatureId: 3, trailType: null }],
    ]);

    return { nodes, edges };
  };

  it('selects the shorter path over the longer one', () => {
    const graph = makeShortestPathGraph();
    const result = resolveRoute(graph, ['anchor-s', 'anchor-t']);

    const conn = result.connections[0];
    expect(conn.connectorEdgeIds).toContain('short-1');
    expect(conn.connectorEdgeIds).toContain('short-2');
    expect(conn.connectorEdgeIds).not.toContain('long-1');
    expect(conn.connectorEdgeIds).not.toContain('long-2');
  });

  it('connector distance for shorter path is less than alternative', () => {
    const graph = makeShortestPathGraph();
    const result = resolveRoute(graph, ['anchor-s', 'anchor-t']);

    expect(result.connections[0].distanceKm).toBeCloseTo(0.5, 6);
  });
});
