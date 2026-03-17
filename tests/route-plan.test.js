import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph.js';
import {
  ROUTE_PLAN_VERSION,
  clearStoredRoutePlan,
  createRoutePlan,
  decodeRoutePlanFromUrl,
  encodeRoutePlanToUrl,
  getRoutePlanStorageKey,
  hydrateRoutePlan,
  readStoredRoutePlan,
  shouldRestoreHydratedRoutePlan,
  writeStoredRoutePlan,
} from '../lib/route-plan.js';

// ---------------------------------------------------------------------------
// Storage helper
// ---------------------------------------------------------------------------

function createStorage() {
  const store = new Map();

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
  };
}

const storageKey = 'cc-maps:settings';

// ---------------------------------------------------------------------------
// Minimal GeoJSON fixture for building a test graph
// ---------------------------------------------------------------------------

/**
 * A--[AB]-->B--[BC]-->C
 * A=[10.75,59.91], B=[10.76,59.91], C=[10.77,59.91]
 */
const threeSegmentGeoJson = {
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
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('route-plan', () => {
  beforeEach(() => {
    global.window = {
      localStorage: createStorage(),
    };
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // -------------------------------------------------------------------------
  // ROUTE_PLAN_VERSION constant
  // -------------------------------------------------------------------------

  it('exports a numeric ROUTE_PLAN_VERSION', () => {
    expect(typeof ROUTE_PLAN_VERSION).toBe('number');
    expect(ROUTE_PLAN_VERSION).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // createRoutePlan
  // -------------------------------------------------------------------------

  describe('createRoutePlan', () => {
    it('creates a plan with correct version, destinationId, and anchorEdgeIds', () => {
      const plan = createRoutePlan('42', ['edgeA', 'edgeB']);
      expect(plan).toEqual({
        version: ROUTE_PLAN_VERSION,
        destinationId: '42',
        destinationIds: ['42'],
        anchorEdgeIds: ['edgeA', 'edgeB'],
      });
    });

    it('coerces numeric destinationId to string', () => {
      const plan = createRoutePlan(7, ['edgeA']);
      expect(plan.destinationId).toBe('7');
    });

    it('accepts an empty anchor list', () => {
      const plan = createRoutePlan('1', []);
      expect(plan.anchorEdgeIds).toEqual([]);
    });

    it('normalizes participating destination IDs with the primary first', () => {
      const plan = createRoutePlan('1', ['edgeA'], ['2', '1', '2', '3']);

      expect(plan.destinationIds).toEqual(['1', '2', '3']);
    });

    it('copies the anchorEdgeIds array (does not hold the same reference)', () => {
      const original = ['edgeA', 'edgeB'];
      const plan = createRoutePlan('1', original);
      original.push('edgeC');
      expect(plan.anchorEdgeIds).toHaveLength(2);
    });

    it('treats non-array anchorEdgeIds as an empty list', () => {
      expect(createRoutePlan('1', null).anchorEdgeIds).toEqual([]);
      expect(createRoutePlan('1', undefined).anchorEdgeIds).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getRoutePlanStorageKey
  // -------------------------------------------------------------------------

  describe('getRoutePlanStorageKey', () => {
    it('returns a namespaced key for a destination', () => {
      expect(getRoutePlanStorageKey('5', storageKey)).toBe('cc-maps:settings:plan:5');
    });

    it('uses different keys for different destinations', () => {
      const key1 = getRoutePlanStorageKey('1', storageKey);
      const key2 = getRoutePlanStorageKey('2', storageKey);
      expect(key1).not.toBe(key2);
    });
  });

  // -------------------------------------------------------------------------
  // Local-storage round-trip
  // -------------------------------------------------------------------------

  describe('readStoredRoutePlan / writeStoredRoutePlan', () => {
    it('returns null when nothing is stored', () => {
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('round-trips a plan through localStorage', () => {
      const plan = createRoutePlan('4', ['edgeA', 'edgeB']);
      writeStoredRoutePlan(plan, storageKey);
      expect(readStoredRoutePlan('4', storageKey)).toEqual(plan);
    });

    it('returns null for a different destination after writing', () => {
      const plan = createRoutePlan('4', ['edgeA']);
      writeStoredRoutePlan(plan, storageKey);
      expect(readStoredRoutePlan('99', storageKey)).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      const key = getRoutePlanStorageKey('4', storageKey);
      window.localStorage.setItem(key, '{bad json');
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('returns null for a payload with the wrong version', () => {
      const key = getRoutePlanStorageKey('4', storageKey);
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 999, destinationId: '4', anchorEdgeIds: [] })
      );
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('migrates a legacy version-1 payload from storage', () => {
      const key = getRoutePlanStorageKey('4', storageKey);
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: 1, destinationId: '4', anchorEdgeIds: ['edgeA'] })
      );

      expect(readStoredRoutePlan('4', storageKey)).toEqual(
        createRoutePlan('4', ['edgeA'], ['4'])
      );
    });

    it('returns null for a payload missing required fields', () => {
      const key = getRoutePlanStorageKey('4', storageKey);
      window.localStorage.setItem(key, JSON.stringify({ version: ROUTE_PLAN_VERSION }));
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('returns null for a payload with non-string anchor entries', () => {
      const key = getRoutePlanStorageKey('4', storageKey);
      window.localStorage.setItem(
        key,
        JSON.stringify({ version: ROUTE_PLAN_VERSION, destinationId: '4', anchorEdgeIds: [1, 2] })
      );
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });
  });

  describe('clearStoredRoutePlan', () => {
    it('removes the stored plan for a destination', () => {
      const plan = createRoutePlan('4', ['edgeA']);
      writeStoredRoutePlan(plan, storageKey);
      clearStoredRoutePlan('4', storageKey);
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('is a no-op when nothing is stored', () => {
      expect(() => clearStoredRoutePlan('99', storageKey)).not.toThrow();
    });

    it('only removes the plan for the specified destination', () => {
      writeStoredRoutePlan(createRoutePlan('1', ['edgeA']), storageKey);
      writeStoredRoutePlan(createRoutePlan('2', ['edgeB']), storageKey);
      clearStoredRoutePlan('1', storageKey);
      expect(readStoredRoutePlan('1', storageKey)).toBeNull();
      expect(readStoredRoutePlan('2', storageKey)).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // window / storage failure handling
  // -------------------------------------------------------------------------

  describe('graceful degradation without window or storage', () => {
    it('returns null when window is undefined', () => {
      global.window = undefined;
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
    });

    it('does not throw when write fails without window', () => {
      global.window = undefined;
      expect(() => writeStoredRoutePlan(createRoutePlan('4', ['e']), storageKey)).not.toThrow();
    });

    it('does not throw when clear fails without window', () => {
      global.window = undefined;
      expect(() => clearStoredRoutePlan('4', storageKey)).not.toThrow();
    });

    it('returns null when localStorage.getItem throws', () => {
      global.window = {
        localStorage: {
          getItem: vi.fn(() => { throw new Error('quota'); }),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      };
      expect(readStoredRoutePlan('4', storageKey)).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    it('warns when localStorage.setItem throws', () => {
      global.window = {
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(() => { throw new Error('quota'); }),
          removeItem: vi.fn(),
        },
      };
      expect(() => writeStoredRoutePlan(createRoutePlan('4', ['e']), storageKey)).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });

    it('warns when localStorage.removeItem throws', () => {
      global.window = {
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(() => { throw new Error('quota'); }),
        },
      };
      expect(() => clearStoredRoutePlan('4', storageKey)).not.toThrow();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // URL encode / decode
  // -------------------------------------------------------------------------

  describe('encodeRoutePlanToUrl', () => {
    it('encodes a plan with multiple anchors', () => {
      const plan = createRoutePlan('7', ['edgeA', 'edgeB', 'edgeC'], ['7', '8']);
      const encoded = encodeRoutePlanToUrl(plan);
      expect(encoded).toBe(`${ROUTE_PLAN_VERSION}|7|7;8|edgeA,edgeB,edgeC`);
    });

    it('encodes a plan with a single anchor', () => {
      const plan = createRoutePlan('1', ['edgeA']);
      expect(encodeRoutePlanToUrl(plan)).toBe(`${ROUTE_PLAN_VERSION}|1|1|edgeA`);
    });

    it('encodes a plan with no anchors', () => {
      const plan = createRoutePlan('3', []);
      expect(encodeRoutePlanToUrl(plan)).toBe(`${ROUTE_PLAN_VERSION}|3|3|`);
    });

    it('returns null for null input', () => {
      expect(encodeRoutePlanToUrl(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(encodeRoutePlanToUrl(undefined)).toBeNull();
    });

    it('returns null for a plan with the wrong version', () => {
      const badPlan = { version: 999, destinationId: '4', anchorEdgeIds: [] };
      expect(encodeRoutePlanToUrl(badPlan)).toBeNull();
    });

    it('handles edge IDs containing colons and tildes (real edge ID format)', () => {
      const edgeId = '10.750000:59.910000~10.760000:59.910000';
      const plan = createRoutePlan('4', [edgeId]);
      const encoded = encodeRoutePlanToUrl(plan);
      expect(encoded).toBe(`${ROUTE_PLAN_VERSION}|4|4|${edgeId}`);
    });
  });

  describe('decodeRoutePlanFromUrl', () => {
    it('round-trips a plan through URL encoding', () => {
      const plan = createRoutePlan('42', ['edgeA', 'edgeB']);
      const encoded = encodeRoutePlanToUrl(plan);
      const decoded = decodeRoutePlanFromUrl(encoded);
      expect(decoded).toEqual(plan);
    });

    it('decodes a plan with real-format edge IDs', () => {
      const edgeId1 = '10.750000:59.910000~10.760000:59.910000';
      const edgeId2 = '10.760000:59.910000~10.770000:59.910000';
      const plan = createRoutePlan('4', [edgeId1, edgeId2]);
      const decoded = decodeRoutePlanFromUrl(encodeRoutePlanToUrl(plan));
      expect(decoded).toEqual(plan);
    });

    it('decodes a plan with no anchors', () => {
      const plan = createRoutePlan('3', []);
      const decoded = decodeRoutePlanFromUrl(encodeRoutePlanToUrl(plan));
      expect(decoded).toEqual(plan);
    });

    it('migrates a legacy version-1 URL payload', () => {
      expect(decodeRoutePlanFromUrl('1|3|edgeA,edgeB')).toEqual(
        createRoutePlan('3', ['edgeA', 'edgeB'], ['3'])
      );
    });

    it('returns null for null input', () => {
      expect(decodeRoutePlanFromUrl(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(decodeRoutePlanFromUrl('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
      expect(decodeRoutePlanFromUrl('   ')).toBeNull();
    });

    it('returns null when the separator is missing', () => {
      expect(decodeRoutePlanFromUrl('2-7-edgeA')).toBeNull();
      expect(decodeRoutePlanFromUrl('bad')).toBeNull();
    });

    it('returns null for a non-integer version', () => {
      expect(decodeRoutePlanFromUrl('abc|7|edgeA')).toBeNull();
      expect(decodeRoutePlanFromUrl('1.5|7|edgeA')).toBeNull();
    });

    it('returns null for version < 1', () => {
      expect(decodeRoutePlanFromUrl('0|7|edgeA')).toBeNull();
    });

    it('returns null for an unsupported future version', () => {
      expect(decodeRoutePlanFromUrl(`${ROUTE_PLAN_VERSION + 1}|7|edgeA`)).toBeNull();
    });

    it('returns null for a non-numeric destinationId', () => {
      expect(decodeRoutePlanFromUrl(`${ROUTE_PLAN_VERSION}|abc|7|edgeA`)).toBeNull();
    });

    it('returns null for an empty destinationId', () => {
      expect(decodeRoutePlanFromUrl(`${ROUTE_PLAN_VERSION}||7|edgeA`)).toBeNull();
    });

    it('returns null for invalid destinationIds in version-2 payloads', () => {
      expect(decodeRoutePlanFromUrl(`${ROUTE_PLAN_VERSION}|4|4;bad|edgeA`)).toBeNull();
    });

    it('returns null when an anchor entry is an empty string', () => {
      // Two commas with nothing between them -> one empty entry
      expect(decodeRoutePlanFromUrl(`${ROUTE_PLAN_VERSION}|4|4|edgeA,,edgeB`)).toBeNull();
    });
  });

  describe('shouldRestoreHydratedRoutePlan', () => {
    it('returns true for a persisted route that was not manually dismissed', () => {
      const plan = createRoutePlan('7', ['edgeA'], ['7']);

      expect(shouldRestoreHydratedRoutePlan(plan)).toBe(true);
    });

    it('returns false when the same route was manually dismissed', () => {
      const plan = createRoutePlan('7', ['edgeA'], ['7']);

      expect(shouldRestoreHydratedRoutePlan(plan, encodeRoutePlanToUrl(plan))).toBe(false);
    });

    it('returns false for empty or invalid route plans', () => {
      expect(shouldRestoreHydratedRoutePlan(createRoutePlan('7', []))).toBe(false);
      expect(shouldRestoreHydratedRoutePlan(null)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // hydrateRoutePlan
  // -------------------------------------------------------------------------

  describe('hydrateRoutePlan', () => {
    let graph;

    beforeEach(() => {
      graph = buildRouteGraph(threeSegmentGeoJson);
    });

    it('returns status ok when all anchors are valid', () => {
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('4', edgeIds);
      const result = hydrateRoutePlan(plan, graph);
      expect(result.status).toBe('ok');
      expect(result.validAnchorEdgeIds).toEqual(edgeIds);
      expect(result.staleAnchorEdgeIds).toEqual([]);
    });

    it('returns status partial when some anchors are stale', () => {
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('4', [...edgeIds, 'stale-edge-id']);
      const result = hydrateRoutePlan(plan, graph);
      expect(result.status).toBe('partial');
      expect(result.validAnchorEdgeIds).toEqual(edgeIds);
      expect(result.staleAnchorEdgeIds).toEqual(['stale-edge-id']);
    });

    it('returns status empty when all anchors are stale', () => {
      const plan = createRoutePlan('4', ['stale-1', 'stale-2']);
      const result = hydrateRoutePlan(plan, graph);
      expect(result.status).toBe('empty');
      expect(result.validAnchorEdgeIds).toEqual([]);
      expect(result.staleAnchorEdgeIds).toEqual(['stale-1', 'stale-2']);
    });

    it('returns status empty for a plan with no anchors', () => {
      const plan = createRoutePlan('4', []);
      const result = hydrateRoutePlan(plan, graph);
      expect(result.status).toBe('empty');
      expect(result.validAnchorEdgeIds).toEqual([]);
      expect(result.staleAnchorEdgeIds).toEqual([]);
    });

    it('returns status empty when graph is null', () => {
      const plan = createRoutePlan('4', ['edgeA']);
      const result = hydrateRoutePlan(plan, null);
      expect(result.status).toBe('empty');
      expect(result.validAnchorEdgeIds).toEqual([]);
      expect(result.staleAnchorEdgeIds).toEqual(['edgeA']);
    });

    it('returns status empty when graph has no edges map', () => {
      const plan = createRoutePlan('4', ['edgeA']);
      const result = hydrateRoutePlan(plan, {});
      expect(result.status).toBe('empty');
      expect(result.staleAnchorEdgeIds).toEqual(['edgeA']);
    });

    it('returns status empty for null routePlan', () => {
      const result = hydrateRoutePlan(null, graph);
      expect(result.status).toBe('empty');
      expect(result.validAnchorEdgeIds).toEqual([]);
      expect(result.staleAnchorEdgeIds).toEqual([]);
    });

    it('returns status empty for an invalid routePlan payload', () => {
      const result = hydrateRoutePlan({ version: 999, destinationId: '4', anchorEdgeIds: [] }, graph);
      expect(result.status).toBe('empty');
    });

    it('does not include derived traversal data in hydration output', () => {
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('4', edgeIds);
      const result = hydrateRoutePlan(plan, graph);
      expect(result).not.toHaveProperty('connections');
      expect(result).not.toHaveProperty('traversal');
      expect(result).not.toHaveProperty('directions');
    });

    it('preserves anchor order in validAnchorEdgeIds', () => {
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('4', [...edgeIds, 'stale']);
      const result = hydrateRoutePlan(plan, graph);
      expect(result.validAnchorEdgeIds).toEqual(edgeIds);
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end: persist → clear → verify
  // -------------------------------------------------------------------------

  describe('end-to-end persistence lifecycle', () => {
    it('stores, reads, and clears a plan correctly', () => {
      const plan = createRoutePlan('5', ['edgeA', 'edgeB', 'edgeC']);
      writeStoredRoutePlan(plan, storageKey);

      const stored = readStoredRoutePlan('5', storageKey);
      expect(stored).toEqual(plan);

      clearStoredRoutePlan('5', storageKey);
      expect(readStoredRoutePlan('5', storageKey)).toBeNull();
    });

    it('overwrites an existing plan on a second write', () => {
      const plan1 = createRoutePlan('5', ['edgeA', 'edgeB']);
      const plan2 = createRoutePlan('5', ['edgeC']);
      writeStoredRoutePlan(plan1, storageKey);
      writeStoredRoutePlan(plan2, storageKey);
      expect(readStoredRoutePlan('5', storageKey)).toEqual(plan2);
    });
  });

  // -------------------------------------------------------------------------
  // End-to-end: URL round-trip + hydration
  // -------------------------------------------------------------------------

  describe('end-to-end URL round-trip and hydration', () => {
    it('encodes, decodes, and hydrates a plan against a real graph', () => {
      const graph = buildRouteGraph(threeSegmentGeoJson);
      const edgeIds = [...graph.edges.keys()];

      const plan = createRoutePlan('4', edgeIds);
      const encoded = encodeRoutePlanToUrl(plan);
      expect(typeof encoded).toBe('string');

      const decoded = decodeRoutePlanFromUrl(encoded);
      expect(decoded).toEqual(plan);

      const result = hydrateRoutePlan(decoded, graph);
      expect(result.status).toBe('ok');
      expect(result.validAnchorEdgeIds).toEqual(edgeIds);
    });

    it('produces a partial-plan after a URL-decoded plan has stale anchors', () => {
      const graph = buildRouteGraph(threeSegmentGeoJson);
      const [firstEdgeId] = graph.edges.keys();

      const plan = createRoutePlan('4', [firstEdgeId, 'stale-edge']);
      const encoded = encodeRoutePlanToUrl(plan);
      const decoded = decodeRoutePlanFromUrl(encoded);
      const result = hydrateRoutePlan(decoded, graph);

      expect(result.status).toBe('partial');
      expect(result.validAnchorEdgeIds).toContain(firstEdgeId);
      expect(result.staleAnchorEdgeIds).toContain('stale-edge');
    });
  });
});
