import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import {
  MAP_SETTINGS_STORAGE_KEY,
  TRAILS_CACHE_TTL_MS,
  getFeatureCollectionGeoJson,
  mergeTrailFeatureCollections,
} from '../lib/home-page';
import { readCachedTrailGeoJson, writeCachedTrailGeoJson } from '../lib/map-persistence';
import type { TrailFeatureCollection } from '../types/geo';

interface UseTrailCollectionsArgs {
  mapReady: boolean;
  selectedDestinationId: string;
  primaryDestinationIds: string[];
  primaryDestinationIdsKey: string;
  previewDestinationIds: string[];
  previewDestinationIdsKey: string;
  setTrailsStatus: (status: string) => void;
  setRequestError: (error: string) => void;
  setTrailsGeoJson: Dispatch<SetStateAction<TrailFeatureCollection | null>>;
  setLoadedPrimaryDestinationIds: Dispatch<SetStateAction<string[]>>;
  setSuggestedTrailsGeoJson: Dispatch<SetStateAction<TrailFeatureCollection | null>>;
  setLoadedPreviewDestinationIds: Dispatch<SetStateAction<string[]>>;
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

interface PrimaryTrailCollectionScopeArgs {
  mapReady: boolean;
  selectedDestinationId: string;
  primaryDestinationIdsKey: string;
}

interface PreviewTrailCollectionScopeArgs {
  mapReady: boolean;
  previewDestinationIdsKey: string;
}

export function getPrimaryTrailCollectionScopeKey({
  mapReady,
  selectedDestinationId,
  primaryDestinationIdsKey,
}: PrimaryTrailCollectionScopeArgs) {
  if (!mapReady || !selectedDestinationId || !primaryDestinationIdsKey) {
    return '';
  }

  return `${selectedDestinationId}:${primaryDestinationIdsKey}`;
}

export function getPreviewTrailCollectionScopeKey({
  mapReady,
  previewDestinationIdsKey,
}: PreviewTrailCollectionScopeArgs) {
  if (!mapReady || !previewDestinationIdsKey) {
    return '';
  }

  return previewDestinationIdsKey;
}

export function useTrailCollections({
  mapReady,
  selectedDestinationId,
  primaryDestinationIds,
  primaryDestinationIdsKey,
  previewDestinationIds,
  previewDestinationIdsKey,
  setTrailsStatus,
  setRequestError,
  setTrailsGeoJson,
  setLoadedPrimaryDestinationIds,
  setSuggestedTrailsGeoJson,
  setLoadedPreviewDestinationIds,
}: UseTrailCollectionsArgs) {
  const lastPrimaryScopeKeyRef = useRef('');
  const lastPreviewScopeKeyRef = useRef('');

  useEffect(() => {
    const primaryScopeKey = getPrimaryTrailCollectionScopeKey({
      mapReady,
      selectedDestinationId,
      primaryDestinationIdsKey,
    });

    if (!primaryScopeKey) {
      lastPrimaryScopeKeyRef.current = '';
    }

    if (!mapReady || !selectedDestinationId || !primaryDestinationIds.length) {
      return undefined;
    }

    if (lastPrimaryScopeKeyRef.current === primaryScopeKey) {
      return undefined;
    }

    lastPrimaryScopeKeyRef.current = primaryScopeKey;

    let isCancelled = false;

    async function loadTrails() {
      setTrailsStatus('loading');
      setRequestError('');

      try {
        const primaryCollections = await Promise.all(
          primaryDestinationIds.map(async (destinationId) => {
            let geojson = readCachedTrailGeoJson(
              destinationId,
              MAP_SETTINGS_STORAGE_KEY,
              TRAILS_CACHE_TTL_MS
            );

            if (!geojson) {
              const response = await fetch(`/api/trails?destinationid=${destinationId}`);

              if (!response.ok) {
                throw new Error('Failed to fetch trails for the selected destination');
              }

              geojson = (await response.json()) as TrailFeatureCollection;
              writeCachedTrailGeoJson(destinationId, geojson, MAP_SETTINGS_STORAGE_KEY);
            }

            return geojson as TrailFeatureCollection;
          })
        );

        if (isCancelled) {
          return;
        }

        setTrailsGeoJson(mergeTrailFeatureCollections(primaryCollections));
        setLoadedPrimaryDestinationIds((currentDestinationIds) =>
          areStringArraysEqual(currentDestinationIds, primaryDestinationIds)
            ? currentDestinationIds
            : primaryDestinationIds
        );
        setTrailsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLoadedPrimaryDestinationIds((currentDestinationIds) =>
          currentDestinationIds.length ? [] : currentDestinationIds
        );
        setTrailsStatus('error');
        setRequestError((error as Error).message);
      }
    }

    void loadTrails();

    return () => {
      isCancelled = true;
    };
  }, [
    mapReady,
    primaryDestinationIdsKey,
    selectedDestinationId,
    primaryDestinationIds,
    setLoadedPrimaryDestinationIds,
    setRequestError,
    setTrailsGeoJson,
    setTrailsStatus,
  ]);

  useEffect(() => {
    const previewScopeKey = getPreviewTrailCollectionScopeKey({
      mapReady,
      previewDestinationIdsKey,
    });

    if (!previewScopeKey) {
      lastPreviewScopeKeyRef.current = '';
    }

    if (!mapReady || !previewDestinationIds.length) {
      setSuggestedTrailsGeoJson((currentGeoJson) => (currentGeoJson ? null : currentGeoJson));
      setLoadedPreviewDestinationIds((currentDestinationIds) =>
        currentDestinationIds.length ? [] : currentDestinationIds
      );
      return undefined;
    }

    if (lastPreviewScopeKeyRef.current === previewScopeKey) {
      return undefined;
    }

    lastPreviewScopeKeyRef.current = previewScopeKey;

    let isCancelled = false;

    async function loadSuggestedTrails() {
      try {
        const previewCollections = await Promise.all(
          previewDestinationIds.map(async (destinationId) => {
            try {
              const cachedGeoJson = readCachedTrailGeoJson(
                destinationId,
                MAP_SETTINGS_STORAGE_KEY,
                TRAILS_CACHE_TTL_MS
              );

              if (cachedGeoJson) {
                return cachedGeoJson;
              }

              const response = await fetch(`/api/trails?destinationid=${destinationId}`);

              if (!response.ok) {
                return getFeatureCollectionGeoJson([]);
              }

              const geojson = (await response.json()) as TrailFeatureCollection;
              writeCachedTrailGeoJson(destinationId, geojson, MAP_SETTINGS_STORAGE_KEY);
              return geojson;
            } catch {
              return getFeatureCollectionGeoJson([]);
            }
          })
        );

        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson(mergeTrailFeatureCollections(previewCollections));
        setLoadedPreviewDestinationIds((currentDestinationIds) =>
          areStringArraysEqual(currentDestinationIds, previewDestinationIds)
            ? currentDestinationIds
            : previewDestinationIds
        );
      } catch {
        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson((currentGeoJson) => (currentGeoJson ? null : currentGeoJson));
        setLoadedPreviewDestinationIds((currentDestinationIds) =>
          areStringArraysEqual(currentDestinationIds, previewDestinationIds)
            ? currentDestinationIds
            : previewDestinationIds
        );
      }
    }

    void loadSuggestedTrails();

    return () => {
      isCancelled = true;
    };
  }, [
    mapReady,
    previewDestinationIdsKey,
    previewDestinationIds,
    setLoadedPreviewDestinationIds,
    setSuggestedTrailsGeoJson,
  ]);
}