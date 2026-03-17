import { describe, expect, it } from 'vitest';
import { createRoutePlanGeoJson } from '../lib/planning-mode.js';
import { buildRouteGraph } from '../lib/route-graph.js';
import { createRoutePlan } from '../lib/route-plan.js';
import {
  findClosestDestinationByTrailProximity,
  findClosestDestination,
  formatDistance,
  getAllTrailSegmentLabelsGeoJson,
  getClickedTrailSection,
  getCrossingMetrics,
  getDestinationSummary,
  getDestinationsWithinRadius,
  getDistanceInKilometers,
  getElevationChangeMetrics,
  getSampledCoordinatesAlongFeature,
  getSuggestedDestinationGeoJson,
  getTrailSelectionLengthInKilometers,
} from '../lib/map-domain';

const oslo = [10.7522, 59.9139];
const nearby = [10.7622, 59.9139];
const farAway = [11.2, 60.1];

const destinations = [
  { id: '1', name: 'Oslo', coordinates: oslo },
  { id: '2', name: 'Nearby', coordinates: nearby },
  { id: '3', name: 'Far', coordinates: farAway },
];

const trailsGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 101 },
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
      properties: { id: 202 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.76, 59.905],
          [10.76, 59.915],
        ],
      },
    },
  ],
};

const trailProximityGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 303, destinationid: '1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.7518, 59.9137],
          [10.7528, 59.9142],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { id: 404, destinationid: '3' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [11.19, 60.1],
          [11.21, 60.1],
        ],
      },
    },
  ],
};

const multiSegmentProximityGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 505, destinationid: '1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.752, 59.914],
          [10.7524, 59.914],
          [10.76, 59.92],
        ],
      },
    },
  ],
};

const clickedSectionGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 1,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.0, 59.0],
          [10.01, 59.0],
          [10.02, 59.0],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 2,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.01, 58.99],
          [10.01, 59.01],
        ],
      },
    },
  ],
};

const multiLineSectionGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 11,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
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
    {
      type: 'Feature',
      properties: {
        id: 12,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.005, 58.99],
          [10.005, 59.01],
        ],
      },
    },
  ],
};

const disjointMultiLineSectionGeoJson = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 21,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [10.0, 59.0],
            [10.01, 59.0],
          ],
          [
            [10.02, 59.0],
            [10.03, 59.0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 22,
        destinationid: '1',
        trailtypesymbol: 30,
        prepsymbol: 20,
        has_classic: true,
        has_skating: true,
        has_floodlight: false,
        is_scootertrail: false,
        warningtext: '',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.025, 58.99],
          [10.025, 59.01],
        ],
      },
    },
  ],
};

