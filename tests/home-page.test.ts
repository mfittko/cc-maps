import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_TRAIL_OPACITY,
  PREVIEW_TRAIL_OPACITY,
  applyThreeDimensionalMode,
  applyWinterBasemap,
  clampDistance,
  destinationPrepColorExpression,
  excludeTrailFeatureCollectionDestinationIds,
  filterTrailFeatureCollectionByDestinationIds,
  fitMapToGeoJson,
  freshnessLegendItems,
  getEdgeMidpointCoordinates,
  getFeatureCollectionGeoJson,
  getPreviewDestinationIds,
  getRouteDestinationIds,
  getTrailFeatureCollectionSignature,
  getTrailColorExpression,
  getTrailOpacityExpression,
  getUniqueDestinationIds,
  mergeTrailFeatureCollections,
  preventOverlayDoubleClickZoom,
  resolvePersistedRoutePlanForDestination,
  resolveRoutePlanForDestination,
  routeIncludesDestination,
  trailLegendItems,
} from '../lib/home-page';

function createLocalStorageMock(seed = {}) {
  const store = new Map(Object.entries(seed));

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function createMapMock({
  layers = [],
  existingLayers = {},
  existingSources = {},
  throwOnPaintProperty = null,
} = {}) {
  const state = {
    addLayerCalls: [],
    addSourceCalls: [],
    fitBoundsCalls: [],
    flyToCalls: [],
    removedLayers: [],
    setFogCalls: [],
    setPaintPropertyCalls: [],
    setTerrainCalls: [],
    easeToCalls: [],
  };

  const sourceMap = new Map(Object.entries(existingSources));
  const layerMap = new Map([...layers.map((layer) => [layer.id, layer]), ...Object.entries(existingLayers)]);

  return {
    state,
    getStyle() {
      return { layers };
    },
    getLayer(layerId) {
      return layerMap.get(layerId) || null;
    },
    setPaintProperty(layerId, property, value) {
      state.setPaintPropertyCalls.push({ layerId, property, value });

      if (throwOnPaintProperty === property) {
        throw new Error(`boom:${property}`);
      }
    },
    setFog(value) {
      state.setFogCalls.push(value);
    },
    getSource(sourceId) {
      return sourceMap.get(sourceId) || null;
    },
    addSource(sourceId, value) {
      sourceMap.set(sourceId, value);
      state.addSourceCalls.push({ sourceId, value });
    },
    setTerrain(value) {
      state.setTerrainCalls.push(value);
    },
    addLayer(layer, beforeId) {
      layerMap.set(layer.id, layer);
      state.addLayerCalls.push({ layer, beforeId });
    },
    removeLayer(layerId) {
      layerMap.delete(layerId);
      state.removedLayers.push(layerId);
    },
    easeTo(value) {
      state.easeToCalls.push(value);
    },
    fitBounds(bounds, options) {
      state.fitBoundsCalls.push({ bounds, options });
    },
    flyTo(value) {
      state.flyToCalls.push(value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const baseFeature = (id, destinationId, coordinates) => ({
  type: 'Feature',
  properties: {
    id,
    destinationid: destinationId,
  },
  geometry: {
    type: 'LineString',
    coordinates,
  },
});

describe('home-page helpers', () => {
  it('merges trail collections without duplicating identical features', () => {
    const duplicateFeature = baseFeature(1, '10', [
      [10.0, 59.0],
      [10.1, 59.1],
    ]);
    const uniqueFeature = baseFeature(2, '20', [
      [11.0, 60.0],
      [11.1, 60.1],
    ]);

    const merged = mergeTrailFeatureCollections([
      { type: 'FeatureCollection', features: [duplicateFeature, uniqueFeature] },
      { type: 'FeatureCollection', features: [duplicateFeature] },
    ]);

    expect(merged.features).toHaveLength(2);
    expect(merged.features).toEqual([duplicateFeature, uniqueFeature]);
  });

  it('produces a stable trail collection signature for content-identical collections', () => {
    const featureA = baseFeature(1, '10', [
      [10.0, 59.0],
      [10.1, 59.1],
    ]);
    const featureB = baseFeature(2, '20', [
      [11.0, 60.0],
      [11.1, 60.1],
    ]);

    const signatureA = getTrailFeatureCollectionSignature({
      type: 'FeatureCollection',
      features: [featureA, featureB],
    });
    const signatureB = getTrailFeatureCollectionSignature(
      mergeTrailFeatureCollections([
        { type: 'FeatureCollection', features: [featureA] },
        { type: 'FeatureCollection', features: [featureB] },
      ])
    );

    expect(signatureA).toBe(signatureB);
  });

  it('normalizes trail collection signatures when feature order differs', () => {
    const featureA = baseFeature(1, '10', [
      [10.0, 59.0],
      [10.1, 59.1],
    ]);
    const featureB = baseFeature(2, '20', [
      [11.0, 60.0],
      [11.1, 60.1],
    ]);

    const signatureA = getTrailFeatureCollectionSignature({
      type: 'FeatureCollection',
      features: [featureA, featureB],
    });
    const signatureB = getTrailFeatureCollectionSignature({
      type: 'FeatureCollection',
      features: [featureB, featureA],
    });

    expect(signatureA).toBe(signatureB);
  });

  it('normalizes unique destination ids and removes empty values', () => {
    expect(getUniqueDestinationIds([1, '1', '', null, undefined, '2', 2, '03'])).toEqual([
      '1',
      '2',
      '03',
    ]);
  });

  it('returns route destination ids only when the route has anchors', () => {
    expect(getRouteDestinationIds(null)).toEqual([]);
    expect(
      getRouteDestinationIds({
        destinationId: '10',
        destinationIds: ['10', '20', '20'],
        anchorEdgeIds: [],
      })
    ).toEqual([]);
    expect(
      getRouteDestinationIds({
        destinationId: '10',
        destinationIds: ['10', '20', '20'],
        anchorEdgeIds: ['edge-1'],
      })
    ).toEqual(['10', '20']);
  });

  it('detects whether a route includes a destination', () => {
    const routePlan = {
      destinationId: '10',
      destinationIds: ['10', '20'],
      anchorEdgeIds: ['edge-1'],
    };

    expect(routeIncludesDestination(routePlan, '20')).toBe(true);
    expect(routeIncludesDestination(routePlan, '30')).toBe(false);
    expect(routeIncludesDestination(routePlan, '')).toBe(false);
  });

  it('excludes primary destinations from preview destinations', () => {
    expect(getPreviewDestinationIds(['10', '20', '20', '30'], ['20', '40'])).toEqual([
      '10',
      '30',
    ]);
  });

  it('filters and excludes trail features by destination ids', () => {
    const geojson = {
      type: 'FeatureCollection',
      features: [
        baseFeature(1, '10', [[10.0, 59.0], [10.1, 59.1]]),
        baseFeature(2, '20', [[11.0, 60.0], [11.1, 60.1]]),
        baseFeature(3, '30', [[12.0, 61.0], [12.1, 61.1]]),
      ],
    };

    expect(filterTrailFeatureCollectionByDestinationIds(geojson, ['20', '30']).features).toHaveLength(2);
    expect(excludeTrailFeatureCollectionDestinationIds(geojson, ['20']).features).toHaveLength(2);
    expect(
      excludeTrailFeatureCollectionDestinationIds(geojson, ['20']).features.map(
        (feature) => feature.properties.destinationid
      )
    ).toEqual(['10', '30']);
    expect(filterTrailFeatureCollectionByDestinationIds(geojson, []).features).toEqual([]);
    expect(excludeTrailFeatureCollectionDestinationIds(geojson, [])).toBe(geojson);
  });

  it('returns route plans and persisted route sources for a destination', () => {
    const matchingRoutePlan = {
      version: 2,
      destinationId: '10',
      destinationIds: ['10', '20'],
      anchorEdgeIds: ['edge-1'],
    };
    const unrelatedRoutePlan = {
      version: 2,
      destinationId: '30',
      destinationIds: ['30'],
      anchorEdgeIds: ['edge-2'],
    };

    expect(
      resolveRoutePlanForDestination('20', [unrelatedRoutePlan, matchingRoutePlan])
    ).toEqual(matchingRoutePlan);
    expect(resolveRoutePlanForDestination('', [matchingRoutePlan])).toBeNull();

    vi.stubGlobal('window', {
      localStorage: createLocalStorageMock({
        'cc-maps:settings:plan:active': '10',
        'cc-maps:settings:plan:10': JSON.stringify(matchingRoutePlan),
      }),
    });

    const persistedRouteSelection = resolvePersistedRoutePlanForDestination(
      null,
      '10',
      'cc-maps:settings'
    );

    expect(persistedRouteSelection.routeFromUrl).toBeNull();
    expect(persistedRouteSelection.routeFromStorage).toEqual(matchingRoutePlan);
    expect(persistedRouteSelection.persistedRoutePlan).toEqual(matchingRoutePlan);
  });

  it('builds feature collections and trail style expressions', () => {
    expect(getFeatureCollectionGeoJson()).toEqual({
      type: 'FeatureCollection',
      features: [],
    });

    const features = [baseFeature(7, '70', [[10.0, 59.0], [10.1, 59.1]])];
    expect(getFeatureCollectionGeoJson(features)).toEqual({
      type: 'FeatureCollection',
      features,
    });

    expect(destinationPrepColorExpression).toEqual(getTrailColorExpression('freshness'));
    expect(getTrailColorExpression('type')).not.toEqual(getTrailColorExpression('freshness'));
    expect(getTrailOpacityExpression([])).toBe(ACTIVE_TRAIL_OPACITY);
    expect(getTrailOpacityExpression(['1', '2'])).toEqual([
      'case',
      ['in', ['to-string', ['get', 'id']], ['literal', ['1', '2']]],
      ACTIVE_TRAIL_OPACITY,
      PREVIEW_TRAIL_OPACITY,
    ]);
    expect(freshnessLegendItems.length).toBeGreaterThan(0);
    expect(trailLegendItems.length).toBeGreaterThan(0);
  });

  it('fits map bounds for available coordinates and falls back to flyTo when needed', () => {
    const boundsCoordinates = [];
    const mapboxApi = {
      LngLatBounds: class {
        extend(coordinates) {
          boundsCoordinates.push(coordinates);
        }
      },
    };
    const map = createMapMock();
    const geojsonWithCoordinates = {
      type: 'FeatureCollection',
      features: [
        baseFeature(1, '10', [[10.0, 59.0], [10.1, 59.1]]),
        {
          type: 'Feature',
          properties: { id: 2, destinationid: '10' },
          geometry: {
            type: 'MultiLineString',
            coordinates: [
              [[10.2, 59.2], [10.3, 59.3]],
              [[10.4, 59.4], [10.5, 59.5]],
            ],
          },
        },
      ],
    };

    fitMapToGeoJson(mapboxApi, map, geojsonWithCoordinates, [9, 9]);
    expect(boundsCoordinates).toEqual([
      [10.0, 59.0],
      [10.1, 59.1],
      [10.2, 59.2],
      [10.3, 59.3],
      [10.4, 59.4],
      [10.5, 59.5],
    ]);
    expect(map.state.fitBoundsCalls).toHaveLength(1);
    expect(map.state.flyToCalls).toHaveLength(0);

    fitMapToGeoJson(mapboxApi, map, { type: 'FeatureCollection', features: [{ geometry: null }] }, [8, 8]);
    expect(map.state.flyToCalls).toEqual([{ center: [8, 8], zoom: 11, duration: 900 }]);

    fitMapToGeoJson(
      mapboxApi,
      map,
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { id: 3, destinationid: '10' },
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [[10.6, 59.6], [10.7, 59.7]],
                null,
              ],
            },
          },
        ],
      } as any,
      [7, 7]
    );

    expect(boundsCoordinates).toContainEqual([10.6, 59.6]);
  });

  it('applies winter basemap styling without logging unsupported paint warnings', () => {
    const map = createMapMock({
      layers: [
        { id: 'bg', type: 'background' },
        { id: 'forest-fill', type: 'fill' },
        { id: 'water-fill', type: 'fill' },
        { id: 'contour-line', type: 'line' },
        { id: 'road-line', type: 'line' },
        { id: 'hillshade', type: 'line' },
      ],
      throwOnPaintProperty: 'line-opacity',
    });

    applyWinterBasemap(map);

    expect(map.state.setPaintPropertyCalls.length).toBeGreaterThan(0);
    expect(map.state.setFogCalls.at(-1)).toEqual({
      color: '#f5f8fb',
      'high-color': '#e5eef5',
      'horizon-blend': 0.04,
      'space-color': '#edf3f8',
      'star-intensity': 0,
    });
    expect(
      map.state.setPaintPropertyCalls.some(
        ({ property }) => property === 'hillshade-highlight-color'
      )
    ).toBe(false);

    const missingLayerMap = createMapMock({
      layers: [{ id: 'background-layer', type: 'background' }],
    });

    applyWinterBasemap(missingLayerMap);
    expect(missingLayerMap.state.setPaintPropertyCalls).toEqual([
      {
        layerId: 'background-layer',
        property: 'background-color',
        value: '#eef4f8',
      },
    ]);
  });

  it('applies hillshade winter overrides when the layer exposes hillshade paint properties', () => {
    const map = createMapMock({
      layers: [{ id: 'hillshade', type: 'hillshade' }],
    });

    applyWinterBasemap(map);

    expect(
      map.state.setPaintPropertyCalls.filter(({ layerId }) => layerId === 'hillshade')
    ).toEqual([
      {
        layerId: 'hillshade',
        property: 'hillshade-highlight-color',
        value: '#f8fbfd',
      },
      {
        layerId: 'hillshade',
        property: 'hillshade-shadow-color',
        value: '#b9cad5',
      },
      {
        layerId: 'hillshade',
        property: 'hillshade-accent-color',
        value: '#d9e6ee',
      },
    ]);
  });

  it('skips runtime hillshade overrides when the resolved map layer exposes an unsupported type', () => {
    const map = createMapMock({
      layers: [{ id: 'hillshade', type: 'hillshade' }],
      existingLayers: {
        hillshade: { id: 'hillshade', type: 'custom-runtime-layer' },
      },
    });

    applyWinterBasemap(map);

    expect(
      map.state.setPaintPropertyCalls.some(({ layerId }) => layerId === 'hillshade')
    ).toBe(false);
  });

  it('toggles three-dimensional mode and preserves layer ordering anchor', () => {
    const map = createMapMock({
      layers: [{ id: 'label-layer', type: 'symbol', layout: { 'text-field': 'Name' } }],
      existingLayers: {
        'label-layer': { id: 'label-layer' },
      },
    });

    applyThreeDimensionalMode(map, true);

    expect(map.state.addSourceCalls).toEqual([
      {
        sourceId: 'mapbox-dem',
        value: {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        },
      },
    ]);
    expect(map.state.setTerrainCalls.at(-1)).toEqual({ source: 'mapbox-dem', exaggeration: 1.2 });
    expect(map.state.addLayerCalls.at(-1).beforeId).toBe('label-layer');

    applyThreeDimensionalMode(map, false);

    expect(map.state.removedLayers).toContain('3d-buildings');
    expect(map.state.setTerrainCalls.at(-1)).toBeNull();
    expect(map.state.setFogCalls.at(-1)).toBeNull();
    expect(map.state.easeToCalls.at(-1)).toEqual({ pitch: 0, bearing: 0, duration: 700 });
  });

  it('handles overlay prevention and simple geometry helpers', () => {
    const preventDefault = vi.fn();
    const originalPreventDefault = vi.fn();

    preventOverlayDoubleClickZoom({
      preventDefault,
      originalEvent: { preventDefault: originalPreventDefault },
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(originalPreventDefault).toHaveBeenCalled();
    expect(getEdgeMidpointCoordinates({ coordinates: [[1, 2], [3, 4], [5, 6]] })).toEqual([3, 4]);
    expect(getEdgeMidpointCoordinates({ coordinates: [] })).toBeNull();
    expect(clampDistance(5, 0, 4)).toBe(4);
    expect(clampDistance(-1, 0, 4)).toBe(0);
    expect(clampDistance(2, 0, 4)).toBe(2);
  });
});