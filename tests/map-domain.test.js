import { describe, expect, it } from 'vitest';
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

  it('formats distances consistently', () => {
    expect(formatDistance(1.234)).toBe('1.2 km');
  });
});