import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_CENTER } from '../lib/home-page';
import { getDestinationSummary } from '../lib/map-domain';
import type { DestinationFeatureCollection, DestinationSummary } from '../types/geo';

interface UseDestinationsDataArgs {
  mapReady: boolean;
  setRequestError: Dispatch<SetStateAction<string>>;
}

export function useDestinationsData({ mapReady, setRequestError }: UseDestinationsDataArgs) {
  const [destinationsStatus, setDestinationsStatus] = useState('idle');
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [destinationsGeoJson, setDestinationsGeoJson] = useState<DestinationFeatureCollection | null>(null);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }

    let isCancelled = false;

    async function loadDestinations() {
      setDestinationsStatus('loading');
      setRequestError('');

      try {
        const response = await fetch('/api/destinations');

        if (!response.ok) {
          throw new Error('Failed to fetch destinations');
        }

        const geojson = (await response.json()) as DestinationFeatureCollection;

        if (isCancelled) {
          return;
        }

        const destinationOptions = geojson.features
          .map((feature) => getDestinationSummary(feature, DEFAULT_CENTER))
          .sort((left, right) => left.name.localeCompare(right.name));

        setDestinations(destinationOptions);
        setDestinationsGeoJson(geojson);
        setDestinationsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setDestinationsStatus('error');
        setRequestError((error as Error).message);
      }
    }

    void loadDestinations();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, setRequestError]);

  return {
    destinations,
    destinationsGeoJson,
    destinationsStatus,
  };
}