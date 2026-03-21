import { useEffect, type MutableRefObject } from 'react';
import {
  DESTINATIONS_LAYER_ID,
  DESTINATIONS_SOURCE_ID,
  SUGGESTED_DESTINATION_DOT_LAYER_ID,
  SUGGESTED_DESTINATION_LABEL_LAYER_ID,
  SUGGESTED_DESTINATION_RING_LAYER_ID,
  SUGGESTED_DESTINATION_SOURCE_ID,
  destinationPrepColorExpression,
} from '../lib/home-page';
import { getSuggestedDestinationGeoJson } from '../lib/map-domain';
import type { DestinationFeatureCollection, DestinationSummary, TrailFeatureCollection } from '../types/geo';

interface UseDestinationLayersArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  destinationsGeoJson: DestinationFeatureCollection | null;
  nearbyDestinations: DestinationSummary[];
  updateSelectedDestinationRef: MutableRefObject<
    (
      destinationId: string,
      options?: { manual?: boolean; prefetchedTrailsGeoJson?: TrailFeatureCollection | null }
    ) => void
  >;
}

export function useDestinationLayers({
  mapReady,
  mapRef,
  destinationsGeoJson,
  nearbyDestinations,
  updateSelectedDestinationRef,
}: UseDestinationLayersArgs) {
  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !destinationsGeoJson) {
      return undefined;
    }

    if (map.getSource(DESTINATIONS_SOURCE_ID)) {
      map.getSource(DESTINATIONS_SOURCE_ID).setData(destinationsGeoJson);
      return undefined;
    }

    map.addSource(DESTINATIONS_SOURCE_ID, {
      type: 'geojson',
      data: destinationsGeoJson,
    });

    map.addLayer({
      id: DESTINATIONS_LAYER_ID,
      type: 'circle',
      source: DESTINATIONS_SOURCE_ID,
      paint: {
        'circle-color': destinationPrepColorExpression,
        'circle-radius': 6,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    const handleDestinationClick = (event: any) => {
      const feature = event.features?.[0];

      if (!feature?.properties?.id) {
        return;
      }

      updateSelectedDestinationRef.current(String(feature.properties.id), { manual: true });
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
    map.on('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);

    return () => {
      if (!map.getLayer(DESTINATIONS_LAYER_ID)) {
        return;
      }

      map.off('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
      map.off('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);
    };
  }, [destinationsGeoJson, mapReady, mapRef, updateSelectedDestinationRef]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const suggestedGeoJson = getSuggestedDestinationGeoJson(nearbyDestinations);

    if (map.getSource(SUGGESTED_DESTINATION_SOURCE_ID)) {
      map.getSource(SUGGESTED_DESTINATION_SOURCE_ID).setData(suggestedGeoJson);
    } else {
      map.addSource(SUGGESTED_DESTINATION_SOURCE_ID, {
        type: 'geojson',
        data: suggestedGeoJson,
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_RING_LAYER_ID,
        type: 'circle',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        paint: {
          'circle-radius': 13,
          'circle-color': 'rgba(31, 127, 89, 0.12)',
          'circle-stroke-color': '#1f7f59',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_DOT_LAYER_ID,
        type: 'circle',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#1f7f59',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_LABEL_LAYER_ID,
        type: 'symbol',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#173127',
          'text-halo-color': 'rgba(250, 252, 250, 0.98)',
          'text-halo-width': 2,
        },
      });
    }

    if (map.getLayer(SUGGESTED_DESTINATION_RING_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_RING_LAYER_ID);
    }

    if (map.getLayer(SUGGESTED_DESTINATION_DOT_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_DOT_LAYER_ID);
    }

    if (map.getLayer(SUGGESTED_DESTINATION_LABEL_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_LABEL_LAYER_ID);
    }

    return undefined;
  }, [mapReady, mapRef, nearbyDestinations]);
}