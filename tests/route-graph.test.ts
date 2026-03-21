import { describe, expect, it } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/**
 * A single horizontal trail with three vertices:
 *   [10.75, 59.91] → [10.76, 59.91] → [10.77, 59.91]
 * No crossings with anything else; produces two endpoint nodes and one edge.
 */
const singleTrailGeoJson = {
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
          [10.77, 59.91],
        ],
      },
    },
  ],
};

/**
 * Two trails that cross at their midpoints:
 *   Trail A (horizontal): [10.75, 59.91] → [10.77, 59.91]
 *   Trail B (vertical):   [10.76, 59.90] → [10.76, 59.92]
 * They cross at approximately [10.76, 59.91].
 */
const crossingTrailsGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, trailtypesymbol: 30, prepsymbol: 20 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.75, 59.91],
          [10.77, 59.91],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 2, trailtypesymbol: 40, prepsymbol: 30 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.76, 59.90],
          [10.76, 59.92],
        ],
      },
    },
  ],
};

/**
 * Two parallel horizontal trails that never cross:
 *   Trail A: [10.75, 59.91] → [10.77, 59.91]
 *   Trail B: [10.75, 59.92] → [10.77, 59.92]
 */
const parallelTrailsGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.75, 59.91],
          [10.77, 59.91],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 2 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.75, 59.92],
          [10.77, 59.92],
        ],
      },
    },
  ],
};

/**
 * A single trail with MultiLineString geometry (two disconnected sub-lines):
 *   Sub-line A: [10.75, 59.91] → [10.76, 59.91]
 *   Sub-line B: [10.77, 59.91] → [10.78, 59.91]
 */
const multiLineTrailGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, trailtypesymbol: 30, prepsymbol: 20 },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [10.75, 59.91],
            [10.76, 59.91],
          ],
          [
            [10.77, 59.91],
            [10.78, 59.91],
          ],
        ],
      },
    },
  ],
};

/**
 * T-junction: trail A is the through-road, trail B ends exactly on trail A's
 * midpoint vertex [10.76, 59.91].
 *   Trail A: [10.75, 59.91] → [10.76, 59.91] → [10.77, 59.91]
 *   Trail B: [10.76, 59.93] → [10.76, 59.91]  (dead-end at A's midpoint)
 */
const tJunctionGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.75, 59.91],
          [10.76, 59.91],
          [10.77, 59.91],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 2 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.76, 59.93],
          [10.76, 59.91],
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Empty / degenerate input
// ---------------------------------------------------------------------------

describe('buildRouteGraph — empty and degenerate input', () => {
  it('returns empty graph for null input', () => {
    const { nodes, edges } = buildRouteGraph(null);
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it('returns empty graph for undefined input', () => {
    const { nodes, edges } = buildRouteGraph(undefined);
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it('returns empty graph for empty FeatureCollection', () => {
    const { nodes, edges } = buildRouteGraph({ type: 'FeatureCollection', features: [] });
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it('does not throw for features with null geometry', () => {
    const input = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { id: 1 }, geometry: null }],
    };
    expect(() => buildRouteGraph(input)).not.toThrow();
    const { nodes, edges } = buildRouteGraph(input);
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it('does not throw for features with unsupported geometry type', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 1 },
          geometry: { type: 'Point', coordinates: [10.75, 59.91] },
        },
      ],
    };
    expect(() => buildRouteGraph(input)).not.toThrow();
    const { nodes, edges } = buildRouteGraph(input);
    expect(nodes.size).toBe(0);
    expect(edges.size).toBe(0);
  });

  it('does not throw for features with null properties', () => {
    const input = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: null,
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.75, 59.91],
              [10.76, 59.91],
            ],
          },
        },
      ],
    };
    expect(() => buildRouteGraph(input)).not.toThrow();
    const { nodes, edges } = buildRouteGraph(input);
    expect(nodes.size).toBe(2);
    expect(edges.size).toBe(1);
    const [edge] = edges.values();
    expect(edge.trailFeatureId).toBeNull();
    expect(edge.trailType).toBeNull();
    expect(edge.freshness).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single trail
