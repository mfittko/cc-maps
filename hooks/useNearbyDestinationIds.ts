import { useEffect, useState } from 'react';
import {
  DESTINATION_SUGGESTION_DEBOUNCE_MS,
  MAX_NEARBY_DESTINATION_PREVIEWS,
  SUGGESTED_DESTINATION_RADIUS_KM,
} from '../lib/home-page';
import { getDestinationsWithinRadius, getDistanceInKilometers } from '../lib/map-domain';
import type { DestinationSummary, MapView } from '../types/geo';

interface UseNearbyDestinationIdsArgs {
  mapView: MapView | null;
  selectedDestinationId: string;
  selectedDestination: DestinationSummary | null;
  destinations: DestinationSummary[];
  isPlanning?: boolean;
}

export function getNearbyDestinationReferenceCoordinates({
  mapView,
  selectedDestination,
  isPlanning = false,
}: {
  mapView: MapView | null;
  selectedDestination: DestinationSummary | null;
  isPlanning?: boolean;
}) {
  if (!selectedDestination) {
    return null;
  }

  if (isPlanning || !mapView) {
    return selectedDestination.coordinates;
  }

  return [mapView.longitude, mapView.latitude] as const;
}

export function useNearbyDestinationIds({
  mapView,
  selectedDestinationId,
  selectedDestination,
  destinations,
  isPlanning = false,
}: UseNearbyDestinationIdsArgs) {
  const [nearbyDestinationIds, setNearbyDestinationIds] = useState<string[]>([]);

  useEffect(() => {
    if (!selectedDestinationId || !destinations.length || !selectedDestination) {
      setNearbyDestinationIds([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const referenceCoordinates = getNearbyDestinationReferenceCoordinates({
        mapView,
        selectedDestination,
        isPlanning,
      });

      if (!referenceCoordinates) {
        setNearbyDestinationIds([]);
        return;
      }

      const nearbyAlternatives = getDestinationsWithinRadius(
        destinations,
        referenceCoordinates,
        SUGGESTED_DESTINATION_RADIUS_KM,
        selectedDestinationId
      );

      if (!nearbyAlternatives.length) {
        setNearbyDestinationIds([]);
        return;
      }

      const sortedNearbyAlternatives = [...nearbyAlternatives].sort((left, right) => {
        const leftDistance = getDistanceInKilometers(referenceCoordinates, left.coordinates);
        const rightDistance = getDistanceInKilometers(referenceCoordinates, right.coordinates);
        return leftDistance - rightDistance;
      });

      setNearbyDestinationIds(
        sortedNearbyAlternatives
          .slice(0, MAX_NEARBY_DESTINATION_PREVIEWS)
          .map((destination) => destination.id)
      );
    }, DESTINATION_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [destinations, isPlanning, mapView, selectedDestination, selectedDestinationId]);

  return nearbyDestinationIds;
}