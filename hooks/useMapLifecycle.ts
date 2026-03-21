import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import mapboxgl from 'mapbox-gl';
import mapboxglMock from '../lib/mapbox-gl-mock';
import { getLoadPerfTimestamp, logLoadPerf, logLoadPerfSince } from '../lib/load-perf';
import {
  DEFAULT_CENTER,
  GEOLOCATE_MAX_ZOOM,
  WINTER_STYLE_URL,
  applyThreeDimensionalMode,
  applyWinterBasemap,
  ensureTerrainSource,
} from '../lib/home-page';
import type { MapView } from '../types/geo';

const isMapboxMockEnabled = process.env.NEXT_PUBLIC_ENABLE_MAPBOX_MOCK === '1';

export const mapboxApi: any = isMapboxMockEnabled ? mapboxglMock : mapboxgl;

interface UseMapLifecycleArgs {
  mapContainer: MutableRefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<any>;
  geolocateControlRef: MutableRefObject<any>;
  routerReady: boolean;
  mapView: MapView | null;
  shouldPreserveMapViewRef: MutableRefObject<boolean>;
  skipNextTrailFitRef: MutableRefObject<boolean>;
  pendingRouteViewportFitRef: MutableRefObject<string>;
  setMapView: Dispatch<SetStateAction<MapView | null>>;
}

export function useMapLifecycle({
  mapContainer,
  mapRef,
  geolocateControlRef,
  routerReady,
  mapView,
  shouldPreserveMapViewRef,
  skipNextTrailFitRef,
  pendingRouteViewportFitRef,
  setMapView,
}: UseMapLifecycleArgs) {
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isInitialMapViewSettled, setIsInitialMapViewSettled] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const mapBootstrapStartedAtRef = useState(() => getLoadPerfTimestamp())[0];

  useEffect(() => {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!accessToken && !isMapboxMockEnabled) {
      setMapError('Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to load the map.');
      return undefined;
    }

    if (!isMapboxMockEnabled) {
      mapboxApi.accessToken = accessToken;
    }

    logLoadPerf('map bootstrap started');

    const map = new mapboxApi.Map({
      container: mapContainer.current,
      style: WINTER_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 7,
    });

    mapRef.current = map;

    map.addControl(new mapboxApi.NavigationControl(), 'top-right');
    geolocateControlRef.current = new mapboxApi.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
    });

    map.addControl(geolocateControlRef.current, 'top-right');

    map.on('load', () => {
      try {
        applyWinterBasemap(map);
        ensureTerrainSource(map);
      } catch (error) {
        console.error('Failed to apply winter basemap styling', error);
      }

      logLoadPerfSince('mapbox load event', mapBootstrapStartedAtRef);

      setIsMapLoaded(true);
    });

    map.on('error', (event) => {
      if (event?.error?.message) {
        setMapError(event.error.message);
      }
    });

    map.on('moveend', () => {
      const center = map.getCenter();

      setMapView({
        longitude: Number(center.lng.toFixed(5)),
        latitude: Number(center.lat.toFixed(5)),
        zoom: Number(map.getZoom().toFixed(2)),
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [geolocateControlRef, mapContainer, mapRef, setMapView]);

  useEffect(() => {
    const map = mapRef.current;

    if (!routerReady || !isMapLoaded || !map || isInitialMapViewSettled) {
      return;
    }

    if (shouldPreserveMapViewRef.current && !mapView) {
      return;
    }

    if (shouldPreserveMapViewRef.current && mapView) {
      map.jumpTo({
        center: [mapView.longitude, mapView.latitude],
        zoom: mapView.zoom,
      });

      skipNextTrailFitRef.current = true;
      pendingRouteViewportFitRef.current = '';
      shouldPreserveMapViewRef.current = false;
    }

    setIsInitialMapViewSettled(true);
    setMapReady(true);
    logLoadPerfSince('initial map view settled', mapBootstrapStartedAtRef);
  }, [
    isInitialMapViewSettled,
    isMapLoaded,
    mapRef,
    mapView,
    pendingRouteViewportFitRef,
    routerReady,
    shouldPreserveMapViewRef,
    skipNextTrailFitRef,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    applyThreeDimensionalMode(map, true);
  }, [mapReady, mapRef]);

  return {
    isInitialMapViewSettled,
    mapError,
    mapReady,
  };
}