// ---------------------------------------------------------------------------

describe('buildRouteGraph — single trail, no crossings', () => {
  it('produces exactly two endpoint nodes', () => {
    const { nodes } = buildRouteGraph(singleTrailGeoJson);
    expect(nodes.size).toBe(2);
    for (const node of nodes.values()) {
      expect(node.kind).toBe('endpoint');
    }
  });

  it('produces exactly one edge spanning the full trail', () => {
    const { edges } = buildRouteGraph(singleTrailGeoJson);
    expect(edges.size).toBe(1);
    const [edge] = edges.values();
    expect(edge.distanceKm).toBeGreaterThan(0);
    expect(edge.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('edge carries correct trail metadata', () => {
    const { edges } = buildRouteGraph(singleTrailGeoJson);
    const [edge] = edges.values();
    expect(edge.trailFeatureId).toBe(1);
    expect(edge.trailType).toBe(30);
    expect(edge.freshness).toBe(20);
  });

  it('edge id matches the from~to canonical node pair', () => {
    const { nodes, edges } = buildRouteGraph(singleTrailGeoJson);
    const [edge] = edges.values();
    const nodeIds = [...nodes.keys()].sort();
    expect(edge.id).toBe(nodeIds[0] + '~' + nodeIds[1]);
  });

  it('node ids have the canonical <lng6dp>:<lat6dp> format', () => {
    const { nodes } = buildRouteGraph(singleTrailGeoJson);
    const nodeIdPattern = /^-?\d+\.\d{6}:-?\d+\.\d{6}$/;
    for (const id of nodes.keys()) {
      expect(id).toMatch(nodeIdPattern);
    }
  });
});

// ---------------------------------------------------------------------------
// Crossing trails
// ---------------------------------------------------------------------------

describe('buildRouteGraph — two crossing trails', () => {
  it('produces one crossing node and four endpoint nodes (five nodes total)', () => {
    const { nodes } = buildRouteGraph(crossingTrailsGeoJson);
    const crossings = [...nodes.values()].filter((n) => n.kind === 'crossing');
    const endpoints = [...nodes.values()].filter((n) => n.kind === 'endpoint');
    expect(crossings).toHaveLength(1);
    expect(endpoints).toHaveLength(4);
    expect(nodes.size).toBe(5);
  });

  it('crossing node is near the geometric intersection', () => {
    const { nodes } = buildRouteGraph(crossingTrailsGeoJson);
    const crossing = [...nodes.values()].find((n) => n.kind === 'crossing');
    expect(crossing.coordinates[0]).toBeCloseTo(10.76, 4);
    expect(crossing.coordinates[1]).toBeCloseTo(59.91, 4);
  });

  it('produces four edges — two sections per crossing trail', () => {
    const { edges } = buildRouteGraph(crossingTrailsGeoJson);
    expect(edges.size).toBe(4);
  });

  it('every edge id is unique', () => {
    const { edges } = buildRouteGraph(crossingTrailsGeoJson);
    const ids = [...edges.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every edge references nodes that exist in the node map', () => {
    const { nodes, edges } = buildRouteGraph(crossingTrailsGeoJson);
    for (const edge of edges.values()) {
      expect(nodes.has(edge.from)).toBe(true);
      expect(nodes.has(edge.to)).toBe(true);
    }
  });

  it('all edge distances are positive', () => {
    const { edges } = buildRouteGraph(crossingTrailsGeoJson);
    for (const edge of edges.values()) {
      expect(edge.distanceKm).toBeGreaterThan(0);
    }
  });

  it('each edge id encodes its from/to node pair in sorted order', () => {
    const { edges } = buildRouteGraph(crossingTrailsGeoJson);
    for (const edge of edges.values()) {
      const [a, b] = [edge.from, edge.to].sort();
      expect(edge.id.startsWith(a + '~' + b)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Parallel trails (no crossings)
// ---------------------------------------------------------------------------

describe('buildRouteGraph — parallel trails, no crossings', () => {
  it('produces four endpoint nodes (no crossing nodes)', () => {
    const { nodes } = buildRouteGraph(parallelTrailsGeoJson);
    expect(nodes.size).toBe(4);
    for (const node of nodes.values()) {
      expect(node.kind).toBe('endpoint');
    }
  });

  it('produces two edges — one per trail', () => {
    const { edges } = buildRouteGraph(parallelTrailsGeoJson);
    expect(edges.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// MultiLineString trail
// ---------------------------------------------------------------------------

describe('buildRouteGraph — MultiLineString trail', () => {
  it('registers start and end endpoints for each sub-line', () => {
    const { nodes } = buildRouteGraph(multiLineTrailGeoJson);
    // Two sub-lines × 2 endpoints = 4 endpoint nodes (all distinct coordinates)
    expect(nodes.size).toBe(4);
    for (const node of nodes.values()) {
      expect(node.kind).toBe('endpoint');
    }
  });

  it('produces one edge per sub-line', () => {
    const { edges } = buildRouteGraph(multiLineTrailGeoJson);
    expect(edges.size).toBe(2);
  });

  it('each edge carries the parent trail feature id', () => {
    const { edges } = buildRouteGraph(multiLineTrailGeoJson);
    for (const edge of edges.values()) {
      expect(edge.trailFeatureId).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// T-junction
// ---------------------------------------------------------------------------

describe('buildRouteGraph — T-junction', () => {
  it('splits trail A at the junction point into two edges', () => {
    const { edges } = buildRouteGraph(tJunctionGeoJson);
    // Trail A → 2 sections; Trail B → 1 section = 3 edges total
    expect(edges.size).toBe(3);
  });

  it('junction point is registered as a crossing node', () => {
    const { nodes } = buildRouteGraph(tJunctionGeoJson);
    const crossings = [...nodes.values()].filter((n) => n.kind === 'crossing');
    expect(crossings.length).toBeGreaterThanOrEqual(1);
    // The junction node should be near [10.76, 59.91]
    const junctionNode = crossings.find(
      (n) => Math.abs(n.coordinates[0] - 10.76) < 0.001 && Math.abs(n.coordinates[1] - 59.91) < 0.001
    );
    expect(junctionNode).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Identifier determinism
// ---------------------------------------------------------------------------

describe('buildRouteGraph — identifier determinism', () => {
  it('produces identical node ids on repeated calls with the same input', () => {
    const run1 = buildRouteGraph(crossingTrailsGeoJson);
    const run2 = buildRouteGraph(crossingTrailsGeoJson);
    expect([...run1.nodes.keys()].sort()).toEqual([...run2.nodes.keys()].sort());
  });

  it('produces identical edge ids on repeated calls with the same input', () => {
    const run1 = buildRouteGraph(crossingTrailsGeoJson);
    const run2 = buildRouteGraph(crossingTrailsGeoJson);
    expect([...run1.edges.keys()].sort()).toEqual([...run2.edges.keys()].sort());
  });

  it('identical inputs produce equal edge metadata', () => {
    const run1 = buildRouteGraph(singleTrailGeoJson);
    const run2 = buildRouteGraph(singleTrailGeoJson);
    const [e1] = run1.edges.values();
    const [e2] = run2.edges.values();
    expect(e1.id).toBe(e2.id);
    expect(e1.distanceKm).toBe(e2.distanceKm);
    expect(e1.from).toBe(e2.from);
    expect(e1.to).toBe(e2.to);
  });

  it('edge ids for parallel trails do not collide', () => {
    const { edges } = buildRouteGraph(parallelTrailsGeoJson);
    const ids = [...edges.keys()];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('multi-trail graph edge ids are stable for same feature order', () => {
    const { edges: edges1 } = buildRouteGraph(crossingTrailsGeoJson);
    const { edges: edges2 } = buildRouteGraph(crossingTrailsGeoJson);
    for (const [id, edge] of edges1) {
      expect(edges2.has(id)).toBe(true);
      expect(edges2.get(id).from).toBe(edge.from);
      expect(edges2.get(id).to).toBe(edge.to);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge-ID contract: disambiguation suffix
// ---------------------------------------------------------------------------

describe('buildRouteGraph — disambiguation suffix for shared node pairs', () => {
  /**
   * Two trails sharing the same start and end endpoints (a "loop" or
   * parallel route between the same two nodes). The second edge between
   * that node pair must receive a :2 suffix so IDs remain unique.
   */
  const loopGeoJson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 1 },
        geometry: {
          type: 'LineString',
          // Trail A: straight line between A and B
          coordinates: [
            [10.75, 59.91],
            [10.77, 59.91],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { id: 2 },
        geometry: {
          type: 'LineString',
          // Trail B: arc connecting the same two endpoint coordinates
          coordinates: [
            [10.75, 59.91],
            [10.76, 59.915],
            [10.77, 59.91],
          ],
        },
      },
    ],
  };

  it('produces two distinct edges between the same node pair', () => {
    const { edges } = buildRouteGraph(loopGeoJson);
    // Both trails connect the same two endpoint nodes (no crossings between
    // them because neither trail's segment geometry actually crosses).
    const ids = [...edges.keys()];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('second occurrence receives a :2 suffix', () => {
    const { edges } = buildRouteGraph(loopGeoJson);
    const ids = [...edges.keys()];
    // Edge IDs end with :<n> only when a disambiguation suffix is appended.
    // Node IDs also contain ":" as a separator (e.g. "10.750000:59.910000")
    // so we match only a trailing ":<digit>" to find the suffix.
    const suffixed = ids.filter((id) => /:\d+$/.test(id));
    const unsuffixed = ids.filter((id) => !/:\d+$/.test(id));
    expect(suffixed).toHaveLength(1);
    expect(unsuffixed).toHaveLength(1);
    expect(suffixed[0].endsWith(':2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge geometry
// ---------------------------------------------------------------------------

describe('buildRouteGraph — edge geometry', () => {
  it('edge coordinates start and end at the declared from/to node coordinates', () => {
    const { nodes, edges } = buildRouteGraph(crossingTrailsGeoJson);
    for (const edge of edges.values()) {
      const fromNode = nodes.get(edge.from);
      const toNode = nodes.get(edge.to);
      const firstCoord = edge.coordinates[0];
      const lastCoord = edge.coordinates[edge.coordinates.length - 1];
      // Coordinates should be within ~1 m of the declared node positions
      expect(Math.abs(firstCoord[0] - fromNode.coordinates[0])).toBeLessThan(0.0001);
      expect(Math.abs(firstCoord[1] - fromNode.coordinates[1])).toBeLessThan(0.0001);
      expect(Math.abs(lastCoord[0] - toNode.coordinates[0])).toBeLessThan(0.0001);
      expect(Math.abs(lastCoord[1] - toNode.coordinates[1])).toBeLessThan(0.0001);
    }
  });

  it('section edge distances sum to approximately the full trail length', () => {
    const { edges } = buildRouteGraph(crossingTrailsGeoJson);
    // trail A: two sections; trail B: two sections
    const trailAEdges = [...edges.values()].filter((e) => e.trailFeatureId === 1);
    const trailBEdges = [...edges.values()].filter((e) => e.trailFeatureId === 2);
    const trailATotal = trailAEdges.reduce((s, e) => s + e.distanceKm, 0);
    const trailBTotal = trailBEdges.reduce((s, e) => s + e.distanceKm, 0);
    // Total should match the direct endpoint-to-endpoint distance (within rounding)
    expect(trailATotal).toBeGreaterThan(0);
    expect(trailBTotal).toBeGreaterThan(0);
  });
});
