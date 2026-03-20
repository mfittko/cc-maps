import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph.js';
import {
  createRoutePlan,
  decodeRoutePlanFromUrl,
  encodeRoutePlanToUrl,
  hydrateRoutePlan,
  readStoredRoutePlan,
} from '../lib/route-plan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'fixtures', 'route-plan');
const storageKey = 'cc-maps:settings';

function readFixture(name) {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function createStorage() {
  const store = new Map();

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
  };
}

const parityGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, destinationid: 100, trailtypesymbol: 30, prepsymbol: 20 },
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
      properties: { id: 2, destinationid: 100, trailtypesymbol: 30, prepsymbol: 20 },
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
      properties: { id: 3, destinationid: 200, trailtypesymbol: 30, prepsymbol: 20 },
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

describe('route-plan contract fixtures', () => {
  beforeEach(() => {
    global.window = {
      localStorage: createStorage(),
    };
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('round-trips the single-destination canonical fixture through the compact URL form', () => {
    const fixture = readFixture('canonical-single-destination.v2.json');
    const encoded = encodeRoutePlanToUrl(fixture);

    expect(encoded).toBe(
      '2|100|100|10.750000:59.910000~10.760000:59.910000,10.760000:59.910000~10.770000:59.910000'
    );
    expect(decodeRoutePlanFromUrl(encoded)).toEqual(fixture);
  });

  it('matches the deterministic route-graph edge ids for the preview-sector fixture', () => {
    const fixture = readFixture('canonical-primary-plus-preview-sector.v2.json');
    const graph = buildRouteGraph(parityGeoJson);

    fixture.anchorEdgeIds.forEach((edgeId) => {
      expect(graph.edges.has(edgeId)).toBe(true);
    });

    const destinationIds = [...new Set(fixture.anchorEdgeIds.map((edgeId) => graph.edges.get(edgeId)?.destinationId))];
    expect(destinationIds).toEqual(fixture.destinationIds);
  });

  it('hydrates the partial-stale fixture with explicit stale-anchor reporting', () => {
    const fixture = readFixture('hydration-partial-stale.v2.json');
    const graph = buildRouteGraph(parityGeoJson);

    expect(hydrateRoutePlan(fixture.canonical, graph)).toEqual(fixture.expectedHydration);
  });

  it('hydrates the empty-anchor fixture to empty', () => {
    const fixture = readFixture('canonical-empty-anchors.v2.json');
    const graph = buildRouteGraph(parityGeoJson);

    expect(hydrateRoutePlan(fixture, graph)).toEqual({
      status: 'empty',
      validAnchorEdgeIds: [],
      staleAnchorEdgeIds: [],
    });
  });

  it('migrates the legacy v1 encoded fixture into the canonical v2 shape', () => {
    const fixture = readFixture('legacy-url-v1-migration.json');

    expect(decodeRoutePlanFromUrl(fixture.encoded)).toEqual(fixture.expectedCanonical);
  });

  it('normalizes duplicate and misordered destination ids from stored payloads', () => {
    const fixture = readFixture('normalization-duplicate-destination-ids.json');
    window.localStorage.setItem(
      `${storageKey}:plan:${fixture.inputPayload.destinationId}`,
      JSON.stringify(fixture.inputPayload)
    );

    expect(readStoredRoutePlan(fixture.inputPayload.destinationId, storageKey)).toEqual(
      fixture.expectedCanonical
    );
  });

  it('rejects unsupported future-version payloads from storage', () => {
    const fixture = readFixture('invalid-future-version.json');
    window.localStorage.setItem(`${storageKey}:plan:100`, JSON.stringify(fixture));

    expect(readStoredRoutePlan('100', storageKey)).toBeNull();
  });

  it('rejects malformed destination ids from storage', () => {
    const fixture = readFixture('invalid-bad-destination-ids.json');
    window.localStorage.setItem(`${storageKey}:plan:100`, JSON.stringify(fixture));

    expect(readStoredRoutePlan('100', storageKey)).toBeNull();
  });

  it('rejects empty anchor identifiers from storage', () => {
    const fixture = readFixture('invalid-empty-anchor-entry.json');
    window.localStorage.setItem(`${storageKey}:plan:100`, JSON.stringify(fixture));

    expect(readStoredRoutePlan('100', storageKey)).toBeNull();
  });

  it('keeps the derived watch fixture subordinate to the same canonical route identity', () => {
    const fixture = readFixture('transfer-derived-watch.v2.json');
    const canonicalFromDerived = createRoutePlan(
      fixture.canonical.destinationId,
      fixture.derived.sectionSummaries.map((summary) => summary.anchorEdgeId),
      fixture.canonical.destinationIds
    );

    expect(canonicalFromDerived).toEqual(fixture.canonical);
    expect(fixture.derived.routeGeometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves canonical owner, owner-first destinationIds, and anchors when browse focus changes', () => {
    const fixture = readFixture('focus-change-stable-owner.v2.json');

    expect(fixture.canonicalOwner).toEqual(fixture.expectedCanonicalAfterFocusChange);
    expect(fixture.canonicalOwner.destinationId).toBe('100');
    expect(fixture.canonicalOwner.destinationIds[0]).toBe(fixture.canonicalOwner.destinationId);
    expect(fixture.canonicalOwner.destinationId).not.toBe(fixture.browseFocusDestinationId);
    expect(encodeRoutePlanToUrl(fixture.canonicalOwner)).toBe(fixture.expectedUrlAfterFocusChange);
    expect(decodeRoutePlanFromUrl(fixture.expectedUrlAfterFocusChange)).toEqual(fixture.canonicalOwner);
  });

  it('round-trips duplicate edge IDs with :2 suffix unchanged through compact URL encoding', () => {
    const fixture = readFixture('duplicate-edge-ids-parallel.v2.json');

    expect(encodeRoutePlanToUrl(fixture.canonical)).toBe(fixture.expectedUrl);
    expect(decodeRoutePlanFromUrl(fixture.expectedUrl)).toEqual(fixture.canonical);
  });

  it('round-trips duplicate edge IDs with :2 suffix unchanged through local storage', () => {
    const fixture = readFixture('duplicate-edge-ids-parallel.v2.json');

    window.localStorage.setItem(
      `${storageKey}:plan:${fixture.canonical.destinationId}`,
      JSON.stringify(fixture.canonical)
    );

    expect(readStoredRoutePlan(fixture.canonical.destinationId, storageKey)).toEqual(fixture.canonical);
  });

  it('treats all anchors as stale when no graph is available and keeps them visible', () => {
    const fixture = readFixture('canonical-single-destination.v2.json');
    const result = hydrateRoutePlan(fixture, null);

    expect(result.status).toBe('empty');
    expect(result.validAnchorEdgeIds).toEqual([]);
    expect(result.staleAnchorEdgeIds).toEqual(fixture.anchorEdgeIds);
    expect(result.staleAnchorEdgeIds.length).toBeGreaterThan(0);
  });

  it('distinguishes all-stale hydration (no graph) from a user-created empty route', () => {
    const fixtureWithAnchors = readFixture('canonical-single-destination.v2.json');
    const emptyFixture = readFixture('canonical-empty-anchors.v2.json');
    const graph = buildRouteGraph(parityGeoJson);

    const allStaleResult = hydrateRoutePlan(fixtureWithAnchors, null);
    const userEmptyResult = hydrateRoutePlan(emptyFixture, graph);

    expect(allStaleResult.status).toBe('empty');
    expect(allStaleResult.staleAnchorEdgeIds.length).toBeGreaterThan(0);

    expect(userEmptyResult.status).toBe('empty');
    expect(userEmptyResult.staleAnchorEdgeIds).toEqual([]);
  });
});