describe('map-domain', () => {
  it('builds destination summaries with a fallback center', () => {
    const summary = getDestinationSummary(
      {
        properties: { id: 10, name: 'Nordmarka', prepsymbol: 20 },
        geometry: null,
      },
      oslo
    );

    expect(summary).toEqual({
      id: '10',
      name: 'Nordmarka',
      prepSymbol: 20,
      coordinates: oslo,
    });
  });

  it('returns suggested destination geojson and radius filtering', () => {
    expect(getSuggestedDestinationGeoJson([]).features).toEqual([]);
    expect(getDestinationsWithinRadius(destinations, null, 1, '1')).toEqual([]);

    const geojson = getSuggestedDestinationGeoJson(destinations.slice(0, 2));
    expect(geojson.features).toHaveLength(2);
    expect(geojson.features[0].properties.name).toBe('Oslo');

    const withinRadius = getDestinationsWithinRadius(destinations, oslo, 1, '1');
    expect(withinRadius.map((destination) => destination.id)).toEqual(['2']);
  });

  it('computes distances and closest destinations', () => {
    expect(getDistanceInKilometers(oslo, oslo)).toBeCloseTo(0, 6);
    expect(getDistanceInKilometers(oslo, nearby)).toBeGreaterThan(0);
    expect(findClosestDestination(destinations, [10.761, 59.9139]).id).toBe('2');
    expect(findClosestDestination([], oslo)).toBeNull();
  });

  it('matches destinations by trail proximity within a threshold', () => {
    expect(
      findClosestDestinationByTrailProximity(
        destinations,
        trailProximityGeoJson,
        [10.7524, 59.91395],
        0.05
      )?.id
    ).toBe('1');

    expect(
      findClosestDestinationByTrailProximity(destinations, trailProximityGeoJson, [10.9, 59.9], 0.05)
    ).toBeNull();

    expect(
      findClosestDestinationByTrailProximity(
        destinations,
        multiSegmentProximityGeoJson,
        [10.7522, 59.914],
        0.05
      )?.id
    ).toBe('1');
  });

  it('ignores trail proximity features whose destination is not in the loaded destination list', () => {
    expect(
      findClosestDestinationByTrailProximity(
        [{ id: '1', name: 'Oslo', coordinates: oslo }],
        {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { id: 909, destinationid: '999' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [10.7518, 59.9137],
                  [10.7528, 59.9142],
                ],
              },
            },
          ],
        },
        oslo,
        0.5
      )
    ).toBeNull();
  });

  it('selects the clicked distance interval on a trail', () => {
    const selectedSection = getClickedTrailSection(
      clickedSectionGeoJson.features[0],
      [10.004, 59.0],
      clickedSectionGeoJson,
      destinations,
      0.01,
      0.05
    );

    expect(selectedSection.segment).toBeTruthy();
    expect(selectedSection.segment.fromLabel).toBe('Trail start');
    expect(selectedSection.segment.toLabel).toBe('Crossing 1');
    expect(getTrailSelectionLengthInKilometers(selectedSection.feature)).toBeCloseTo(
      selectedSection.segment.distanceKm,
      6
    );
  });

  it('keeps a selected multiline interval within the overlapping part only', () => {
    const selectedSection = getClickedTrailSection(
      multiLineSectionGeoJson.features[0],
      [10.002, 59.0],
      multiLineSectionGeoJson,
      destinations,
      0.01,
      0.05
    );

    expect(selectedSection.segment).toBeTruthy();
    expect(selectedSection.feature.geometry.type).toBe('LineString');
    expect(selectedSection.feature.geometry.coordinates).toEqual([
      [10.0, 59.0],
      [10.005, 59.0],
    ]);
  });

  it('preserves discontinuous multiline interval boundaries in the selected geometry', () => {
    const selectedSection = getClickedTrailSection(
      disjointMultiLineSectionGeoJson.features[0],
      [10.022, 59.0],
      disjointMultiLineSectionGeoJson,
      destinations,
      0.01,
      0.05
    );

    expect(selectedSection.segment).toBeTruthy();
    expect(selectedSection.feature.geometry.type).toBe('LineString');
    expect(selectedSection.feature.geometry.coordinates).toEqual([
      [10.0, 59.0],
      [10.01, 59.0],
      [10.02, 59.0],
      [10.025, 59.0],
    ]);
  });

  it('falls back to the closest labeled interval when click coordinates are invalid', () => {
    const selectedSection = getClickedTrailSection(
      clickedSectionGeoJson.features[0],
      [Number.NaN, Number.NaN],
      clickedSectionGeoJson,
      destinations,
      0.01,
      0.05
    );

    expect(selectedSection.segment).toBeTruthy();
    expect(selectedSection.segment.fromLabel).toBe('Trail start');
  });

  it('handles clicked trail section fallback branches', () => {
    expect(getClickedTrailSection(null, [10.0, 59.0], clickedSectionGeoJson, destinations, 0.01, 0.05)).toBeNull();

    const noSegmentTrails = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 9 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.0, 59.0],
              [10.0002, 59.0],
            ],
          },
        },
      ],
    };

    const noSegmentSelection = getClickedTrailSection(
      noSegmentTrails.features[0],
      [10.0, 59.0],
      noSegmentTrails,
      destinations,
      0.01,
      0.05
    );

    expect(noSegmentSelection.segment).toBeNull();
    expect(noSegmentSelection.feature).toBe(noSegmentTrails.features[0]);

    const fallbackToClosestSegment = getClickedTrailSection(
      clickedSectionGeoJson.features[0],
      null,
      clickedSectionGeoJson,
      destinations,
      0.01,
      0.05
    );

    expect(fallbackToClosestSegment.segment).toBeTruthy();
    expect(fallbackToClosestSegment.segment.fromLabel).toBe('Trail start');
  });

  it('computes crossing metrics and segment labels', () => {
    const metrics = getCrossingMetrics(trailsGeoJson.features[0], trailsGeoJson, destinations, 1.25, 0.05);

    expect(metrics.crossings).toHaveLength(1);
    expect(metrics.totalLengthKm).toBeGreaterThan(0.5);
    expect(metrics.segments).toHaveLength(2);
    expect(metrics.segments[0].distanceKm).toBeGreaterThan(0.1);

    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(trailsGeoJson, destinations, 1.25, 0.05);
    expect(labelsGeoJson.features.length).toBeGreaterThan(0);
    expect(labelsGeoJson.features[0].properties.label).toMatch(/km$/);
  });

  it('filters segment labels to the active traversal when provided', () => {
    const graph = buildRouteGraph(clickedSectionGeoJson);
    const edgeIds = [...graph.edges.keys()];
    const traversalGeoJson = createRoutePlanGeoJson(createRoutePlan('1', [edgeIds[0]]), graph).traversal;

    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(
      clickedSectionGeoJson,
      destinations,
      1.25,
      0.05,
      traversalGeoJson
    );

    expect(labelsGeoJson.features).toHaveLength(1);
    expect(labelsGeoJson.features[0].properties.route).toBe('Trail start to Crossing 1');
    expect(labelsGeoJson.features[0].properties.trailFeatureId).toBe(1);
  });

  it('returns no labels when traversal filtering has no active features', () => {
    expect(
      getAllTrailSegmentLabelsGeoJson(
        clickedSectionGeoJson,
        destinations,
        1.25,
        0.05,
        { type: 'FeatureCollection', features: [] }
      )
    ).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('ignores degenerate traversal geometry when filtering segment labels', () => {
    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(
      clickedSectionGeoJson,
      destinations,
      1.25,
      0.05,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { trailFeatureId: 1 },
            geometry: {
              type: 'LineString',
              coordinates: [[10.0, 59.0]],
            },
          },
        ],
      }
    );

    expect(labelsGeoJson).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('ignores traversal features from a different trail when filtering segment labels', () => {
    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(
      clickedSectionGeoJson,
      destinations,
      1.25,
      0.05,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { trailFeatureId: 999 },
            geometry: {
              type: 'LineString',
              coordinates: [
                [10.0, 59.0],
                [10.01, 59.0],
              ],
            },
          },
        ],
      }
    );

    expect(labelsGeoJson).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('handles empty and no-crossing trail cases', () => {
    const parallelTrails = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 1 },
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
        {
          type: 'Feature',
          properties: { id: 2 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.0, 59.01],
              [10.02, 59.01],
            ],
          },
        },
      ],
    };

    expect(getCrossingMetrics(null, parallelTrails, destinations, 0.01, 0.05)).toBeNull();

    const metrics = getCrossingMetrics(parallelTrails.features[0], parallelTrails, [], 0.01, 0.05);
    expect(metrics.crossings).toEqual([]);
    expect(metrics.segments).toHaveLength(1);
    expect(metrics.segments[0].fromLabel).toBe('Trail start');
    expect(metrics.segments[0].toLabel).toBe('Trail end');

    expect(getAllTrailSegmentLabelsGeoJson(null, destinations, 1.25, 0.05)).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('normalizes end-adjacent crossings and ignores intersections outside a segment', () => {
    const endpointCrossingTrails = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 11 },
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
          properties: { id: 22 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.01, 58.99],
              [10.01, 59.01],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { id: 33 },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.02, 58.99],
              [10.02, 59.01],
            ],
          },
        },
      ],
    };

    const metrics = getCrossingMetrics(
      endpointCrossingTrails.features[0],
      endpointCrossingTrails,
      [],
      0.01,
      0.05
    );

    expect(metrics.crossings).toHaveLength(1);
    expect(metrics.segments).toHaveLength(1);
    expect(metrics.segments[0].toLabel).toBe('Trail end');
  });

  it('handles invalid geometry without inventing labels or segments', () => {
    const invalidGeometryTrails = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 44 },
          geometry: null,
        },
      ],
    };

    const metrics = getCrossingMetrics(
      invalidGeometryTrails.features[0],
      invalidGeometryTrails,
      destinations,
      1.25,
      0.05
    );

    expect(metrics.crossings).toEqual([]);
    expect(metrics.segments).toEqual([]);
    expect(metrics.totalLengthKm).toBe(0);
  });

  it('handles trail proximity and selection length edge cases', () => {
    expect(findClosestDestinationByTrailProximity([], trailProximityGeoJson, oslo, 0.05)).toBeNull();
    expect(findClosestDestinationByTrailProximity(destinations, null, oslo, 0.05)).toBeNull();
    expect(getTrailSelectionLengthInKilometers(null)).toBe(0);
  });

  it('samples selected trail geometry at a fixed spacing and keeps the endpoint', () => {
    const sampledCoordinates = getSampledCoordinatesAlongFeature(
      clickedSectionGeoJson.features[0],
      500
    );

    expect(sampledCoordinates[0]).toEqual([10.0, 59.0]);
    expect(sampledCoordinates[sampledCoordinates.length - 1]).toEqual([10.02, 59.0]);
    expect(sampledCoordinates.length).toBeGreaterThanOrEqual(4);
  });

  it('handles sampling edge cases for missing and zero-length geometry', () => {
    expect(getSampledCoordinatesAlongFeature(null)).toEqual([]);

    const zeroLengthFeature = {
      type: 'Feature',
      properties: { id: 77, destinationid: '1' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [10.0, 59.0],
          [10.0, 59.0],
        ],
      },
    };

    expect(getSampledCoordinatesAlongFeature(zeroLengthFeature)).toEqual([[10.0, 59.0]]);
  });

  it('matches trail proximity for degenerate segments', () => {
    const degenerateTrailGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 606, destinationid: '1' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [10.7522, 59.9139],
              [10.7522, 59.9139],
            ],
          },
        },
      ],
    };

    expect(
      findClosestDestinationByTrailProximity(destinations, degenerateTrailGeoJson, oslo, 0.05)?.id
    ).toBe('1');
  });

  it('computes ascent and descent from sampled elevations', () => {
    expect(getElevationChangeMetrics([100, 125, 118, 140, 135])).toEqual({
      ascentMeters: 47,
      descentMeters: 12,
    });

    expect(getElevationChangeMetrics([null, 100, 105, Number.NaN, 97])).toEqual({
      ascentMeters: 5,
      descentMeters: 8,
    });

    expect(getElevationChangeMetrics([100])).toBeNull();
    expect(getElevationChangeMetrics(null)).toBeNull();
  });

  it('formats distances consistently', () => {
    expect(formatDistance(1.234)).toBe('1.2 km');
  });
});