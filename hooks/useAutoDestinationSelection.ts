import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  CURRENT_LOCATION_RECHECK_DISTANCE_KM,
  CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM,
  DEFAULT_CENTER,
} from '../lib/home-page';
import {
  getLoadPerfTimestamp,
  logLoadPerf,
  logLoadPerfSince,
  measureAsyncLoadPerf,
} from '../lib/load-perf';
import {
  findClosestDestination,
  findClosestDestinationByTrailProximity,
  getDistanceInKilometers,
} from '../lib/map-domain';
import type { Coordinates, DestinationSummary, TrailFeatureCollection } from '../types/geo';

interface UseAutoDestinationSelectionArgs {
  mapReady: boolean;
  destinations: DestinationSummary[];
  selectedDestinationId: string;
  geolocateControlRef: MutableRefObject<any>;
  hasManualDestinationSelectionRef: MutableRefObject<boolean>;
  hasAutoSelectedDestinationRef: MutableRefObject<boolean>;
  lastAutoLocationRef: MutableRefObject<Coordinates | null>;
  setCurrentLocationCoordinates: Dispatch<SetStateAction<Coordinates | null>>;
  updateSelectedDestinationRef: MutableRefObject<
    (
      destinationId: string,
      options?: { manual?: boolean; prefetchedTrailsGeoJson?: TrailFeatureCollection | null }
    ) => void
  >;
}

export function useAutoDestinationSelection({
  mapReady,
  destinations,
  selectedDestinationId,
  geolocateControlRef,
  hasManualDestinationSelectionRef,
  hasAutoSelectedDestinationRef,
  lastAutoLocationRef,
  setCurrentLocationCoordinates,
  updateSelectedDestinationRef,
}: UseAutoDestinationSelectionArgs) {
  useEffect(() => {
    if (!mapReady || !destinations.length || hasManualDestinationSelectionRef.current) {
      return undefined;
    }

    const autoSelectionStartedAt = getLoadPerfTimestamp();

    async function maybeAutoSelectDestinationFromLocation(
      referenceCoordinates: Coordinates | null,
      options: { allowFallback?: boolean } = {}
    ) {
      const { allowFallback = false } = options;

      if (hasManualDestinationSelectionRef.current || !referenceCoordinates) {
        return;
      }

      const lastLocation = lastAutoLocationRef.current;

      if (
        lastLocation &&
        getDistanceInKilometers(lastLocation, referenceCoordinates) <
          CURRENT_LOCATION_RECHECK_DISTANCE_KM
      ) {
        return;
      }

      lastAutoLocationRef.current = referenceCoordinates;

      try {
        const searchParams = new URLSearchParams({
          lng: String(referenceCoordinates[0]),
          lat: String(referenceCoordinates[1]),
        });
        const response = await measureAsyncLoadPerf('fetch nearby trails for auto-selection', () =>
          fetch(`/api/trails?${searchParams.toString()}`)
        );

        if (response.ok) {
          const nearbyTrailsGeoJson = (await measureAsyncLoadPerf(
            'parse nearby trails for auto-selection',
            () => response.json()
          )) as TrailFeatureCollection;
          const nearbyDestination = findClosestDestinationByTrailProximity(
            destinations,
            nearbyTrailsGeoJson,
            referenceCoordinates,
            CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM
          );

          if (nearbyDestination && selectedDestinationId !== nearbyDestination.id) {
            hasAutoSelectedDestinationRef.current = true;
            updateSelectedDestinationRef.current(nearbyDestination.id);
            logLoadPerfSince(
              `auto-selected destination by trail proximity (${nearbyDestination.id})`,
              autoSelectionStartedAt
            );
            return;
          }
        }
      } catch (error) {
        console.warn('Skipped current-location trail proximity matching', error);
      }

      if (!allowFallback || selectedDestinationId) {
        return;
      }

      const fallbackDestination = findClosestDestination(destinations, referenceCoordinates);

      if (fallbackDestination && !hasAutoSelectedDestinationRef.current) {
        hasAutoSelectedDestinationRef.current = true;
        updateSelectedDestinationRef.current(fallbackDestination.id);
        logLoadPerfSince(
          `auto-selected fallback destination (${fallbackDestination.id})`,
          autoSelectionStartedAt
        );
      }
    }

    if (!navigator.geolocation) {
      const fallbackDestination = findClosestDestination(destinations, DEFAULT_CENTER);

      if (fallbackDestination && !selectedDestinationId && !hasAutoSelectedDestinationRef.current) {
        hasAutoSelectedDestinationRef.current = true;
        updateSelectedDestinationRef.current(fallbackDestination.id);
        logLoadPerf('auto-selected fallback destination without geolocation support');
      }

      return undefined;
    }

    let isCancelled = false;
    const geolocateControl = geolocateControlRef.current;
    const handleGeolocate = (event: { coords: { longitude: number; latitude: number } }) => {
      const nextCoordinates: Coordinates = [event.coords.longitude, event.coords.latitude];

      setCurrentLocationCoordinates(nextCoordinates);

      if (isCancelled || hasManualDestinationSelectionRef.current) {
        return;
      }

      void maybeAutoSelectDestinationFromLocation(nextCoordinates);
    };

    if (geolocateControl) {
      geolocateControl.on('geolocate', handleGeolocate);
    }

    const geolocationRequestStartedAt = getLoadPerfTimestamp();
    logLoadPerf('requesting initial geolocation');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (isCancelled || hasManualDestinationSelectionRef.current) {
          return;
        }

        logLoadPerfSince('initial geolocation resolved', geolocationRequestStartedAt);

        await maybeAutoSelectDestinationFromLocation(
          [position.coords.longitude, position.coords.latitude],
          { allowFallback: true }
        );
      },
      () => {
        if (isCancelled || hasManualDestinationSelectionRef.current) {
          return;
        }

        const fallbackDestination = findClosestDestination(destinations, DEFAULT_CENTER);

        if (fallbackDestination && !selectedDestinationId && !hasAutoSelectedDestinationRef.current) {
          hasAutoSelectedDestinationRef.current = true;
          updateSelectedDestinationRef.current(fallbackDestination.id);
          logLoadPerfSince(
            `auto-selected geolocation fallback destination (${fallbackDestination.id})`,
            geolocationRequestStartedAt
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 300000,
        timeout: 10000,
      }
    );

    return () => {
      isCancelled = true;

      if (geolocateControl) {
        geolocateControl.off('geolocate', handleGeolocate);
      }
    };
  }, [
    destinations,
    geolocateControlRef,
    hasAutoSelectedDestinationRef,
    hasManualDestinationSelectionRef,
    lastAutoLocationRef,
    mapReady,
    selectedDestinationId,
    setCurrentLocationCoordinates,
    updateSelectedDestinationRef,
  ]);
}