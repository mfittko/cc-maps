import { getPersistedRoutePlanSources } from './map-persistence';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from './sporet';
import type { Coordinates, LegendItem, TrailFeatureCollection } from '../types/geo';
import type { RoutePlan } from '../types/route';

type StyleDefinition = {
  color: string;
  label: string;
};

type StyleMap = Record<string, StyleDefinition>;

export const DEFAULT_CENTER: Coordinates = [10.7522, 59.9139];
export const WINTER_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';
export const DESTINATIONS_SOURCE_ID = 'destinations';
export const DESTINATIONS_LAYER_ID = 'destinations-layer';
export const SUGGESTED_DESTINATION_SOURCE_ID = 'suggested-destination';
export const SUGGESTED_DESTINATION_RING_LAYER_ID = 'suggested-destination-ring-layer';
export const SUGGESTED_DESTINATION_DOT_LAYER_ID = 'suggested-destination-dot-layer';
export const SUGGESTED_DESTINATION_LABEL_LAYER_ID = 'suggested-destination-label-layer';
export const TRAILS_SOURCE_ID = 'trails';
export const TRAILS_LAYER_ID = 'trails-layer';
export const TRAILS_HIT_LAYER_ID = 'trails-hit-layer';
export const SELECTED_TRAIL_SOURCE_ID = 'selected-trail';
export const SELECTED_TRAIL_GLOW_LAYER_ID = 'selected-trail-glow-layer';
export const SELECTED_TRAIL_BORDER_LAYER_ID = 'selected-trail-border-layer';
export const SELECTED_TRAIL_COLOR_LAYER_ID = 'selected-trail-color-layer';
export const SUGGESTED_TRAILS_SOURCE_ID = 'suggested-trails';
export const SUGGESTED_TRAILS_LAYER_ID = 'suggested-trails-layer';
export const SUGGESTED_TRAILS_HIT_LAYER_ID = 'suggested-trails-hit-layer';
export const TRAIL_SEGMENT_LABELS_SOURCE_ID = 'trail-segment-labels';
export const TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID = 'trail-segment-labels-glow-layer';
export const TRAIL_SEGMENT_LABELS_LAYER_ID = 'trail-segment-labels-layer';
export const TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID =
  'trail-segment-labels-planned-glow-layer';
export const TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID = 'trail-segment-labels-planned-layer';
export const ROUTE_PLAN_ANCHORS_SOURCE_ID = 'route-plan-anchors';
export const ROUTE_PLAN_ANCHORS_LAYER_ID = 'route-plan-anchors-layer';
export const ROUTE_PLAN_DIRECTIONS_SOURCE_ID = 'route-plan-directions';
export const ROUTE_PLAN_DIRECTIONS_LAYER_ID = 'route-plan-directions-layer';
export const DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM = 1.25;
export const MIN_SEGMENT_DISTANCE_KM = 0.05;
export const TRAIL_SEGMENT_LABELS_MIN_ZOOM = 13.5;
export const DEFAULT_TRAIL_COLOR_MODE = 'freshness';
export const MAP_SETTINGS_STORAGE_KEY = 'cc-maps:settings';
export const DESTINATION_SUGGESTION_DEBOUNCE_MS = 700;
export const SUGGESTED_DESTINATION_RADIUS_KM = 20;
export const MAX_NEARBY_DESTINATION_PREVIEWS = 3;
export const TRAILS_CACHE_TTL_MS = 15 * 60 * 1000;
export const TRAIL_HIT_LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 7, 12, 11, 18];
export const ACTIVE_TRAIL_OPACITY = 0.85;
export const PREVIEW_TRAIL_OPACITY = 0.45;
export const CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM = 0.05;
export const CURRENT_LOCATION_RECHECK_DISTANCE_KM = 0.02;
export const ROUTE_DIRECTION_CHANGE_THRESHOLD_KM = CURRENT_LOCATION_RECHECK_DISTANCE_KM;
export const GEOLOCATE_MAX_ZOOM = 13.5;

