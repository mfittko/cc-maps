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
  isThreeDimensional,
  mapView,
  setSelectedDestinationId,
  setTrailColorMode,
  setIsThreeDimensional,
  setMapView,
}) {
  useEffect(() => {
    if (!router.isReady || hasInitializedFromUrlRef.current) {
      return;
    }

    const storedSettings = readStoredMapSettings(storageKey);
    const destinationFromUrl = getSingleQueryValue(router.query.destination);
    const colorModeFromUrl = getSingleQueryValue(router.query.colors);
    const threeDimensionalFromUrl = getSingleQueryValue(router.query.terrain);
    const longitudeFromUrl = getSingleQueryValue(router.query.lng);
    const latitudeFromUrl = getSingleQueryValue(router.query.lat);
    const zoomFromUrl = getSingleQueryValue(router.query.zoom);
    const destinationFromStorage = getSingleQueryValue(storedSettings?.destination);
    const colorModeFromStorage = getSingleQueryValue(storedSettings?.colors);
    const threeDimensionalFromStorage = getSingleQueryValue(storedSettings?.terrain);
    const mapViewFromUrl = getMapViewFromValues(longitudeFromUrl, latitudeFromUrl, zoomFromUrl);
    const mapViewFromStorage = getMapViewFromValues(
      storedSettings?.lng,
      storedSettings?.lat,
      storedSettings?.zoom
    );

    const initialDestination = destinationFromUrl || destinationFromStorage;
    const initialColorMode = colorModeFromUrl || colorModeFromStorage;
    const initialTerrain = threeDimensionalFromUrl || threeDimensionalFromStorage;
    const initialMapView = mapViewFromUrl || mapViewFromStorage;

    if (typeof initialDestination === 'string' && /^\d+$/.test(initialDestination)) {
      hasManualDestinationSelectionRef.current = true;
      hasAutoSelectedDestinationRef.current = true;
      setSelectedDestinationId(initialDestination);
    }

    if (isTrailColorMode(initialColorMode)) {
      setTrailColorMode(initialColorMode);
    }

    if (initialTerrain === '1') {
      setIsThreeDimensional(true);
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
    router.query.terrain,
    router.query.zoom,
    setIsThreeDimensional,
    setMapView,
    setSelectedDestinationId,
    setTrailColorMode,
    shouldPreserveMapViewRef,
    storageKey,
  ]);

  useEffect(() => {
    if (!router.isReady || !hasInitializedFromUrlRef.current) {
      return;
    }

    const nextQuery = { ...router.query };

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

    if (isThreeDimensional) {
      nextQuery.terrain = '1';
    } else {
      delete nextQuery.terrain;
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

    const currentDestination = getSingleQueryValue(router.query.destination) || '';
    const currentColors = getSingleQueryValue(router.query.colors) || '';
    const currentTerrain = getSingleQueryValue(router.query.terrain) || '';
    const currentLongitude = getSingleQueryValue(router.query.lng) || '';
    const currentLatitude = getSingleQueryValue(router.query.lat) || '';
    const currentZoom = getSingleQueryValue(router.query.zoom) || '';
    const nextDestination = getSingleQueryValue(nextQuery.destination) || '';
    const nextColors = getSingleQueryValue(nextQuery.colors) || '';
    const nextTerrain = getSingleQueryValue(nextQuery.terrain) || '';
    const nextLongitude = getSingleQueryValue(nextQuery.lng) || '';
    const nextLatitude = getSingleQueryValue(nextQuery.lat) || '';
    const nextZoom = getSingleQueryValue(nextQuery.zoom) || '';

    if (
      currentDestination === nextDestination &&
      currentColors === nextColors &&
      currentTerrain === nextTerrain &&
      currentLongitude === nextLongitude &&
      currentLatitude === nextLatitude &&
      currentZoom === nextZoom
    ) {
      return;
    }

    router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [
    defaultTrailColorMode,
    hasInitializedFromUrlRef,
    isThreeDimensional,
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
      terrain: isThreeDimensional ? '1' : '',
      lng: mapView?.longitude?.toFixed(5) || '',
      lat: mapView?.latitude?.toFixed(5) || '',
      zoom: mapView?.zoom?.toFixed(2) || '',
    });
  }, [
    hasInitializedFromUrlRef,
    isThreeDimensional,
    mapView,
    selectedDestinationId,
    storageKey,
    trailColorMode,
  ]);
}