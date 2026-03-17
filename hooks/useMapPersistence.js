import { useEffect } from 'react';
import {
  getMapViewFromValues,
  getSingleQueryValue,
  isTrailColorMode,
  persistMapSettings,
  readStoredMapSettings,
} from '../lib/map-persistence';

export function useMapPersistence({
  router,
  storageKey,
  defaultTrailColorMode,
  hasInitializedFromUrlRef,
  hasManualDestinationSelectionRef,
  hasAutoSelectedDestinationRef,
  shouldPreserveMapViewRef,
  selectedDestinationId,
  trailColorMode,
  mapView,
  setSelectedDestinationId,
  setTrailColorMode,
  setMapView,
}) {
  useEffect(() => {
    if (!router.isReady || hasInitializedFromUrlRef.current) {
      return;
    }

    const storedSettings = readStoredMapSettings(storageKey);
    const destinationFromUrl = getSingleQueryValue(router.query.destination);
    const colorModeFromUrl = getSingleQueryValue(router.query.colors);
    const longitudeFromUrl = getSingleQueryValue(router.query.lng);
    const latitudeFromUrl = getSingleQueryValue(router.query.lat);
    const zoomFromUrl = getSingleQueryValue(router.query.zoom);
    const destinationFromStorage = getSingleQueryValue(storedSettings?.destination);
    const colorModeFromStorage = getSingleQueryValue(storedSettings?.colors);
    const mapViewFromUrl = getMapViewFromValues(longitudeFromUrl, latitudeFromUrl, zoomFromUrl);
    const mapViewFromStorage = getMapViewFromValues(
      storedSettings?.lng,
      storedSettings?.lat,
      storedSettings?.zoom
    );

    const initialDestination = destinationFromUrl || destinationFromStorage;
    const initialColorMode = colorModeFromUrl || colorModeFromStorage;
    const initialMapView = mapViewFromUrl || mapViewFromStorage;

    if (typeof initialDestination === 'string' && /^\d+$/.test(initialDestination)) {
      hasManualDestinationSelectionRef.current = true;
      hasAutoSelectedDestinationRef.current = true;
      setSelectedDestinationId(initialDestination);
    }

    if (isTrailColorMode(initialColorMode)) {
      setTrailColorMode(initialColorMode);
    }

    if (initialMapView) {
      shouldPreserveMapViewRef.current = true;
      setMapView(initialMapView);
    }

    hasInitializedFromUrlRef.current = true;
  }, [
    hasAutoSelectedDestinationRef,
    hasInitializedFromUrlRef,
    hasManualDestinationSelectionRef,
    router.isReady,
    router.query.colors,
    router.query.destination,
    router.query.lat,
    router.query.lng,
    router.query.zoom,
    setMapView,
    setSelectedDestinationId,
    setTrailColorMode,
    shouldPreserveMapViewRef,
    storageKey,
  ]);

  useEffect(() => {
    if (
      !router.isReady ||
      !hasInitializedFromUrlRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const nextUrl = new URL(window.location.href);
  const currentQuery = Object.fromEntries(nextUrl.searchParams.entries());
    const nextQuery = Object.fromEntries(nextUrl.searchParams.entries());

    if (selectedDestinationId) {
      nextQuery.destination = selectedDestinationId;
    } else {
      delete nextQuery.destination;
    }

    if (trailColorMode !== defaultTrailColorMode) {
      nextQuery.colors = trailColorMode;
    } else {
      delete nextQuery.colors;
    }

    if (mapView) {
      nextQuery.lng = mapView.longitude.toFixed(5);
      nextQuery.lat = mapView.latitude.toFixed(5);
      nextQuery.zoom = mapView.zoom.toFixed(2);
    } else {
      delete nextQuery.lng;
      delete nextQuery.lat;
      delete nextQuery.zoom;
    }

    const currentDestination = getSingleQueryValue(currentQuery.destination) || '';
    const currentColors = getSingleQueryValue(currentQuery.colors) || '';
    const currentLongitude = getSingleQueryValue(currentQuery.lng) || '';
    const currentLatitude = getSingleQueryValue(currentQuery.lat) || '';
    const currentZoom = getSingleQueryValue(currentQuery.zoom) || '';
    const nextDestination = getSingleQueryValue(nextQuery.destination) || '';
    const nextColors = getSingleQueryValue(nextQuery.colors) || '';
    const nextLongitude = getSingleQueryValue(nextQuery.lng) || '';
    const nextLatitude = getSingleQueryValue(nextQuery.lat) || '';
    const nextZoom = getSingleQueryValue(nextQuery.zoom) || '';

    if (
      currentDestination === nextDestination &&
      currentColors === nextColors &&
      currentLongitude === nextLongitude &&
      currentLatitude === nextLatitude &&
      currentZoom === nextZoom
    ) {
      return;
    }

    Object.entries(nextQuery).forEach(([key, value]) => {
      nextUrl.searchParams.set(key, String(value));
    });

    ['destination', 'colors', 'lng', 'lat', 'zoom'].forEach((key) => {
      if (!(key in nextQuery)) {
        nextUrl.searchParams.delete(key);
      }
    });

    window.history.replaceState(window.history.state, '', nextUrl);
  }, [
    defaultTrailColorMode,
    hasInitializedFromUrlRef,
    mapView,
    router,
    selectedDestinationId,
    trailColorMode,
  ]);

  useEffect(() => {
    if (!hasInitializedFromUrlRef.current) {
      return;
    }

    persistMapSettings(storageKey, {
      destination: selectedDestinationId || '',
      colors: trailColorMode,
      lng: mapView?.longitude?.toFixed(5) || '',
      lat: mapView?.latitude?.toFixed(5) || '',
      zoom: mapView?.zoom?.toFixed(2) || '',
    });
  }, [
    hasInitializedFromUrlRef,
    mapView,
    selectedDestinationId,
    storageKey,
    trailColorMode,
  ]);
}