export const trailLegendItems: LegendItem[] = Object.entries(TRAIL_TYPE_STYLES)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => ({ code: Number(key), ...value }));

export const freshnessLegendItems: LegendItem[] = Object.entries(DESTINATION_PREP_STYLES)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => ({ code: Number(key), ...value }));

export const destinationPrepColorExpression = buildMatchExpression(
  'prepsymbol',
  DESTINATION_PREP_STYLES
);

type MatchExpression = any[];

type WinterPaintLayerType =
  | 'background'
  | 'fill'
  | 'fill-extrusion'
  | 'hillshade'
  | 'line'
  | 'symbol';

interface MapStyleLayer {
  id: string;
  type: string;
  layout?: {
    'text-field'?: string;
  };
}

const WINTER_PAINT_PROPERTIES_BY_LAYER_TYPE: Record<WinterPaintLayerType, string[]> = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-opacity'],
  'fill-extrusion': [],
  hillshade: [
    'hillshade-accent-color',
    'hillshade-highlight-color',
    'hillshade-shadow-color',
  ],
  line: ['line-color', 'line-opacity'],
  symbol: [],
};

interface MapSourceLike {
  setData?: (data: unknown) => void;
}

interface MapLike {
  addLayer: (layer: Record<string, unknown>, beforeId?: string) => void;
  addSource: (sourceId: string, source: Record<string, unknown>) => void;
  easeTo: (options: Record<string, unknown>) => void;
  fitBounds: (bounds: unknown, options: Record<string, unknown>) => void;
  flyTo: (options: Record<string, unknown>) => void;
  getLayer: (layerId: string) => MapStyleLayer | null;
  getSource: (sourceId: string) => MapSourceLike | null;
  getStyle: () => { layers?: MapStyleLayer[] };
  removeLayer: (layerId: string) => void;
  setFog: (fog: Record<string, unknown> | null) => void;
  setPaintProperty: (layerId: string, property: string, value: unknown) => void;
  setTerrain: (terrain: Record<string, unknown> | null) => void;
}

interface MapboxApiLike {
  LngLatBounds: new () => {
    extend: (coordinates: Coordinates) => void;
  };
}

function buildMatchExpression(propertyName, styles: StyleMap): MatchExpression {
  const expression: any[] = ['match', ['coalesce', ['to-number', ['get', propertyName]], -1]];

  Object.entries(styles).forEach(([key, value]) => {
    if (key === 'default') {
      return;
    }

    expression.push(Number(key), value.color);
  });

  expression.push(styles.default.color);

  return expression;
}

function extendBounds(bounds, coordinates) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend(coordinates);
    return;
  }

  coordinates.forEach((coordinateSet) => extendBounds(bounds, coordinateSet));
}

function getTrailFeatureCollectionKey(feature) {
  return JSON.stringify([
    feature?.properties?.destinationid || '',
    feature?.properties?.id || '',
    feature?.geometry?.type || '',
    feature?.geometry?.coordinates || [],
  ]);
}

export function getTrailFeatureCollectionSignature(
  geojson: TrailFeatureCollection | null | undefined
): string {
  const features = geojson?.features;

  if (!Array.isArray(features) || !features.length) {
    return '';
  }

  return features.map((feature) => getTrailFeatureCollectionKey(feature)).join('|');
}

function supportsPaintOverride(layer: MapStyleLayer, property: string) {
  return (
    layer.type in WINTER_PAINT_PROPERTIES_BY_LAYER_TYPE &&
    WINTER_PAINT_PROPERTIES_BY_LAYER_TYPE[
      layer.type as WinterPaintLayerType
    ]?.includes(property)
  ) || false;
}

function setLayerPaintIfPresent(map: MapLike, layerId: string, property: string, value: unknown) {
  const layer = map.getLayer(layerId);

  if (!layer || !supportsPaintOverride(layer, property)) {
    return;
  }

  try {
    map.setPaintProperty(layerId, property, value);
  } catch {
    // Some imported style layers expose runtime-only variants of standard layer
    // types. Skip unsupported overrides without polluting the console.
  }
}

