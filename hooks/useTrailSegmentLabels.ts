import { useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
  MIN_SEGMENT_DISTANCE_KM,
  TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_LAYER_ID,
  TRAIL_SEGMENT_LABELS_MIN_ZOOM,
  TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID,
  TRAIL_SEGMENT_LABELS_SOURCE_ID,
  getTrailFeatureCollectionSignature,
} from '../lib/home-page';
import {
  getAllTrailSegments,
  getTrailSegmentLabelsGeoJsonForSegments,
} from '../lib/map-domain';
import { measureRoutePerf } from '../lib/route-perf';
import type { DestinationSummary, GeoBounds, TrailFeatureCollection } from '../types/geo';

const PLANNED_LABEL_FILTER = ['==', ['coalesce', ['get', 'isPlanned'], false], true] as const;
const NON_PLANNED_LABEL_FILTER = ['==', ['coalesce', ['get', 'isPlanned'], false], false] as const;
const BASE_LABEL_LAYOUT = {
  'text-field': ['get', 'label'],
  'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 13],
  'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
  'text-offset': [0, 0],
  'text-anchor': 'center',
  'text-padding': 2,
  'text-allow-overlap': false,
  'text-ignore-placement': false,
  'symbol-sort-key': ['*', -1, ['coalesce', ['get', 'distanceKm'], 0]],
  'symbol-placement': 'point',
} as const;
const BASE_GLOW_PAINT = {
  'text-color': 'rgba(0, 0, 0, 0)',
  'text-halo-color': 'rgba(250, 252, 250, 0.98)',
  'text-halo-width': 4,
  'text-halo-blur': 2,
} as const;
const BASE_LABEL_PAINT = {
  'text-color': '#173127',
  'text-halo-color': 'rgba(250, 252, 250, 0.98)',
  'text-halo-width': 2.75,
  'text-halo-blur': 1,
} as const;
const TRAIL_SEGMENT_CACHE_LIMIT = 6;
const trailSegmentSourceCache = new Map<string, ReturnType<typeof getAllTrailSegments>>();

function rememberTrailSegments(
  signature: string,
  segments: ReturnType<typeof getAllTrailSegments>
) {
  trailSegmentSourceCache.delete(signature);
  trailSegmentSourceCache.set(signature, segments);

  if (trailSegmentSourceCache.size <= TRAIL_SEGMENT_CACHE_LIMIT) {
    return segments;
  }

  const oldestKey = trailSegmentSourceCache.keys().next().value;

  if (oldestKey) {
    trailSegmentSourceCache.delete(oldestKey);
  }

  return segments;
}

interface UseTrailSegmentLabelsArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  trailsGeoJson: TrailFeatureCollection | null;
  destinations: DestinationSummary[];
  activeTraversalGeoJson: TrailFeatureCollection | null;
}

export function useTrailSegmentLabels({
  mapReady,
  mapRef,
  trailsGeoJson,
  destinations,
  activeTraversalGeoJson,
}: UseTrailSegmentLabelsArgs) {
  const [viewportBounds, setViewportBounds] = useState<GeoBounds | null>(null);
  const trailCollectionSignature = useMemo(
    () => getTrailFeatureCollectionSignature(trailsGeoJson),
    [trailsGeoJson]
  );
  const destinationSignature = useMemo(
    () =>
      destinations
        .map((destination) =>
          [destination.id, destination.coordinates[0], destination.coordinates[1]].join(':')
        )
        .join('|'),
    [destinations]
  );
  const trailSegmentCacheKey = trailCollectionSignature
    ? `${trailCollectionSignature}::${destinationSignature}`
    : '';

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const updateViewportBounds = () => {
      const bounds = map.getBounds?.();

      if (!bounds) {
        return;
      }

      setViewportBounds({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    };

    updateViewportBounds();
    map.on('moveend', updateViewportBounds);

    return () => {
      map.off?.('moveend', updateViewportBounds);
    };
  }, [mapReady, mapRef]);

  const allSegments = useMemo(
    () => {
      if (!trailSegmentCacheKey) {
        return [];
      }

      const cachedSegments = trailSegmentSourceCache.get(trailSegmentCacheKey);

      if (cachedSegments) {
        return cachedSegments;
      }

      return rememberTrailSegments(
        trailSegmentCacheKey,
        measureRoutePerf('trail segment labels source', () =>
          getAllTrailSegments(
            trailsGeoJson,
            destinations,
            DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
            MIN_SEGMENT_DISTANCE_KM
          )
        )
      );
    },
    [destinations, trailSegmentCacheKey, trailsGeoJson]
  );

  const labelsGeoJson = useMemo(
    () => {
      if (mapReady && viewportBounds === null) {
        return {
          type: 'FeatureCollection',
          features: [],
        } as const;
      }

      return measureRoutePerf('trail segment labels', () =>
        getTrailSegmentLabelsGeoJsonForSegments(
          allSegments,
          activeTraversalGeoJson,
          viewportBounds
        )
      );
    },
    [activeTraversalGeoJson, allSegments, mapReady, viewportBounds]
  );

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    if (!map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID)) {
      map.addSource(TRAIL_SEGMENT_LABELS_SOURCE_ID, {
        type: 'geojson',
        data: labelsGeoJson,
      });
    }

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        filter: NON_PLANNED_LABEL_FILTER,
        layout: BASE_LABEL_LAYOUT,
        paint: BASE_GLOW_PAINT,
      });
    }

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        filter: NON_PLANNED_LABEL_FILTER,
        layout: BASE_LABEL_LAYOUT,
        paint: BASE_LABEL_PAINT,
      });
    }

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        filter: PLANNED_LABEL_FILTER,
        layout: BASE_LABEL_LAYOUT,
        paint: BASE_GLOW_PAINT,
      });
    }

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        filter: PLANNED_LABEL_FILTER,
        layout: BASE_LABEL_LAYOUT,
        paint: BASE_LABEL_PAINT,
      });
    }

    return undefined;
  }, [labelsGeoJson, mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const labelSource = map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID);

    if (labelSource?.setData) {
      labelSource.setData(labelsGeoJson);
    }

    return undefined;
  }, [labelsGeoJson, mapReady, mapRef]);
}