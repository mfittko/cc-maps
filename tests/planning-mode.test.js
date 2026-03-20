import { describe, expect, it } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph.js';
import { createRoutePlan } from '../lib/route-plan.js';
import {
  appendRoutePlanAnchor,
  areRequiredPreviewDestinationIdsLoaded,
  createRoutePlanGeoJson,
  findNearestRouteTraversalFeature,
  findNearestRouteGraphEdgeId,
  isPlanningSelectionInteraction,
  reorderAnchorEdgeIds,
  removeRoutePlanAnchor,
  reverseRoutePlan,
  shouldMergePreviewTrailsIntoRouteGraph,
} from '../lib/planning-mode.js';

const graphGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 101, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.0, 59.0],
          [10.01, 59.0],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 101, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.01, 59.0],
          [10.02, 59.0],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 202, destinationid: '7', trailtypesymbol: 20, prepsymbol: 2 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.02, 59.0],
          [10.03, 59.0],
        ],
      },
    },
  ],
};

const extendedGraphGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 301, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.0, 59.1], [10.01, 59.1]] },
    },
    {
      type: 'Feature',
      properties: { id: 302, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.01, 59.1], [10.02, 59.1]] },
    },
    {
      type: 'Feature',
      properties: { id: 303, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.02, 59.1], [10.03, 59.1]] },
    },
    {
      type: 'Feature',
      properties: { id: 304, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.03, 59.1], [10.04, 59.1]] },
    },
  ],
};

const multiDestinationGraphGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 401, destinationid: '7', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.0, 59.2], [10.01, 59.2]] },
    },
    {
      type: 'Feature',
      properties: { id: 402, destinationid: '8', trailtypesymbol: 10, prepsymbol: 1 },
      geometry: { type: 'LineString', coordinates: [[10.01, 59.2], [10.02, 59.2]] },
    },
  ],
};

