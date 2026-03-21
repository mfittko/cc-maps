import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  MAP_SETTINGS_STORAGE_KEY,
  excludeTrailFeatureCollectionDestinationIds,
  filterTrailFeatureCollectionByDestinationIds,
  getEdgeMidpointCoordinates,
  getUniqueDestinationIds,
  mergeTrailFeatureCollections,
  routeIncludesDestination,
} from '../lib/home-page';
import {
  appendRoutePlanAnchor,
  createRoutePlanGeoJson,
  findNearestRouteGraphEdgeId,
  promotePrimaryParticipantDestinationIds,
  removeRoutePlanAnchor,
  reverseRoutePlan,
} from '../lib/planning-mode';
import {
  clearStoredRoutePlan,
  createClearedRoutePlan,
  createRoutePlan,
  encodeRoutePlanToUrl,
} from '../lib/route-plan';
import { createGpxFileName, createGpxFromRouteFeatures } from '../lib/route-export';
import { writeCachedTrailGeoJson } from '../lib/map-persistence';
import type {
  Coordinates,
  DestinationSummary,
  TrailFeature,
  TrailFeatureCollection,
} from '../types/geo';
import type { GraphEdge, RouteGraph, RoutePlan } from '../types/route';

type StateSetter<T> = Dispatch<SetStateAction<T>>;

interface CreateHomePageActionsArgs {
  availableTrailsGeoJson: TrailFeatureCollection;
  routeGraph: RouteGraph | null;
  routeGraphRef: MutableRefObject<RouteGraph | null>;
  routePlan: RoutePlan | null;
  routePlanRef: MutableRefObject<RoutePlan | null>;
  routeOwnerDestination: DestinationSummary | null;
  selectedDestinationId: string;
  selectedDestinationIdRef: MutableRefObject<string>;
  primaryDestinationIdsRef: MutableRefObject<string[]>;
  previewDestinationIdsRef: MutableRefObject<string[]>;
  trailsGeoJsonRef: MutableRefObject<TrailFeatureCollection | null>;
  suggestedTrailsGeoJsonRef: MutableRefObject<TrailFeatureCollection | null>;
  hasManualDestinationSelectionRef: MutableRefObject<boolean>;
  shouldOpenPlanningFromUrlRef: MutableRefObject<boolean>;
  dismissedPlanningRouteKeyRef: MutableRefObject<string>;
  mapRef: MutableRefObject<any>;
  setIsSettingsPanelOpen: StateSetter<boolean>;
  setIsInfoPanelOpen: StateSetter<boolean>;
  setSelectedTrailFeature: StateSetter<TrailFeature | null>;
  setSelectedTrailClickCoordinates: StateSetter<Coordinates | null>;
  setTrailsGeoJson: StateSetter<TrailFeatureCollection | null>;
  setTrailsStatus: StateSetter<string>;
  setRequestError: StateSetter<string>;
  setPromotedPrimaryDestinationIds: StateSetter<string[]>;
  setLoadedPrimaryDestinationIds: StateSetter<string[]>;
  setLoadedPreviewDestinationIds: StateSetter<string[]>;
  setSuggestedTrailsGeoJson: StateSetter<TrailFeatureCollection | null>;
  setSelectedDestinationId: StateSetter<string>;
  setIsPlanning: StateSetter<boolean>;
  setRoutePlan: StateSetter<RoutePlan | null>;
}