export function ensureTerrainSource(map: MapLike) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }
}

export function getTrailColorExpression(colorMode: string): MatchExpression {
  if (colorMode === 'freshness') {
    return buildMatchExpression('prepsymbol', DESTINATION_PREP_STYLES as StyleMap);
  }

  return buildMatchExpression('trailtypesymbol', TRAIL_TYPE_STYLES as StyleMap);
}

export function getTrailOpacityExpression(activeTrailFeatureIds: string[]) {
  if (!activeTrailFeatureIds.length) {
    return ACTIVE_TRAIL_OPACITY;
  }

  return [
    'case',
    ['in', ['to-string', ['get', 'id']], ['literal', activeTrailFeatureIds]],
    ACTIVE_TRAIL_OPACITY,
    PREVIEW_TRAIL_OPACITY,
  ];
}

export function fitMapToGeoJson(
  mapboxApi: MapboxApiLike,
  map: MapLike,
  geojson: TrailFeatureCollection,
  fallbackCenter?: Coordinates
) {
  const bounds = new mapboxApi.LngLatBounds();
  let hasCoordinates = false;

  geojson.features.forEach((feature) => {
    if (!feature.geometry?.coordinates) {
      return;
    }

    extendBounds(bounds, feature.geometry.coordinates);
    hasCoordinates = true;
  });

  if (hasCoordinates) {
    map.fitBounds(bounds, { padding: 48, duration: 900, maxZoom: 12 });
    return;
  }

  if (fallbackCenter) {
    map.flyTo({ center: fallbackCenter, zoom: 11, duration: 900 });
  }
}