describe('planning-mode helpers', () => {
  describe('isPlanningSelectionInteraction', () => {
    it('returns false when planning mode is off', () => {
      expect(
        isPlanningSelectionInteraction({
          isPlanning: false,
          isMobileInteraction: false,
          isMacOS: false,
          originalEvent: { ctrlKey: true },
        })
      ).toBe(false);
    });

    it('treats any tap as additive selection on mobile', () => {
      expect(
        isPlanningSelectionInteraction({
          isPlanning: true,
          isMobileInteraction: true,
          isMacOS: false,
          originalEvent: {},
        })
      ).toBe(true);
    });

    it('requires metaKey on macOS', () => {
      expect(
        isPlanningSelectionInteraction({
          isPlanning: true,
          isMobileInteraction: false,
          isMacOS: true,
          originalEvent: { metaKey: true, ctrlKey: false },
        })
      ).toBe(true);
      expect(
        isPlanningSelectionInteraction({
          isPlanning: true,
          isMobileInteraction: false,
          isMacOS: true,
          originalEvent: { metaKey: false, ctrlKey: true },
        })
      ).toBe(false);
    });

    it('requires ctrlKey on non-macOS desktop', () => {
      expect(
        isPlanningSelectionInteraction({
          isPlanning: true,
          isMobileInteraction: false,
          isMacOS: false,
          originalEvent: { ctrlKey: true, metaKey: false },
        })
      ).toBe(true);
      expect(
        isPlanningSelectionInteraction({
          isPlanning: true,
          isMobileInteraction: false,
          isMacOS: false,
          originalEvent: { ctrlKey: false, metaKey: true },
        })
      ).toBe(false);
    });
  });

  describe('route-graph preview merging', () => {
    it('merges preview trails while planning is active', () => {
      expect(shouldMergePreviewTrailsIntoRouteGraph(true, [])).toBe(true);
    });

    it('merges preview trails during reload pre-hydration when planned destinations exist', () => {
      expect(shouldMergePreviewTrailsIntoRouteGraph(false, ['8'])).toBe(true);
    });

    it('keeps browse mode bounded when no route is active or pending hydration', () => {
      expect(shouldMergePreviewTrailsIntoRouteGraph(false, [])).toBe(false);
    });

    it('treats route-required previews as loaded when every required destination is already present', () => {
      expect(areRequiredPreviewDestinationIdsLoaded(['8'], ['8', '9'])).toBe(true);
      expect(areRequiredPreviewDestinationIdsLoaded([], ['8', '9'])).toBe(true);
      expect(areRequiredPreviewDestinationIdsLoaded(['8', '10'], ['8', '9'])).toBe(false);
      expect(areRequiredPreviewDestinationIdsLoaded(['8'], [])).toBe(false);
    });
  });

  describe('route-plan mutations', () => {
    it('appends anchors to an existing plan', () => {
      const initialPlan = createRoutePlan('7', ['edge-a']);

      expect(appendRoutePlanAnchor(initialPlan, '7', 'edge-b')).toEqual(
        createRoutePlan('7', ['edge-a', 'edge-b'])
      );
    });

    it('inserts a new anchor between adjacent selected segments on a line', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const initialPlan = createRoutePlan('7', [edgeIds[0], edgeIds[2]]);

      expect(appendRoutePlanAnchor(initialPlan, '7', edgeIds[1], graph)).toEqual(
        createRoutePlan('7', [edgeIds[0], edgeIds[1], edgeIds[2]])
      );
    });

    it('keeps the first segment fixed when a new anchor would otherwise prepend the chain', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const initialPlan = createRoutePlan('7', [edgeIds[1], edgeIds[2]]);

      expect(appendRoutePlanAnchor(initialPlan, '7', edgeIds[0], graph)).toEqual(
        createRoutePlan('7', [edgeIds[1], edgeIds[2], edgeIds[0]])
      );
    });

    it('keeps the path oriented from the first selected segment when earlier clicks were non-adjacent', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const initialPlan = createRoutePlan('7', [edgeIds[2], edgeIds[0]]);

      expect(appendRoutePlanAnchor(initialPlan, '7', edgeIds[1], graph)).toEqual(
        createRoutePlan('7', [edgeIds[2], edgeIds[1], edgeIds[0]])
      );
    });

    it('reorders a persisted anchor list while keeping the first segment fixed', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];

      expect(reorderAnchorEdgeIds([edgeIds[2], edgeIds[0], edgeIds[1]], graph)).toEqual([
        edgeIds[2],
        edgeIds[1],
        edgeIds[0],
      ]);
    });

    it('reshuffles the full path to insert a missing interior segment while keeping the first segment fixed', () => {
      const graph = buildRouteGraph(extendedGraphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const initialPlan = createRoutePlan('7', [edgeIds[0], edgeIds[1], edgeIds[3]]);

      expect(appendRoutePlanAnchor(initialPlan, '7', edgeIds[2], graph)).toEqual(
        createRoutePlan('7', [edgeIds[0], edgeIds[1], edgeIds[2], edgeIds[3]])
      );
    });

    it('tracks additional destination sectors represented by selected anchors', () => {
      const graph = buildRouteGraph(multiDestinationGraphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const initialPlan = createRoutePlan('7', [edgeIds[0]]);

      expect(appendRoutePlanAnchor(initialPlan, '7', edgeIds[1], graph)).toEqual(
        createRoutePlan('7', [edgeIds[0], edgeIds[1]], ['7', '8'])
      );
    });

    it('removes an existing anchor when the same edge is selected again', () => {
      const initialPlan = createRoutePlan('7', ['edge-a', 'edge-b']);

      expect(appendRoutePlanAnchor(initialPlan, '7', 'edge-a')).toEqual(
        createRoutePlan('7', ['edge-b'])
      );
    });

    it('removes an anchor by index', () => {
      const initialPlan = createRoutePlan('7', ['edge-a', 'edge-b', 'edge-c']);

      expect(removeRoutePlanAnchor(initialPlan, '7', 1)).toEqual(
        createRoutePlan('7', ['edge-a', 'edge-c'])
      );
    });

    it('reverses the current plan order', () => {
      const initialPlan = createRoutePlan('7', ['edge-a', 'edge-b', 'edge-c']);

      expect(reverseRoutePlan(initialPlan, '7')).toEqual(
        createRoutePlan('7', ['edge-c', 'edge-b', 'edge-a'])
      );
    });

    it('ignores invalid anchor ids when appending', () => {
      const initialPlan = createRoutePlan('7', ['edge-a']);

      expect(appendRoutePlanAnchor(initialPlan, '7', '')).toEqual(initialPlan);
      expect(appendRoutePlanAnchor(initialPlan, '7')).toEqual(initialPlan);
    });

    it('returns an empty plan when removing from a missing route plan', () => {
      expect(removeRoutePlanAnchor(null, '7', 0)).toEqual(createRoutePlan('7', []));
    });

    it('preserves canonical owner when reversing a multi-destination plan regardless of browse focus', () => {
      // When browse focus is destination '8' but the canonical owner is '7',
      // reverseRoutePlan must be called with plan.destinationId ('7') to keep
      // the canonical identity stable. The resulting plan must not adopt the
      // browse-focus destination as its new owner.
      const graph = buildRouteGraph(multiDestinationGraphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('7', [edgeIds[0], edgeIds[1]], ['7', '8']);

      const reversed = reverseRoutePlan(plan, plan.destinationId);

      expect(reversed.destinationId).toBe('7');
      expect(reversed.destinationIds[0]).toBe('7');
      expect(reversed.anchorEdgeIds).toEqual([edgeIds[1], edgeIds[0]]);
    });

    it('preserves canonical owner when removing an anchor from a multi-destination plan', () => {
      // removeRoutePlanAnchor should receive plan.destinationId as owner so
      // the resulting plan keeps the same canonical identity after removal.
      const graph = buildRouteGraph(multiDestinationGraphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('7', [edgeIds[0], edgeIds[1]], ['7', '8']);

      const trimmed = removeRoutePlanAnchor(plan, plan.destinationId, 1, graph);

      expect(trimmed.destinationId).toBe('7');
      expect(trimmed.destinationIds[0]).toBe('7');
      expect(trimmed.anchorEdgeIds).toEqual([edgeIds[0]]);
    });

    it('preserves canonical owner when appending an anchor from the browse-focus destination', () => {
      // appendRoutePlanAnchor must be called with plan.destinationId (the canonical
      // owner) rather than the currently focused destination so the resulting plan
      // keeps the same owner even when a new anchor comes from a different sector.
      const graph = buildRouteGraph(multiDestinationGraphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const plan = createRoutePlan('7', [edgeIds[0]]);

      // Anchor from destination '8' sector, but owner stays '7'.
      const extended = appendRoutePlanAnchor(plan, plan.destinationId, edgeIds[1], graph);

      expect(extended.destinationId).toBe('7');
      expect(extended.destinationIds[0]).toBe('7');
      expect(extended.anchorEdgeIds).toContain(edgeIds[1]);
    });
  });

  describe('findNearestRouteGraphEdgeId', () => {
    const graph = buildRouteGraph(graphGeoJson);
    const edgeIds = [...graph.edges.keys()];

    it('returns the nearest matching edge for the clicked trail feature', () => {
      expect(findNearestRouteGraphEdgeId(graph, 101, [10.001, 59.0])).toBe(edgeIds[0]);
      expect(findNearestRouteGraphEdgeId(graph, 101, [10.019, 59.0])).toBe(edgeIds[1]);
    });

    it('returns null when the feature id does not exist in the graph', () => {
      expect(findNearestRouteGraphEdgeId(graph, 999, [10.001, 59.0])).toBeNull();
    });

    it('returns null for invalid graph lookup inputs', () => {
      expect(findNearestRouteGraphEdgeId(null, 101, [10.001, 59.0])).toBeNull();
      expect(findNearestRouteGraphEdgeId(graph, null, [10.001, 59.0])).toBeNull();
      expect(findNearestRouteGraphEdgeId(graph, 101, null)).toBeNull();
    });

    it('supports degenerate edges with repeated coordinates', () => {
      const degenerateGraph = {
        edges: new Map([
          [
            'edge-a',
            {
              coordinates: [
                [10.0, 59.0],
                [10.0, 59.0],
              ],
              trailFeatureId: 101,
            },
          ],
        ]),
      };

      expect(findNearestRouteGraphEdgeId(degenerateGraph, 101, [10.0, 59.001])).toBe('edge-a');
    });
  });

  describe('createRoutePlanGeoJson', () => {
    it('returns anchor, direction, and traversal collections for a route plan', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', [edgeIds[0], edgeIds[2]]);
      const geoJson = createRoutePlanGeoJson(routePlan, graph);

      expect(geoJson.anchors.features).toHaveLength(2);
      expect(geoJson.directions.features.length).toBeGreaterThanOrEqual(2);
      expect(geoJson.traversal.features).toHaveLength(2);
    });

    it('returns empty collections for a missing graph or empty plan', () => {
      const geoJson = createRoutePlanGeoJson(createRoutePlan('7', []), null);

      expect(geoJson.anchors.features).toHaveLength(0);
      expect(geoJson.directions.features).toHaveLength(0);
      expect(geoJson.traversal.features).toHaveLength(0);
    });

    it('orients traversal features according to route order', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const forwardPlan = createRoutePlan('7', [edgeIds[0], edgeIds[2]]);
      const reversePlan = createRoutePlan('7', [edgeIds[2], edgeIds[0]]);
      const forwardGeoJson = createRoutePlanGeoJson(forwardPlan, graph);
      const reverseGeoJson = createRoutePlanGeoJson(reversePlan, graph);

      expect(forwardGeoJson.traversal.features[0].geometry.coordinates[0]).toEqual([10.0, 59.0]);
      expect(reverseGeoJson.traversal.features[0].geometry.coordinates[0]).toEqual([10.02, 59.0]);
    });

    it('matches the nearest traversal feature for a clicked trail on the active route', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', [edgeIds[2], edgeIds[0]]);
      const geoJson = createRoutePlanGeoJson(routePlan, graph);

      const traversalFeature = findNearestRouteTraversalFeature(
        geoJson.traversal,
        101,
        [10.019, 59.0]
      );

      expect(traversalFeature?.properties?.trailFeatureId).toBe(101);
      expect(traversalFeature?.geometry?.coordinates?.[0]).toEqual([10.0, 59.0]);
    });

    it('uses shared-node traversal when adjacent anchors touch directly', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', [edgeIds[0], edgeIds[1]]);
      const geoJson = createRoutePlanGeoJson(routePlan, graph);

      expect(geoJson.directions.features).toHaveLength(2);
      expect(geoJson.traversal.features).toHaveLength(2);
      expect(geoJson.traversal.features[0].geometry.coordinates[0]).toEqual([10.0, 59.0]);
      expect(geoJson.traversal.features[1].geometry.coordinates[0]).toEqual([10.01, 59.0]);
    });

    it('orients adjacent anchor-only traversal consistently when the route is reversed', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', [edgeIds[2], edgeIds[1], edgeIds[0]]);
      const geoJson = createRoutePlanGeoJson(routePlan, graph);

      expect(geoJson.directions.features).toHaveLength(3);
      expect(geoJson.traversal.features).toHaveLength(3);
      expect(geoJson.traversal.features[0].geometry.coordinates[0]).toEqual([10.03, 59.0]);
      expect(geoJson.traversal.features[1].geometry.coordinates[0]).toEqual([10.02, 59.0]);
      expect(geoJson.traversal.features[2].geometry.coordinates[0]).toEqual([10.01, 59.0]);
    });

    it('skips missing anchor and connector edges without failing', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', ['missing-edge', edgeIds[2]]);
      const geoJson = createRoutePlanGeoJson(routePlan, graph);

      expect(geoJson.anchors.features).toHaveLength(1);
      expect(geoJson.directions.features).toHaveLength(1);
      expect(geoJson.traversal.features).toHaveLength(1);
      expect(geoJson.traversal.features[0].properties.edgeId).toBe(edgeIds[2]);
    });

    it('drops invalid edges that have no coordinates', () => {
      const graph = {
        edges: new Map([
          [
            'bad-edge',
            {
              id: 'bad-edge',
              from: 'a',
              to: 'b',
              coordinates: null,
              trailFeatureId: 303,
            },
          ],
        ]),
      };
      const geoJson = createRoutePlanGeoJson(createRoutePlan('7', ['bad-edge']), graph);

      expect(geoJson.anchors.features).toHaveLength(0);
      expect(geoJson.directions.features).toHaveLength(0);
      expect(geoJson.traversal.features).toHaveLength(0);
    });

    it('returns null when traversal lookup inputs are invalid', () => {
      expect(findNearestRouteTraversalFeature(null, 101, [10.001, 59.0])).toBeNull();
      expect(
        findNearestRouteTraversalFeature({ features: [] }, null, [10.001, 59.0])
      ).toBeNull();
      expect(
        findNearestRouteTraversalFeature({ features: [] }, 101, null)
      ).toBeNull();
    });

    it('supports multiline traversal matching and ignores unsupported geometry', () => {
      const traversalFeature = findNearestRouteTraversalFeature(
        {
          features: [
            {
              type: 'Feature',
              properties: { trailFeatureId: 101 },
              geometry: {
                type: 'Point',
                coordinates: [10.0, 59.0],
              },
            },
            {
              type: 'Feature',
              properties: { trailFeatureId: 101 },
              geometry: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10.0, 59.0],
                    [10.01, 59.0],
                  ],
                  [
                    [10.01, 59.0],
                    [10.02, 59.0],
                  ],
                ],
              },
            },
          ],
        },
        101,
        [10.019, 59.0]
      );

      expect(traversalFeature?.geometry?.type).toBe('MultiLineString');
    });

    it('uses the nearest multiline segment instead of only the first segment', () => {
      const traversalFeature = findNearestRouteTraversalFeature(
        {
          features: [
            {
              type: 'Feature',
              properties: { trailFeatureId: 101, name: 'first' },
              geometry: {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [10.0, 59.0],
                    [10.01, 59.0],
                  ],
                  [
                    [10.5, 59.5],
                    [10.51, 59.5],
                  ],
                ],
              },
            },
            {
              type: 'Feature',
              properties: { trailFeatureId: 101, name: 'second' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [10.2, 59.2],
                  [10.21, 59.2],
                ],
              },
            },
          ],
        },
        101,
        [10.509, 59.5]
      );

      expect(traversalFeature?.properties?.name).toBe('first');
    });
  });
});