export function createHomePageActions({
  availableTrailsGeoJson,
  routeGraph,
  routeGraphRef,
  routePlan,
  routePlanRef,
  routeOwnerDestination,
  selectedDestinationId,
  selectedDestinationIdRef,
  primaryDestinationIdsRef,
  previewDestinationIdsRef,
  trailsGeoJsonRef,
  suggestedTrailsGeoJsonRef,
  hasManualDestinationSelectionRef,
  shouldOpenPlanningFromUrlRef,
  dismissedPlanningRouteKeyRef,
  mapRef,
  setIsSettingsPanelOpen,
  setIsInfoPanelOpen,
  setSelectedTrailFeature,
  setSelectedTrailClickCoordinates,
  setTrailsGeoJson,
  setTrailsStatus,
  setRequestError,
  setPromotedPrimaryDestinationIds,
  setLoadedPrimaryDestinationIds,
  setLoadedPreviewDestinationIds,
  setSuggestedTrailsGeoJson,
  setSelectedDestinationId,
  setIsPlanning,
  setRoutePlan,
}: CreateHomePageActionsArgs) {
  function clearSelectedTrail() {
    setSelectedTrailFeature(null);
    setSelectedTrailClickCoordinates(null);
  }

  function selectRouteEdge(edge: GraphEdge | null | undefined, clickedCoordinates?: Coordinates | null) {
    if (!edge || edge.trailFeatureId == null || !availableTrailsGeoJson.features.length) {
      return false;
    }

    const sourceFeature = availableTrailsGeoJson.features.find((feature) => {
      if (String(feature?.properties?.id) !== String(edge.trailFeatureId)) {
        return false;
      }

      if (!edge.destinationId) {
        return true;
      }

      return String(feature?.properties?.destinationid || '') === String(edge.destinationId);
    });
    const nextClickCoordinates = Array.isArray(clickedCoordinates)
      ? clickedCoordinates
      : getEdgeMidpointCoordinates(edge);

    if (!sourceFeature || !Array.isArray(nextClickCoordinates)) {
      return false;
    }

    setIsSettingsPanelOpen(false);
    setIsInfoPanelOpen(false);
    setSelectedTrailFeature(sourceFeature);
    setSelectedTrailClickCoordinates(nextClickCoordinates);
    return true;
  }

  function handleSelectPlannedAnchor(edgeId: string) {
    const edge = routeGraphRef.current?.edges?.get(edgeId);

    if (!edge) {
      return;
    }

    selectRouteEdge(edge, getEdgeMidpointCoordinates(edge));
  }

  function applyTrailGeoJsonToPrimaryLayer(geojson: TrailFeatureCollection) {
    const map = mapRef.current;

    setTrailsGeoJson(geojson);
    setTrailsStatus('success');
    setRequestError('');

    if (map?.getSource('trails')) {
      map.getSource('trails').setData(geojson);
    }
  }

  function updateSelectedDestination(
    destinationId: string,
    options: { manual?: boolean; prefetchedTrailsGeoJson?: TrailFeatureCollection | null } = {}
  ) {
    const { manual = false, prefetchedTrailsGeoJson = null } = options;
    const currentPrimaryDestinationIds = primaryDestinationIdsRef.current;
    const currentPreviewDestinationIds = previewDestinationIdsRef.current;
    const currentTrailsGeoJson = trailsGeoJsonRef.current;
    const currentSuggestedTrailsGeoJson = suggestedTrailsGeoJsonRef.current;
    const hasLockedRoute = Boolean(routePlanRef.current?.anchorEdgeIds?.length);
    const shouldPreserveLockedRoute =
      hasLockedRoute && manual && routeIncludesDestination(routePlanRef.current, destinationId);
    const isManualPreviewPromotion = manual && currentPreviewDestinationIds.includes(destinationId);
    const shouldKeepCurrentPrimaryParticipants =
      shouldPreserveLockedRoute ||
      (manual && currentPrimaryDestinationIds.includes(destinationId)) ||
      isManualPreviewPromotion;
    const nextPrimaryParticipantIds = shouldKeepCurrentPrimaryParticipants
      ? promotePrimaryParticipantDestinationIds(currentPrimaryDestinationIds, destinationId)
      : [];
    const promotedTrailGeoJson = mergeTrailFeatureCollections([
      filterTrailFeatureCollectionByDestinationIds(currentTrailsGeoJson, nextPrimaryParticipantIds),
      prefetchedTrailsGeoJson ||
        filterTrailFeatureCollectionByDestinationIds(currentSuggestedTrailsGeoJson, [destinationId]),
    ]);

    if (manual) {
      hasManualDestinationSelectionRef.current = true;
    }

    if (prefetchedTrailsGeoJson) {
      writeCachedTrailGeoJson(
        String(destinationId),
        prefetchedTrailsGeoJson,
        MAP_SETTINGS_STORAGE_KEY
      );
    }

    if (shouldKeepCurrentPrimaryParticipants) {
      setPromotedPrimaryDestinationIds(nextPrimaryParticipantIds);

      const loadedFeatureDestinationIds = getUniqueDestinationIds(
        promotedTrailGeoJson.features.map((feature) => feature?.properties?.destinationid)
      );
      const nextLoadedPrimaryDestinationIds = nextPrimaryParticipantIds.filter((nextDestinationId) =>
        loadedFeatureDestinationIds.includes(nextDestinationId)
      );

      if (promotedTrailGeoJson.features.length) {
        applyTrailGeoJsonToPrimaryLayer(promotedTrailGeoJson);
        setLoadedPrimaryDestinationIds(nextLoadedPrimaryDestinationIds);
      } else {
        setLoadedPrimaryDestinationIds([]);
      }

      setLoadedPreviewDestinationIds((currentIds) =>
        currentIds.filter((currentId) => !nextPrimaryParticipantIds.includes(currentId))
      );
      setSuggestedTrailsGeoJson((currentGeoJson) =>
        excludeTrailFeatureCollectionDestinationIds(currentGeoJson, nextPrimaryParticipantIds)
      );
    } else {
      setPromotedPrimaryDestinationIds([]);
      setLoadedPrimaryDestinationIds([]);
      setLoadedPreviewDestinationIds([]);
      setSuggestedTrailsGeoJson(null);
    }

    setSelectedDestinationId(destinationId);
    clearSelectedTrail();

    if (shouldPreserveLockedRoute) {
      return;
    }

    setIsPlanning(false);
    setRoutePlan(null);
  }

  function handleExitPlanning() {
    shouldOpenPlanningFromUrlRef.current = false;
    dismissedPlanningRouteKeyRef.current = encodeRoutePlanToUrl(routePlan) || '';
    setIsPlanning(false);
  }

  function handleEnterPlanning() {
    if (!selectedDestinationId) {
      return;
    }

    shouldOpenPlanningFromUrlRef.current = false;
    dismissedPlanningRouteKeyRef.current = '';
    clearSelectedTrail();
    setIsSettingsPanelOpen(false);
    setIsInfoPanelOpen(false);
    setIsPlanning(true);
    setRoutePlan((currentPlan) => currentPlan ?? createRoutePlan(selectedDestinationId, []));
  }

  function handleClearPlan() {
    const previousOwnerDestinationId = routePlan?.destinationId || selectedDestinationId;
    const clearedRoutePlan = createClearedRoutePlan(routePlan, selectedDestinationId);

    if (!previousOwnerDestinationId || !clearedRoutePlan) {
      return;
    }

    if (
      routePlan?.anchorEdgeIds.length &&
      typeof window !== 'undefined' &&
      !window.confirm('Clear the current planned route?')
    ) {
      return;
    }

    clearStoredRoutePlan(previousOwnerDestinationId, MAP_SETTINGS_STORAGE_KEY);
    setPromotedPrimaryDestinationIds([]);
    setRoutePlan(clearedRoutePlan);
  }

  function handleReverseRoute() {
    setRoutePlan((currentPlan) => {
      if (!currentPlan) {
        return null;
      }

      return reverseRoutePlan(currentPlan, currentPlan.destinationId);
    });
  }

  function handleRemoveAnchor(index: number) {
    setRoutePlan((currentPlan) => {
      if (!currentPlan) {
        return null;
      }

      return removeRoutePlanAnchor(currentPlan, currentPlan.destinationId, index, routeGraphRef.current);
    });
  }

  function handleExportGpx() {
    if (!routeOwnerDestination || typeof window === 'undefined') {
      return;
    }

    const routeFeatures = createRoutePlanGeoJson(routePlan, routeGraph).traversal.features;
    const routeName = `${routeOwnerDestination.name} route`;
    const gpxContent = createGpxFromRouteFeatures(routeFeatures, { name: routeName });

    if (!gpxContent) {
      return;
    }

    const blob = new window.Blob([gpxContent], {
      type: 'application/gpx+xml;charset=utf-8',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const downloadLink = window.document.createElement('a');

    downloadLink.href = objectUrl;
    downloadLink.download = createGpxFileName(routeName);
    window.document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
  }

  async function handleShareRoute() {
    if (!routeOwnerDestination || typeof window === 'undefined') {
      return;
    }

    const shareUrl = window.location.href;
    const routeName = `${routeOwnerDestination.name} route`;
    const shareData = {
      title: routeName,
      text: `Planned route for ${routeOwnerDestination.name}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if ((error as Error | undefined)?.name === 'AbortError') {
        return;
      }

      console.warn('Share action failed', error);
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
      return;
    }

    const shareInput = window.document.createElement('input');
    shareInput.value = shareUrl;
    window.document.body.appendChild(shareInput);
    shareInput.select();
    window.document.execCommand('copy');
    shareInput.remove();
  }

  function handleReloadPage() {
    if (typeof window === 'undefined') {
      return;
    }

    window.location.reload();
  }

  function handlePlanningAnchorSelection(feature: TrailFeature | null, clickedCoordinates: Coordinates | null) {
    const edgeId = findNearestRouteGraphEdgeId(
      routeGraphRef.current,
      feature?.properties?.id,
      clickedCoordinates
    );

    if (!edgeId) {
      return false;
    }

    clearSelectedTrail();
    setRoutePlan((currentPlan) => {
      const ownerDestinationId = currentPlan?.destinationId || selectedDestinationIdRef.current;

      if (!ownerDestinationId) {
        return currentPlan;
      }

      return appendRoutePlanAnchor(currentPlan, ownerDestinationId, edgeId, routeGraphRef.current);
    });
    return true;
  }

  return {
    clearSelectedTrail,
    selectRouteEdge,
    handleSelectPlannedAnchor,
    updateSelectedDestination,
    handleExitPlanning,
    handleEnterPlanning,
    handleClearPlan,
    handleReverseRoute,
    handleRemoveAnchor,
    handleExportGpx,
    handleShareRoute,
    handleReloadPage,
    handlePlanningAnchorSelection,
  };
}