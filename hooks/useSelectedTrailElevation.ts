import { useEffect, useState } from 'react';
import type { ElevationMetrics, TrailFeature } from '../types/geo';

interface UseSelectedTrailElevationArgs {
  selectedDestinationId: string;
  selectedElevationFeature: TrailFeature | null;
}

interface ElevationApiResponse {
  route?: {
    status?: string;
    metrics?: ElevationMetrics | null;
  };
}

export function useSelectedTrailElevation({
  selectedDestinationId,
  selectedElevationFeature,
}: UseSelectedTrailElevationArgs) {
  const [selectedTrailElevationMetrics, setSelectedTrailElevationMetrics] = useState<ElevationMetrics | null>(null);

  useEffect(() => {
    if (!selectedElevationFeature || !selectedDestinationId) {
      setSelectedTrailElevationMetrics(null);
      return undefined;
    }

    let isCancelled = false;

    fetch('/api/elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationId: selectedDestinationId,
        routeTraversal: [selectedElevationFeature.geometry],
      }),
    })
      .then((res) => res.json() as Promise<ElevationApiResponse>)
      .then((data) => {
        if (!isCancelled) {
          setSelectedTrailElevationMetrics(
            data.route?.status === 'ok' ? data.route.metrics || null : null
          );
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.warn('Skipped trail ascent/descent calculation', error);
          setSelectedTrailElevationMetrics(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedDestinationId, selectedElevationFeature]);

  return selectedTrailElevationMetrics;
}