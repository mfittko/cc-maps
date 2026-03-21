import { useEffect, useState } from 'react';
import {
  DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
  MIN_SEGMENT_DISTANCE_KM,
} from '../lib/home-page';
import { getClickedTrailSection, getCrossingMetrics } from '../lib/map-domain';
import type {
  DestinationSummary,
  TrailCrossingMetrics,
  TrailFeature,
  TrailFeatureCollection,
} from '../types/geo';

interface UseSelectedTrailDetailsArgs {
  selectedTrailFeature: TrailFeature | null;
  selectedTrailClickCoordinates: [number, number] | null;
  availableTrailsGeoJson: TrailFeatureCollection;
  destinations: DestinationSummary[];
}

export function useSelectedTrailDetails({
  selectedTrailFeature,
  selectedTrailClickCoordinates,
  availableTrailsGeoJson,
  destinations,
}: UseSelectedTrailDetailsArgs) {
  const [selectedTrailSectionFeature, setSelectedTrailSectionFeature] = useState<TrailFeature | null>(null);
  const [selectedTrailCrossings, setSelectedTrailCrossings] = useState<TrailCrossingMetrics | null>(null);

  useEffect(() => {
    if (!selectedTrailFeature || !availableTrailsGeoJson.features.length) {
      setSelectedTrailSectionFeature(null);
      setSelectedTrailCrossings(null);
      return;
    }

    const selectedSection = getClickedTrailSection(
      selectedTrailFeature,
      selectedTrailClickCoordinates,
      availableTrailsGeoJson,
      destinations,
      DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
      MIN_SEGMENT_DISTANCE_KM
    );

    setSelectedTrailSectionFeature(selectedSection?.feature || selectedTrailFeature);
    setSelectedTrailCrossings(
      selectedSection?.crossingMetrics ||
        getCrossingMetrics(
          selectedTrailFeature,
          availableTrailsGeoJson,
          destinations,
          DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
          MIN_SEGMENT_DISTANCE_KM
        )
    );
  }, [availableTrailsGeoJson, destinations, selectedTrailClickCoordinates, selectedTrailFeature]);

  return {
    selectedTrailSectionFeature,
    selectedTrailCrossings,
  };
}