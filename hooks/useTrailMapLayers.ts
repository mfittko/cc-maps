import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import {
  ACTIVE_TRAIL_OPACITY,
  DEFAULT_CENTER,
  MAP_SETTINGS_STORAGE_KEY,
  PREVIEW_TRAIL_OPACITY,
  SUGGESTED_TRAILS_HIT_LAYER_ID,
  SUGGESTED_TRAILS_LAYER_ID,
  SUGGESTED_TRAILS_SOURCE_ID,
  TRAILS_CACHE_TTL_MS,
  TRAILS_HIT_LAYER_ID,
  TRAILS_LAYER_ID,
  TRAILS_SOURCE_ID,
  TRAIL_HIT_LINE_WIDTH,
  filterTrailFeatureCollectionByDestinationIds,
  fitMapToGeoJson,
  getTrailColorExpression,
  getTrailOpacityExpression,
} from '../lib/home-page';
import { isPlanningSelectionInteraction } from '../lib/planning-mode';
import { readCachedTrailGeoJson } from '../lib/map-persistence';
import type { Coordinates, TrailFeature, TrailFeatureCollection } from '../types/geo';
import type { RoutePlan } from '../types/route';

interface UseTrailMapLayersArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  mapboxApi: any;
  selectedDestinationId: string;
  trailsGeoJson: TrailFeatureCollection | null;
  suggestedTrailsGeoJson: TrailFeatureCollection | null;
  trailColorMode: string;
  trailColorModeRef: MutableRefObject<string>;
  routeTraversalGeoJson: TrailFeatureCollection;
  isPlanning: boolean;
  routePlan: RoutePlan | null;
  skipNextTrailFitRef: MutableRefObject<boolean>;
  isPlanningRef: MutableRefObject<boolean>;
  isMobileInteractionRef: MutableRefObject<boolean>;
  isMacOSRef: MutableRefObject<boolean>;
  selectedTrailFeatureRef: MutableRefObject<TrailFeature | null>;
  clearSelectedTrailRef: MutableRefObject<() => void>;
  handlePlanningAnchorSelectionRef: MutableRefObject<
    (feature: TrailFeature | null, clickedCoordinates: Coordinates | null) => boolean
  >;
  updateSelectedDestinationRef: MutableRefObject<
    (
      destinationId: string,
      options?: { manual?: boolean; prefetchedTrailsGeoJson?: TrailFeatureCollection | null }
    ) => void
  >;
  setIsSettingsPanelOpen: Dispatch<SetStateAction<boolean>>;
  setIsInfoPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedTrailFeature: Dispatch<SetStateAction<TrailFeature | null>>;
  setSelectedTrailClickCoordinates: Dispatch<SetStateAction<Coordinates | null>>;
}