export function getFeatureCollectionGeoJson(features): TrailFeatureCollection {
  if (!Array.isArray(features) || !features.length) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export function mergeTrailFeatureCollections(collections): TrailFeatureCollection {
  const seenFeatureKeys = new Set();
  const mergedFeatures = [];

  collections.forEach((collection) => {
    (collection?.features || []).forEach((feature) => {
      const featureKey = getTrailFeatureCollectionKey(feature);

      if (seenFeatureKeys.has(featureKey)) {
        return;
      }

      seenFeatureKeys.add(featureKey);
      mergedFeatures.push(feature);
    });
  });

  return getFeatureCollectionGeoJson(mergedFeatures);
}

export function getUniqueDestinationIds(destinationIds): string[] {
  return [
    ...new Set((destinationIds || []).map((destinationId) => String(destinationId || '')).filter(Boolean)),
  ] as string[];
}

export function getRouteDestinationIds(routePlan: RoutePlan | null | undefined): string[] {
  if (!routePlan?.destinationId || !Array.isArray(routePlan?.anchorEdgeIds) || !routePlan.anchorEdgeIds.length) {
    return [];
  }

  return getUniqueDestinationIds(routePlan.destinationIds || [routePlan.destinationId]);
}

export function routeIncludesDestination(
  routePlan: Pick<RoutePlan, 'destinationId' | 'destinationIds'> | null | undefined,
  destinationId: string | null | undefined
) {
  const nextDestinationId = String(destinationId || '');

  if (!nextDestinationId) {
    return false;
  }

  return getUniqueDestinationIds(routePlan?.destinationIds || [routePlan?.destinationId]).includes(
    nextDestinationId
  );
}

export function resolveRoutePlanForDestination(
  selectedDestinationId: string | null | undefined,
  candidatePlans: Array<RoutePlan | null | undefined>
) {
  const nextDestinationId = String(selectedDestinationId || '');

  if (!nextDestinationId) {
    return null;
  }

  return (
    (candidatePlans || []).find(
      (candidatePlan) => candidatePlan && routeIncludesDestination(candidatePlan, nextDestinationId)
    ) || null
  );
}

export function getPreviewDestinationIds(destinationIds, excludedDestinationIds = []): string[] {
  const excludedDestinationIdSet = new Set(getUniqueDestinationIds(excludedDestinationIds));

  return getUniqueDestinationIds(destinationIds).filter(
    (destinationId) => !excludedDestinationIdSet.has(destinationId)
  );
}

export function filterTrailFeatureCollectionByDestinationIds(
  geojson: TrailFeatureCollection | null | undefined,
  destinationIds
): TrailFeatureCollection {
  const destinationIdSet = new Set(getUniqueDestinationIds(destinationIds));

  if (!destinationIdSet.size) {
    return getFeatureCollectionGeoJson([]);
  }

  return getFeatureCollectionGeoJson(
    (geojson?.features || []).filter((feature) =>
      destinationIdSet.has(String(feature?.properties?.destinationid || ''))
    )
  );
}

export function excludeTrailFeatureCollectionDestinationIds(
  geojson: TrailFeatureCollection,
  excludedDestinationIds
): TrailFeatureCollection {
  const excludedDestinationIdSet = new Set(getUniqueDestinationIds(excludedDestinationIds));

  if (!excludedDestinationIdSet.size) {
    return geojson;
  }

  return getFeatureCollectionGeoJson(
    (geojson?.features || []).filter(
      (feature) => !excludedDestinationIdSet.has(String(feature?.properties?.destinationid || ''))
    )
  );
}

export function resolvePersistedRoutePlanForDestination(
  routeQueryValue,
  destinationId,
  storageKey
) {
  const { routeFromUrl, routeFromStorage } = getPersistedRoutePlanSources(
    routeQueryValue,
    destinationId,
    storageKey
  );

  return {
    routeFromUrl,
    routeFromStorage,
    persistedRoutePlan: resolveRoutePlanForDestination(destinationId, [routeFromUrl, routeFromStorage]),
  };
}

export function applyWinterBasemap(map: MapLike) {
  const layers = map.getStyle().layers || [];

  layers.forEach((layer) => {
    const layerId = layer.id;

    if (layer.type === 'background') {
      setLayerPaintIfPresent(map, layerId, 'background-color', '#eef4f8');
    }

    if (layer.type === 'fill' && /(park|forest|wood|grass|landuse|nature|wetland)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', '#e7eff2');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', 0.85);
    }

    if (layer.type === 'fill' && /(snow|glacier|ice|water)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', layerId.includes('water') ? '#c8dced' : '#f7fbfe');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', layerId.includes('water') ? 0.9 : 0.95);
    }

    if (layer.type === 'line' && /(contour|terrain|hillshade)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#b7c6cf');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.45);
    }

    if (layer.type === 'line' && /(path|road|street|track)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#ffffff');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.5);
    }
  });

  const hillshadeLayer = map.getLayer('hillshade');

  if (hillshadeLayer?.type === 'hillshade') {
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-highlight-color', '#f8fbfd');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-shadow-color', '#b9cad5');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-accent-color', '#d9e6ee');
  }

  map.setFog({
    color: '#f5f8fb',
    'high-color': '#e5eef5',
    'horizon-blend': 0.04,
    'space-color': '#edf3f8',
    'star-intensity': 0,
  });
}

export function applyThreeDimensionalMode(map: MapLike, isEnabled: boolean) {
  ensureTerrainSource(map);

  if (isEnabled) {
    map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });
    map.setFog({
      color: '#f2f6fb',
      'high-color': '#d9e8f7',
      'horizon-blend': 0.05,
      'space-color': '#edf4fb',
      'star-intensity': 0,
    });

    if (!map.getLayer('3d-buildings')) {
      const labelLayer = map
        .getStyle()
        .layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field']);

      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', ['get', 'extrude'], 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#dbe7ef',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.45,
          },
        },
        labelLayer?.id
      );
    }

    return;
  }

  if (map.getLayer('3d-buildings')) {
    map.removeLayer('3d-buildings');
  }

  map.setTerrain(null);
  map.setFog(null);
  map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
}

export function preventOverlayDoubleClickZoom(event) {
  event.preventDefault?.();
  event.originalEvent?.preventDefault?.();
}

export function getEdgeMidpointCoordinates(edge): Coordinates | null {
  const coordinates = edge?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  return coordinates[Math.floor(coordinates.length / 2)] || coordinates[0] || null;
}

export function clampDistance(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}