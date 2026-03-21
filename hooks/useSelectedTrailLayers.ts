import { useEffect, type MutableRefObject } from 'react';
import {
  SELECTED_TRAIL_BORDER_LAYER_ID,
  SELECTED_TRAIL_COLOR_LAYER_ID,
  SELECTED_TRAIL_GLOW_LAYER_ID,
  SELECTED_TRAIL_SOURCE_ID,
  TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_LAYER_ID,
  TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID,
  getFeatureCollectionGeoJson,
  getTrailColorExpression,
  preventOverlayDoubleClickZoom,
} from '../lib/home-page';
import type { TrailFeature } from '../types/geo';

interface UseSelectedTrailLayersArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  selectedTrailSectionFeature: TrailFeature | null;
  trailColorMode: string;
}

export function useSelectedTrailLayers({
  mapReady,
  mapRef,
  selectedTrailSectionFeature,
  trailColorMode,
}: UseSelectedTrailLayersArgs) {
  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const selectedTrailGeoJson = getFeatureCollectionGeoJson(
      selectedTrailSectionFeature ? [selectedTrailSectionFeature] : []
    );

    if (map.getSource(SELECTED_TRAIL_SOURCE_ID)) {
      map.getSource(SELECTED_TRAIL_SOURCE_ID).setData(selectedTrailGeoJson);

      if (map.getLayer(SELECTED_TRAIL_COLOR_LAYER_ID)) {
        map.setPaintProperty(
          SELECTED_TRAIL_COLOR_LAYER_ID,
          'line-color',
          getTrailColorExpression(trailColorMode)
        );
      }
    } else {
      map.addSource(SELECTED_TRAIL_SOURCE_ID, {
        type: 'geojson',
        data: selectedTrailGeoJson,
      });

      map.addLayer({
        id: SELECTED_TRAIL_GLOW_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': 'rgba(246, 252, 255, 0.95)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 6, 11, 11],
          'line-opacity': 0.9,
          'line-blur': 0.8,
        },
      });

      map.addLayer({
        id: SELECTED_TRAIL_BORDER_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#173127',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 11, 6],
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: SELECTED_TRAIL_COLOR_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': getTrailColorExpression(trailColorMode),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
          'line-opacity': 1,
        },
      });

      map.on('dblclick', SELECTED_TRAIL_GLOW_LAYER_ID, preventOverlayDoubleClickZoom);
      map.on('dblclick', SELECTED_TRAIL_BORDER_LAYER_ID, preventOverlayDoubleClickZoom);
      map.on('dblclick', SELECTED_TRAIL_COLOR_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getLayer(SELECTED_TRAIL_GLOW_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_GLOW_LAYER_ID);
    }

    if (map.getLayer(SELECTED_TRAIL_BORDER_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_BORDER_LAYER_ID);
    }

    if (map.getLayer(SELECTED_TRAIL_COLOR_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_COLOR_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_PLANNED_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_PLANNED_LAYER_ID);
    }

    return undefined;
  }, [mapReady, mapRef, selectedTrailSectionFeature, trailColorMode]);
}