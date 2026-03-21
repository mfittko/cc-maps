import { describe, expect, it } from 'vitest';
import { resolvePlanningAnchorSelection } from '../hooks/useHomePageActions';
import { buildRouteGraph } from '../lib/route-graph';

function lineFeature(id, destinationid, coordinates) {
  return {
    type: 'Feature',
    properties: {
      id,
      destinationid,
      trailtypesymbol: 1,
      prepsymbol: 1,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

describe('useHomePageActions planning anchor selection', () => {
  it('resolves preview-destination anchor selections from the available trail graph', () => {
    const primaryFeature = lineFeature('trail-7', '7', [
      [10.0, 59.0],
      [10.01, 59.0],
    ]);
    const previewFeature = lineFeature('trail-8', '8', [
      [10.01, 59.0],
      [10.02, 59.0],
    ]);
    const primaryGeoJson = {
      type: 'FeatureCollection',
      features: [primaryFeature],
    };
    const availableGeoJson = {
      type: 'FeatureCollection',
      features: [primaryFeature, previewFeature],
    };

    const selection = resolvePlanningAnchorSelection(
      buildRouteGraph(primaryGeoJson),
      availableGeoJson,
      previewFeature,
      [10.015, 59.0]
    );

    expect(selection).not.toBeNull();
    expect(selection?.graph?.edges?.get(selection?.edgeId || '')?.destinationId).toBe('8');
    expect(selection?.graph?.edges?.size).toBeGreaterThan(1);
  });

  it('returns null when the clicked feature cannot be resolved in either graph', () => {
    const primaryFeature = lineFeature('trail-7', '7', [
      [10.0, 59.0],
      [10.01, 59.0],
    ]);
    const primaryGeoJson = {
      type: 'FeatureCollection',
      features: [primaryFeature],
    };

    const selection = resolvePlanningAnchorSelection(
      buildRouteGraph(primaryGeoJson),
      primaryGeoJson,
      lineFeature('missing', '8', [
        [10.02, 59.0],
        [10.03, 59.0],
      ]),
      [10.025, 59.0]
    );

    expect(selection).toBeNull();
  });
});