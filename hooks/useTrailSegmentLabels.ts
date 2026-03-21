import { useEffect, type MutableRefObject } from 'react';
import {
  DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
  MIN_SEGMENT_DISTANCE_KM,
  TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_LAYER_ID,
  TRAIL_SEGMENT_LABELS_MIN_ZOOM,
  TRAIL_SEGMENT_LABELS_SOURCE_ID,
} from '../lib/home-page';
import { getAllTrailSegmentLabelsGeoJson } from '../lib/map-domain';
import type { DestinationSummary, TrailFeatureCollection } from '../types/geo';
import type { RoutePlan } from '../types/route';

interface UseTrailSegmentLabelsArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  trailsGeoJson: TrailFeatureCollection | null;
  destinations: DestinationSummary[];
  isPlanning: boolean;
  routePlan: RoutePlan | null;
  routeTraversalGeoJson: TrailFeatureCollection;
}

export function useTrailSegmentLabels({
  mapReady,
  mapRef,
  trailsGeoJson,
  destinations,
  isPlanning,
  routePlan,
  routeTraversalGeoJson,
}: UseTrailSegmentLabelsArgs) {
  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const activeTraversalGeoJson =
      !isPlanning && routePlan?.anchorEdgeIds?.length ? routeTraversalGeoJson : null;

    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(
      trailsGeoJson,
      destinations,
      DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
      MIN_SEGMENT_DISTANCE_KM,
      activeTraversalGeoJson
    );

    if (map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID)) {
      map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID).setData(labelsGeoJson);
    } else {
      map.addSource(TRAIL_SEGMENT_LABELS_SOURCE_ID, {
        type: 'geojson',
        data: labelsGeoJson,
      });
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.removeLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    map.addLayer({
      id: TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
      type: 'symbol',
      source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
      minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
      layout: {
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
      },
      paint: {
        'text-color': 'rgba(0, 0, 0, 0)',
        'text-halo-color': 'rgba(250, 252, 250, 0.98)',
        'text-halo-width': 4,
        'text-halo-blur': 2,
      },
    });

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        layout: {
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
        },
        paint: {
          'text-color': '#173127',
          'text-halo-color': 'rgba(250, 252, 250, 0.98)',
          'text-halo-width': 2.75,
          'text-halo-blur': 1,
        },
      });
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return undefined;
  }, [destinations, isPlanning, mapReady, mapRef, routePlan, routeTraversalGeoJson, trailsGeoJson]);
}