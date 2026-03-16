import { describe, expect, it } from 'vitest';
import { buildRouteGraph } from '../lib/route-graph.js';
import { createRoutePlan } from '../lib/route-plan.js';
import {
  appendRoutePlanAnchor,
  createRoutePlanGeoJson,
  findNearestRouteGraphEdgeId,
  isPlanningSelectionInteraction,
  removeRoutePlanAnchor,
  reverseRoutePlan,
} from '../lib/planning-mode.js';
import { resolveRoute } from '../lib/route-planner.js';

const graphGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 101, trailtypesymbol: 10, prepsymbol: 1 },
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
      properties: { id: 101, trailtypesymbol: 10, prepsymbol: 1 },
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
      properties: { id: 202, trailtypesymbol: 20, prepsymbol: 2 },
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

  describe('route-plan mutations', () => {
    it('appends anchors to an existing plan', () => {
      const initialPlan = createRoutePlan('7', ['edge-a']);

      expect(appendRoutePlanAnchor(initialPlan, '7', 'edge-b')).toEqual(
        createRoutePlan('7', ['edge-a', 'edge-b'])
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
  });

  describe('createRoutePlanGeoJson', () => {
    it('returns anchor and connector collections from a resolved plan', () => {
      const graph = buildRouteGraph(graphGeoJson);
      const edgeIds = [...graph.edges.keys()];
      const routePlan = createRoutePlan('7', [edgeIds[0], edgeIds[2]]);
      const routeResult = resolveRoute(graph, routePlan.anchorEdgeIds);
      const geoJson = createRoutePlanGeoJson(routePlan, routeResult, graph);

      expect(geoJson.anchors.features).toHaveLength(2);
      expect(geoJson.connectors.features).toHaveLength(1);
      expect(geoJson.connectors.features[0].properties.role).toBe('connector');
    });
  });
});