export function useTrailMapLayers({
  mapReady,
  mapRef,
  mapboxApi,
  selectedDestinationId,
  trailsGeoJson,
  suggestedTrailsGeoJson,
  trailColorMode,
  trailColorModeRef,
  routeTraversalGeoJson,
  isPlanning,
  routePlan,
  skipNextTrailFitRef,
  isPlanningRef,
  isMobileInteractionRef,
  isMacOSRef,
  selectedTrailFeatureRef,
  clearSelectedTrailRef,
  handlePlanningAnchorSelectionRef,
  updateSelectedDestinationRef,
  setIsSettingsPanelOpen,
  setIsInfoPanelOpen,
  setSelectedTrailFeature,
  setSelectedTrailClickCoordinates,
}: UseTrailMapLayersArgs) {
  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !trailsGeoJson) {
      return undefined;
    }

    if (map.getSource(TRAILS_SOURCE_ID)) {
      map.getSource(TRAILS_SOURCE_ID).setData(trailsGeoJson);
    } else {
      map.addSource(TRAILS_SOURCE_ID, {
        type: 'geojson',
        data: trailsGeoJson,
      });

      map.addLayer({
        id: TRAILS_LAYER_ID,
        type: 'line',
        source: TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': getTrailColorExpression(trailColorModeRef.current),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
          'line-opacity': ACTIVE_TRAIL_OPACITY,
        },
      });

      map.addLayer({
        id: TRAILS_HIT_LAYER_ID,
        type: 'line',
        source: TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': TRAIL_HIT_LINE_WIDTH,
          'line-opacity': 0,
        },
      });

      map.on('click', TRAILS_HIT_LAYER_ID, (event: any) => {
        const feature = (event.features?.[0] as TrailFeature | undefined) || null;

        if (!feature?.properties) {
          return;
        }

        const clickedCoordinates: Coordinates = [event.lngLat.lng, event.lngLat.lat];

        if (
          isPlanningSelectionInteraction({
            isPlanning: isPlanningRef.current,
            isMobileInteraction: isMobileInteractionRef.current,
            isMacOS: isMacOSRef.current,
            originalEvent: event.originalEvent,
          }) &&
          handlePlanningAnchorSelectionRef.current(feature, clickedCoordinates)
        ) {
          setIsSettingsPanelOpen(false);
          setIsInfoPanelOpen(false);
          return;
        }

        const isSameSelectedTrail =
          selectedTrailFeatureRef.current?.properties?.id != null &&
          String(selectedTrailFeatureRef.current.properties.id) === String(feature.properties.id);

        if (isSameSelectedTrail) {
          clearSelectedTrailRef.current();
          setIsSettingsPanelOpen(false);
          setIsInfoPanelOpen(false);
          return;
        }

        setIsSettingsPanelOpen(false);
        setIsInfoPanelOpen(false);
        setSelectedTrailFeature(feature);
        setSelectedTrailClickCoordinates(clickedCoordinates);
      });

      map.on('mouseenter', TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    const selectedDestinationGeoJson = selectedDestinationId
      ? filterTrailFeatureCollectionByDestinationIds(trailsGeoJson, [selectedDestinationId])
      : trailsGeoJson;
    const fitTargetGeoJson = selectedDestinationGeoJson.features.length
      ? selectedDestinationGeoJson
      : trailsGeoJson;

    if (skipNextTrailFitRef.current || isPlanningRef.current) {
      skipNextTrailFitRef.current = false;
    } else {
      fitMapToGeoJson(mapboxApi, map, fitTargetGeoJson, DEFAULT_CENTER);
    }

    return undefined;
  }, [
    clearSelectedTrailRef,
    handlePlanningAnchorSelectionRef,
    isMacOSRef,
    isMobileInteractionRef,
    isPlanningRef,
    mapReady,
    mapRef,
    mapboxApi,
    selectedDestinationId,
    selectedTrailFeatureRef,
    setIsInfoPanelOpen,
    setIsSettingsPanelOpen,
    setSelectedTrailClickCoordinates,
    setSelectedTrailFeature,
    skipNextTrailFitRef,
    trailColorModeRef,
    trailsGeoJson,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer(TRAILS_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(TRAILS_LAYER_ID, 'line-color', getTrailColorExpression(trailColorMode));
  }, [mapReady, mapRef, trailColorMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer(TRAILS_LAYER_ID)) {
      return;
    }

    const activeTrailFeatureIds =
      !isPlanning && routePlan?.anchorEdgeIds?.length
        ? [
            ...new Set(
              routeTraversalGeoJson.features
                .map((feature) => feature?.properties?.trailFeatureId)
                .filter((trailFeatureId) => trailFeatureId != null)
                .map(String)
            ),
          ]
        : [];

    map.setPaintProperty(
      TRAILS_LAYER_ID,
      'line-opacity',
      getTrailOpacityExpression(activeTrailFeatureIds)
    );
  }, [isPlanning, mapReady, mapRef, routePlan, routeTraversalGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const previewGeoJson = suggestedTrailsGeoJson || {
      type: 'FeatureCollection',
      features: [],
    };

    if (map.getSource(SUGGESTED_TRAILS_SOURCE_ID)) {
      map.getSource(SUGGESTED_TRAILS_SOURCE_ID).setData(previewGeoJson);
    } else {
      map.addSource(SUGGESTED_TRAILS_SOURCE_ID, {
        type: 'geojson',
        data: previewGeoJson,
      });

      const suggestedTrailsLayer = {
        id: SUGGESTED_TRAILS_LAYER_ID,
        type: 'line',
        source: SUGGESTED_TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': getTrailColorExpression(trailColorMode),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 11, 4],
          'line-opacity': PREVIEW_TRAIL_OPACITY,
          'line-dasharray': [1.2, 1],
        },
      };

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.addLayer(suggestedTrailsLayer, TRAILS_LAYER_ID);
      } else {
        map.addLayer(suggestedTrailsLayer);
      }

      const suggestedTrailsHitLayer = {
        id: SUGGESTED_TRAILS_HIT_LAYER_ID,
        type: 'line',
        source: SUGGESTED_TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': TRAIL_HIT_LINE_WIDTH,
          'line-opacity': 0,
        },
      };

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.addLayer(suggestedTrailsHitLayer, TRAILS_LAYER_ID);
      } else {
        map.addLayer(suggestedTrailsHitLayer);
      }

      map.on('click', SUGGESTED_TRAILS_HIT_LAYER_ID, (event: any) => {
        const feature = (event.features?.[0] as TrailFeature | undefined) || null;
        const clickedCoordinates: Coordinates = [event.lngLat.lng, event.lngLat.lat];

        if (
          isPlanningSelectionInteraction({
            isPlanning: isPlanningRef.current,
            isMobileInteraction: isMobileInteractionRef.current,
            isMacOS: isMacOSRef.current,
            originalEvent: event.originalEvent,
          }) &&
          handlePlanningAnchorSelectionRef.current(feature, clickedCoordinates)
        ) {
          setIsSettingsPanelOpen(false);
          setIsInfoPanelOpen(false);
          return;
        }

        const destinationId = feature?.properties?.destinationid;

        if (!destinationId) {
          return;
        }

        const prefetchedTrailsGeoJson = readCachedTrailGeoJson(
          String(destinationId),
          MAP_SETTINGS_STORAGE_KEY,
          TRAILS_CACHE_TTL_MS
        );

        skipNextTrailFitRef.current = true;
        setIsSettingsPanelOpen(false);
        setIsInfoPanelOpen(false);
        updateSelectedDestinationRef.current(String(destinationId), {
          manual: true,
          prefetchedTrailsGeoJson,
        });
      });

      map.on('mouseenter', SUGGESTED_TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', SUGGESTED_TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    if (map.getLayer(SUGGESTED_TRAILS_LAYER_ID)) {
      map.setPaintProperty(
        SUGGESTED_TRAILS_LAYER_ID,
        'line-color',
        getTrailColorExpression(trailColorMode)
      );

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.moveLayer(SUGGESTED_TRAILS_LAYER_ID, TRAILS_LAYER_ID);
      }

      if (map.getLayer(TRAILS_HIT_LAYER_ID)) {
        map.moveLayer(SUGGESTED_TRAILS_HIT_LAYER_ID, TRAILS_HIT_LAYER_ID);
      }
    }

    return undefined;
  }, [
    handlePlanningAnchorSelectionRef,
    isMacOSRef,
    isMobileInteractionRef,
    isPlanningRef,
    mapReady,
    mapRef,
    setIsInfoPanelOpen,
    setIsSettingsPanelOpen,
    skipNextTrailFitRef,
    suggestedTrailsGeoJson,
    trailColorMode,
    updateSelectedDestinationRef,
  ]);
}