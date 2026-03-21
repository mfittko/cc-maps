import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  DEFAULT_CENTER,
  ROUTE_PLAN_ANCHORS_LAYER_ID,
  ROUTE_PLAN_ANCHORS_SOURCE_ID,
  ROUTE_PLAN_DIRECTIONS_LAYER_ID,
  ROUTE_PLAN_DIRECTIONS_SOURCE_ID,
  TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
  TRAIL_SEGMENT_LABELS_LAYER_ID,
  fitMapToGeoJson,
  preventOverlayDoubleClickZoom,
} from '../lib/home-page';
import { encodeRoutePlanToUrl } from '../lib/route-plan';
import type { DestinationSummary, ElevationMetrics } from '../types/geo';
import type { RouteGraph, RoutePlan, RoutePlanGeoJson } from '../types/route';

interface UseRoutePlanMapArgs {
  mapReady: boolean;
  mapRef: MutableRefObject<any>;
  mapboxApi: any;
  routePlan: RoutePlan | null;
  routePlanGeoJson: RoutePlanGeoJson;
  pendingRouteViewportFitRef: MutableRefObject<string>;
  selectedDestinationId: string;
  selectedDestination: DestinationSummary | null;
  setRouteElevationMetrics: Dispatch<SetStateAction<ElevationMetrics | null>>;
  setRouteAnchorElevationMetrics: Dispatch<SetStateAction<Array<ElevationMetrics | null>>>;
}

interface ElevationApiResponse {
  route?: {
    status?: string;
    metrics?: ElevationMetrics | null;
  };
  sections?: Array<{
    status?: string;
    metrics?: ElevationMetrics | null;
  }>;
}

export function useRoutePlanMap({
  mapReady,
  mapRef,
  mapboxApi,
  routePlan,
  routePlanGeoJson,
  pendingRouteViewportFitRef,
  selectedDestinationId,
  selectedDestination,
  setRouteElevationMetrics,
  setRouteAnchorElevationMetrics,
}: UseRoutePlanMapArgs) {
  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    if (map.getSource(ROUTE_PLAN_ANCHORS_SOURCE_ID)) {
      map.getSource(ROUTE_PLAN_ANCHORS_SOURCE_ID).setData(routePlanGeoJson.anchors);
    } else {
      map.addSource(ROUTE_PLAN_ANCHORS_SOURCE_ID, {
        type: 'geojson',
        data: routePlanGeoJson.anchors,
      });

      map.addLayer({
        id: ROUTE_PLAN_ANCHORS_LAYER_ID,
        type: 'line',
        source: ROUTE_PLAN_ANCHORS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#1f5fa8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 11, 6],
          'line-opacity': 0.95,
        },
      });

      map.on('dblclick', ROUTE_PLAN_ANCHORS_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID)) {
      map.getSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID).setData(routePlanGeoJson.directions);
    } else {
      map.addSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID, {
        type: 'geojson',
        data: routePlanGeoJson.directions,
      });

      map.addLayer({
        id: ROUTE_PLAN_DIRECTIONS_LAYER_ID,
        type: 'symbol',
        source: ROUTE_PLAN_DIRECTIONS_SOURCE_ID,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 120,
          'text-field': '▶',
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 11, 14],
          'text-keep-upright': false,
          'symbol-z-order': 'source',
        },
        paint: {
          'text-color': '#123f74',
          'text-halo-color': '#f7fbff',
          'text-halo-width': 1.5,
          'text-opacity': 0.9,
        },
      });

      map.on('dblclick', ROUTE_PLAN_DIRECTIONS_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getLayer(ROUTE_PLAN_ANCHORS_LAYER_ID)) {
      map.moveLayer(ROUTE_PLAN_ANCHORS_LAYER_ID);
    }

    if (map.getLayer(ROUTE_PLAN_DIRECTIONS_LAYER_ID)) {
      map.moveLayer(ROUTE_PLAN_DIRECTIONS_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return undefined;
  }, [mapReady, mapRef, routePlanGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !routePlan) {
      return;
    }

    const encodedRoutePlan = encodeRoutePlanToUrl(routePlan);

    if (!encodedRoutePlan || pendingRouteViewportFitRef.current !== encodedRoutePlan) {
      return;
    }

    if (!routePlanGeoJson.anchors.features.length) {
      return;
    }

    fitMapToGeoJson(
      mapboxApi,
      map,
      {
        type: 'FeatureCollection',
        features: routePlanGeoJson.anchors.features,
      } as any,
      selectedDestination?.coordinates || DEFAULT_CENTER
    );
    pendingRouteViewportFitRef.current = '';
  }, [
    mapReady,
    mapRef,
    mapboxApi,
    pendingRouteViewportFitRef,
    routePlan,
    selectedDestination,
    routePlanGeoJson,
  ]);

  useEffect(() => {
    const routeFeatures = routePlanGeoJson.traversal.features;
    const routeAnchorFeatures = routeFeatures.filter(
      (feature) => feature.properties?.role === 'traversal-anchor'
    );

    if (!routeFeatures.length || !selectedDestinationId) {
      setRouteElevationMetrics(null);
      setRouteAnchorElevationMetrics([]);
      return undefined;
    }

    let isCancelled = false;

    fetch('/api/elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationId: selectedDestinationId,
        routeTraversal: routeFeatures.map((feature) => feature.geometry),
        routeSections: routeAnchorFeatures.map((feature) => ({
          sectionKey: String(feature.properties?.index ?? 0),
          geometry: feature.geometry,
        })),
      }),
    })
      .then((res) => res.json() as Promise<ElevationApiResponse>)
      .then((data) => {
        if (isCancelled) {
          return;
        }

        setRouteElevationMetrics(data.route?.status === 'ok' ? data.route.metrics || null : null);
        setRouteAnchorElevationMetrics(
          (data.sections || []).map((section) =>
            section.status === 'ok' ? section.metrics || null : null
          )
        );
      })
      .catch((error) => {
        if (!isCancelled) {
          console.warn('Skipped route ascent/descent calculation', error);
          setRouteElevationMetrics(null);
          setRouteAnchorElevationMetrics([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [routePlanGeoJson, selectedDestinationId, setRouteAnchorElevationMetrics, setRouteElevationMetrics]);
}