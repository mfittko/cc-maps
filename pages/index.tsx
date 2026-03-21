import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { FaRoute } from 'react-icons/fa6';
import ControlPanel from '../components/ControlPanel';
import InfoPanel from '../components/InfoPanel';
import PlanningPanel from '../components/PlanningPanel';
import TrailDetailsPanel from '../components/TrailDetailsPanel';
import { useAutoDestinationSelection } from '../hooks/useAutoDestinationSelection';
import { useDestinationsData } from '../hooks/useDestinationsData';
import { createHomePageActions } from '../hooks/useHomePageActions';
import { useDestinationLayers } from '../hooks/useDestinationLayers';
import { useInteractionEnvironment } from '../hooks/useInteractionEnvironment';
import { useLatestValue } from '../hooks/useLatestValue';
import { mapboxApi, useMapLifecycle } from '../hooks/useMapLifecycle';
import { useMapPersistence } from '../hooks/useMapPersistence';
import { useNearbyDestinationIds } from '../hooks/useNearbyDestinationIds';
import { useRouteDirectionTracking } from '../hooks/useRouteDirectionTracking';
import { useRoutePlanSync } from '../hooks/useRoutePlanSync';
import { useRoutePlanMap } from '../hooks/useRoutePlanMap';
import { useRouteInsights } from '../hooks/useRouteInsights';
import { useSelectedTrailDetails } from '../hooks/useSelectedTrailDetails';
import { useSelectedTrailElevation } from '../hooks/useSelectedTrailElevation';
import { useSelectedTrailLayers } from '../hooks/useSelectedTrailLayers';
import { useTrailCollections } from '../hooks/useTrailCollections';
import { useTrailMapLayers } from '../hooks/useTrailMapLayers';
import { useTrailSegmentLabels } from '../hooks/useTrailSegmentLabels';
import {
  DEFAULT_TRAIL_COLOR_MODE,
  MAP_SETTINGS_STORAGE_KEY,
  freshnessLegendItems,
  getPreviewDestinationIds,
  getRouteDestinationIds,
  getTrailFeatureCollectionSignature,
  getUniqueDestinationIds,
  mergeTrailFeatureCollections,
  resolvePersistedRoutePlanForDestination,
  routeIncludesDestination,
  trailLegendItems,
} from '../lib/home-page';
import { getSingleQueryValue } from '../lib/map-persistence';
import { getLoadPerfTimestamp, logLoadPerf, logLoadPerfSince } from '../lib/load-perf';
import { measureRoutePerf } from '../lib/route-perf';
import {
  formatDistance,
  getTrailSelectionLengthInKilometers,
} from '../lib/map-domain';
import {
  getPrimaryParticipantDestinationIds,
  createRoutePlanGeoJson,
  shouldMergePreviewTrailsIntoRouteGraph,
} from '../lib/planning-mode';
import {
  createRoutePlan,
} from '../lib/route-plan';
import { buildRouteGraph } from '../lib/route-graph';
import type {
  Coordinates,
  ElevationMetrics,
  MapView,
  TrailFeature,
  TrailFeatureCollection,
} from '../types/geo';
import type { RouteGraph, RoutePlan } from '../types/route';

const ROUTE_GRAPH_CACHE_LIMIT = 6;
const routeGraphCache = new Map<string, RouteGraph>();

function rememberRouteGraph(signature: string, graph: RouteGraph) {
  routeGraphCache.delete(signature);
  routeGraphCache.set(signature, graph);

  if (routeGraphCache.size <= ROUTE_GRAPH_CACHE_LIMIT) {
    return graph;
  }

  const oldestKey = routeGraphCache.keys().next().value;

  if (oldestKey) {
    routeGraphCache.delete(oldestKey);
  }

  return graph;
}

export default function Home() {
  const router = useRouter();
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geolocateControlRef = useRef<any>(null);
  const hasManualDestinationSelectionRef = useRef(false);
  const hasAutoSelectedDestinationRef = useRef(false);
  const hasInitializedFromUrlRef = useRef(false);
  const shouldPreserveMapViewRef = useRef(false);
  const skipNextTrailFitRef = useRef(false);
  const pendingRouteViewportFitRef = useRef('');
  const hydratedRoutePlanKeyRef = useRef('');
  const dismissedPlanningRouteKeyRef = useRef('');
  const persistedRouteOwnerDestinationIdRef = useRef('');
  const shouldOpenPlanningFromUrlRef = useRef(false);
  const lastAutoLocationRef = useRef<Coordinates | null>(null);
  const wasCurrentLocationOnRouteRef = useRef(false);
  const lastRouteProgressDistanceKmRef = useRef<number | null>(null);
  const initialLoadStartedAtRef = useRef<number | null>(getLoadPerfTimestamp());
  const loggedInitialLoadMilestonesRef = useRef({
    mounted: false,
    mapReady: false,
    destinationsReady: false,
    destinationSelected: false,
    trailsReady: false,
    complete: false,
  });
  const [trailsStatus, setTrailsStatus] = useState('idle');
  const [requestError, setRequestError] = useState('');
  const [trailsGeoJson, setTrailsGeoJson] = useState<TrailFeatureCollection | null>(null);
  const [suggestedTrailsGeoJson, setSuggestedTrailsGeoJson] = useState<TrailFeatureCollection | null>(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [selectedTrailFeature, setSelectedTrailFeature] = useState<TrailFeature | null>(null);
  const [selectedTrailClickCoordinates, setSelectedTrailClickCoordinates] = useState<Coordinates | null>(null);
  const [trailColorMode, setTrailColorMode] = useState(DEFAULT_TRAIL_COLOR_MODE);
  const [mapView, setMapView] = useState<MapView | null>(null);
  const [promotedPrimaryDestinationIds, setPromotedPrimaryDestinationIds] = useState<string[]>([]);
  const [loadedPrimaryDestinationIds, setLoadedPrimaryDestinationIds] = useState<string[]>([]);
  const [loadedPreviewDestinationIds, setLoadedPreviewDestinationIds] = useState<string[]>([]);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeElevationMetrics, setRouteElevationMetrics] = useState<ElevationMetrics | null>(null);
  const [routeAnchorElevationMetrics, setRouteAnchorElevationMetrics] = useState<Array<ElevationMetrics | null>>([]);
  const [currentLocationCoordinates, setCurrentLocationCoordinates] = useState<Coordinates | null>(null);
  const [isRouteTravelingReverse, setIsRouteTravelingReverse] = useState(false);
  const { mapReady, mapError, isInitialMapViewSettled } = useMapLifecycle({
    mapContainer,
    mapRef,
    geolocateControlRef,
    routerReady: router.isReady,
    mapView,
    shouldPreserveMapViewRef,
    skipNextTrailFitRef,
    pendingRouteViewportFitRef,
    setMapView,
  });
  const { destinations, destinationsGeoJson, destinationsStatus } = useDestinationsData({
    setRequestError,
  });
  const { isMacOS, isMobileInteraction } = useInteractionEnvironment();
  const trailColorModeRef = useLatestValue(trailColorMode);
  const isPlanningRef = useLatestValue(isPlanning);
  const routePlanRef = useLatestValue(routePlan);
  const selectedDestinationIdRef = useLatestValue(selectedDestinationId);
  const trailsGeoJsonRef = useLatestValue(trailsGeoJson);
  const suggestedTrailsGeoJsonRef = useLatestValue(suggestedTrailsGeoJson);
  const selectedTrailFeatureRef = useLatestValue(selectedTrailFeature);
  const isMacOSRef = useLatestValue(isMacOS);
  const isMobileInteractionRef = useLatestValue(isMobileInteraction);

  const selectedDestination =
    destinations.find((destination) => destination.id === selectedDestinationId) || null;
  const routeOwnerDestination =
    destinations.find((destination) => destination.id === routePlan?.destinationId) ||
    selectedDestination ||
    null;
  const nearbyDestinationIds = useNearbyDestinationIds({
    mapView,
    selectedDestinationId,
    selectedDestination,
    destinations,
    isPlanning,
  });
  const nearbyDestinations = useMemo(
    () => destinations.filter((destination) => nearbyDestinationIds.includes(destination.id)),
    [destinations, nearbyDestinationIds]
  );
  const routeQueryValue =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('route') ?? getSingleQueryValue(router.query.route) ?? null
      : getSingleQueryValue(router.query.route) ?? null;
  const persistedRouteSelection = useMemo(() => {
    if (!router.isReady || !selectedDestinationId || routePlan !== null) {
      return {
        routeFromUrl: null,
        routeFromStorage: null,
        persistedRoutePlan: null,
      };
    }

    return resolvePersistedRoutePlanForDestination(
      routeQueryValue,
      selectedDestinationId,
      MAP_SETTINGS_STORAGE_KEY
    );
  }, [routePlan, routeQueryValue, router.isReady, selectedDestinationId]);
  const pendingRouteDestinationIds = useMemo(
    () => getRouteDestinationIds(persistedRouteSelection.persistedRoutePlan),
    [persistedRouteSelection.persistedRoutePlan]
  );
  const pendingRouteDestinationIdsKey = pendingRouteDestinationIds.join(',');
  const activeRouteDestinationIds = useMemo(
    () =>
      getUniqueDestinationIds(
        routePlan?.anchorEdgeIds?.length ? routePlan.destinationIds : pendingRouteDestinationIds
      ),
    [pendingRouteDestinationIdsKey, routePlan]
  );
  const primaryDestinationIds = useMemo(
    () =>
      getPrimaryParticipantDestinationIds(
        selectedDestinationId,
        activeRouteDestinationIds,
        promotedPrimaryDestinationIds
      ),
    [activeRouteDestinationIds, promotedPrimaryDestinationIds, selectedDestinationId]
  );
  const primaryDestinationIdsKey = primaryDestinationIds.join(',');
  const previewDestinationIds = useMemo(
    () => getPreviewDestinationIds(nearbyDestinationIds, primaryDestinationIds),
    [nearbyDestinationIds, primaryDestinationIds]
  );
  const previewDestinationIdsKey = previewDestinationIds.join(',');
  const primaryDestinationIdsRef = useLatestValue(primaryDestinationIds);
  const previewDestinationIdsRef = useLatestValue(previewDestinationIds);
  const availableTrailsGeoJson = useMemo(
    () => mergeTrailFeatureCollections([trailsGeoJson, suggestedTrailsGeoJson]),
    [trailsGeoJson, suggestedTrailsGeoJson]
  );
  const {
    selectedTrailSectionFeature,
    selectedTrailCrossings,
  } = useSelectedTrailDetails({
    selectedTrailFeature,
    selectedTrailClickCoordinates,
    availableTrailsGeoJson,
    destinations,
  });
  const shouldIncludePreviewTrailsInRouteGraph = useMemo(
    () => shouldMergePreviewTrailsIntoRouteGraph(activeRouteDestinationIds),
    [activeRouteDestinationIds]
  );
  const routeGraphTrailsGeoJson = useMemo(() => {
    if (!shouldIncludePreviewTrailsInRouteGraph) {
      return trailsGeoJson;
    }

    return mergeTrailFeatureCollections([trailsGeoJson, suggestedTrailsGeoJson]);
  }, [shouldIncludePreviewTrailsInRouteGraph, trailsGeoJson, suggestedTrailsGeoJson]);
  const routeGraphTrailsSignature = useMemo(
    () => getTrailFeatureCollectionSignature(routeGraphTrailsGeoJson),
    [routeGraphTrailsGeoJson]
  );
  const routeGraph: RouteGraph | null = useMemo(() => {
    if (!routeGraphTrailsSignature || !routeGraphTrailsGeoJson?.features?.length) {
      return null;
    }

    const cachedRouteGraph = routeGraphCache.get(routeGraphTrailsSignature);

    if (cachedRouteGraph) {
      return cachedRouteGraph;
    }

    return rememberRouteGraph(
      routeGraphTrailsSignature,
      measureRoutePerf('build route graph', () => buildRouteGraph(routeGraphTrailsGeoJson))
    );
  }, [routeGraphTrailsGeoJson, routeGraphTrailsSignature]);
  const routeGraphRef = useLatestValue(routeGraph);
  const routePlanGeoJson = useMemo(
    () =>
      measureRoutePerf('build route plan geojson', () =>
        createRoutePlanGeoJson(routePlan, routeGraph)
      ),
    [routeGraph, routePlan]
  );
  const activeTraversalLabelsGeoJson = useMemo(
    () => (routePlan?.anchorEdgeIds?.length ? routePlanGeoJson.traversal : null),
    [routePlan, routePlanGeoJson]
  );
  const {
    currentRouteProgress,
    isCurrentLocationOnRoute,
    selectedRouteTraversalFeature,
    selectedElevationFeature,
    selectedRouteInsights,
  } = useRouteInsights({
    routeTraversalGeoJson: routePlanGeoJson.traversal,
    currentLocationCoordinates,
    selectedTrailFeature,
    selectedTrailSectionFeature,
    selectedTrailClickCoordinates,
    isPlanning,
    isRouteTravelingReverse,
    routeElevationMetrics,
  });
  const selectedTrailElevationMetrics = useSelectedTrailElevation({
    selectedDestinationId,
    selectedElevationFeature,
  });
  const selectedTrail = selectedTrailFeature?.properties || null;
  const selectedTrailLengthKm = selectedTrailSectionFeature
    ? getTrailSelectionLengthInKilometers(selectedTrailSectionFeature)
    : selectedTrailCrossings?.totalLengthKm || 0;
  const activeTrailLegendItems =
    trailColorMode === 'freshness' ? freshnessLegendItems : trailLegendItems;

  const {
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
  } = createHomePageActions({
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
  });
  const clearSelectedTrailRef = useLatestValue(clearSelectedTrail);
  const updateSelectedDestinationRef = useLatestValue(updateSelectedDestination);
  const handlePlanningAnchorSelectionRef = useLatestValue(handlePlanningAnchorSelection);

  useAutoDestinationSelection({
    mapReady,
    destinations,
    selectedDestinationId,
    geolocateControlRef,
    hasManualDestinationSelectionRef,
    hasAutoSelectedDestinationRef,
    lastAutoLocationRef,
    setCurrentLocationCoordinates,
    updateSelectedDestinationRef,
  });

  useRoutePlanSync({
    router,
    hasInitializedFromUrlRef,
    shouldOpenPlanningFromUrlRef,
    shouldPreserveMapViewRef,
    pendingRouteViewportFitRef,
    hydratedRoutePlanKeyRef,
    dismissedPlanningRouteKeyRef,
    persistedRouteOwnerDestinationIdRef,
    selectedDestinationId,
    routePlan,
    setRoutePlan,
    routeGraph,
    loadedPrimaryDestinationIds,
    persistedRouteSelection,
    mapView,
    isPlanning,
    setIsPlanning,
  });

  useRouteDirectionTracking({
    currentLocationCoordinates,
    currentRouteProgress,
    isCurrentLocationOnRoute,
    isPlanning,
    routeGraph,
    routePlan,
    selectedRouteTraversalFeature,
    wasCurrentLocationOnRouteRef,
    lastRouteProgressDistanceKmRef,
    setIsRouteTravelingReverse,
    selectRouteEdge,
  });

  useMapPersistence({
    router,
    storageKey: MAP_SETTINGS_STORAGE_KEY,
    defaultTrailColorMode: DEFAULT_TRAIL_COLOR_MODE,
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
  });

  useTrailCollections({
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
  });

  useDestinationLayers({
    mapReady,
    mapRef,
    destinationsGeoJson,
    nearbyDestinations,
    updateSelectedDestinationRef,
  });

  useTrailMapLayers({
    mapReady,
    mapRef,
    mapboxApi,
    selectedDestinationId,
    trailsGeoJson,
    suggestedTrailsGeoJson,
    trailColorMode,
    trailColorModeRef,
    routeTraversalGeoJson: routePlanGeoJson.traversal,
    isPlanning,
    routePlan,
    skipNextTrailFitRef,
    isPlanningRef,
    isMobileInteractionRef,
    isMacOSRef,
    selectedTrailFeatureRef,
    clearSelectedTrailRef,
    handlePlanningAnchorSelectionRef,
    updateSelectedDestinationRef,
    setIsSettingsPanelOpen,
    setIsInfoPanelOpen,
    setSelectedTrailFeature,
    setSelectedTrailClickCoordinates,
  });

  useRoutePlanMap({
    mapReady,
    mapRef,
    mapboxApi,
    routePlan,
    routePlanGeoJson,
    pendingRouteViewportFitRef,
    selectedDestinationId,
    selectedDestination,
    setRouteElevationMetrics,
    setRouteAnchorElevationMetrics,
  });

  useSelectedTrailLayers({
    mapReady,
    mapRef,
    selectedTrailSectionFeature,
    trailColorMode,
  });

  useTrailSegmentLabels({
    mapReady,
    mapRef,
    trailsGeoJson,
    destinations,
    activeTraversalGeoJson: activeTraversalLabelsGeoJson,
  });

  useEffect(() => {
    if (!selectedDestinationId) {
      setPromotedPrimaryDestinationIds([]);
      return;
    }
  }, [selectedDestinationId]);

  useEffect(() => {
    if (loggedInitialLoadMilestonesRef.current.mounted) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.mounted = true;
    logLoadPerf('home render mounted');
  }, []);

  useEffect(() => {
    if (!mapReady || loggedInitialLoadMilestonesRef.current.mapReady) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.mapReady = true;
    logLoadPerfSince('home initial map ready', initialLoadStartedAtRef.current);
  }, [mapReady]);

  useEffect(() => {
    if (
      destinationsStatus !== 'success' ||
      loggedInitialLoadMilestonesRef.current.destinationsReady
    ) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.destinationsReady = true;
    logLoadPerfSince('home destinations ready', initialLoadStartedAtRef.current);
  }, [destinationsStatus]);

  useEffect(() => {
    if (!selectedDestinationId || loggedInitialLoadMilestonesRef.current.destinationSelected) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.destinationSelected = true;
    logLoadPerfSince(
      `home destination selected (${selectedDestinationId})`,
      initialLoadStartedAtRef.current
    );
  }, [selectedDestinationId]);

  useEffect(() => {
    if (
      trailsStatus !== 'success' ||
      !loadedPrimaryDestinationIds.length ||
      loggedInitialLoadMilestonesRef.current.trailsReady
    ) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.trailsReady = true;
    logLoadPerfSince('home primary trails ready', initialLoadStartedAtRef.current);
  }, [loadedPrimaryDestinationIds.length, trailsStatus]);

  useEffect(() => {
    if (
      !mapReady ||
      destinationsStatus !== 'success' ||
      !selectedDestinationId ||
      trailsStatus !== 'success' ||
      !loadedPrimaryDestinationIds.includes(selectedDestinationId) ||
      loggedInitialLoadMilestonesRef.current.complete
    ) {
      return;
    }

    loggedInitialLoadMilestonesRef.current.complete = true;
    logLoadPerfSince('home initial load complete', initialLoadStartedAtRef.current);
  }, [
    destinationsStatus,
    loadedPrimaryDestinationIds,
    mapReady,
    selectedDestinationId,
    trailsStatus,
  ]);

  return (
    <div className="page-shell">
      <ControlPanel
        onOpenInfo={() => setIsInfoPanelOpen(true)}
        trailColorMode={trailColorMode}
        onTrailColorModeChange={setTrailColorMode}
        selectedDestinationId={selectedDestinationId}
        onDestinationChange={(destinationId) =>
          updateSelectedDestination(destinationId, { manual: true })
        }
        destinationsStatus={destinationsStatus}
        trailsStatus={trailsStatus}
        mapError={mapError}
        requestError={requestError}
        destinations={destinations}
        selectedDestination={selectedDestination}
        activeTrailLegendItems={activeTrailLegendItems}
        isPlanningMode={isPlanning}
        onEnterPlanning={handleEnterPlanning}
        onShareRoute={handleShareRoute}
        onReloadPage={handleReloadPage}
      />

      {!isSettingsPanelOpen && !isInfoPanelOpen ? (
        <>
          <button
            type="button"
            className="map-overlay-icon-button"
            onClick={() => {
              setIsInfoPanelOpen(false);
              setIsSettingsPanelOpen(true);
            }}
            aria-label="Open map settings"
          >
            <img src="/icon.svg" alt="" className="map-overlay-icon-image" />
          </button>
          {selectedDestination && !isPlanning ? (
            <button
              type="button"
              className="map-overlay-icon-button map-plan-button"
              onClick={handleEnterPlanning}
              aria-label="Plan route"
            >
              <FaRoute aria-hidden="true" />
              <span className="sr-only">Plan route</span>
            </button>
          ) : null}
        </>
      ) : null}

      {isSettingsPanelOpen ? (
        <>
          <button
            type="button"
            className="mobile-overlay-backdrop"
            onClick={() => setIsSettingsPanelOpen(false)}
            aria-label="Close map settings"
          />
          <ControlPanel
            isOverlay
            onClose={() => setIsSettingsPanelOpen(false)}
            onOpenInfo={() => {
              setIsSettingsPanelOpen(false);
              setIsInfoPanelOpen(true);
            }}
            trailColorMode={trailColorMode}
            onTrailColorModeChange={setTrailColorMode}
            selectedDestinationId={selectedDestinationId}
            onDestinationChange={(destinationId) => {
              updateSelectedDestination(destinationId, { manual: true });
              setIsSettingsPanelOpen(false);
            }}
            destinationsStatus={destinationsStatus}
            trailsStatus={trailsStatus}
            mapError={mapError}
            requestError={requestError}
            destinations={destinations}
            selectedDestination={selectedDestination}
            activeTrailLegendItems={activeTrailLegendItems}
            isPlanningMode={isPlanning}
            onEnterPlanning={() => {
              handleEnterPlanning();
              setIsSettingsPanelOpen(false);
            }}
            onShareRoute={handleShareRoute}
            onReloadPage={handleReloadPage}
          />
        </>
      ) : null}

      <PlanningPanel
        isPlanning={isPlanning}
        routePlan={routePlan}
        routeGraph={routeGraph}
        routeElevationMetrics={routeElevationMetrics}
        routeAnchorElevationMetrics={routeAnchorElevationMetrics}
        isMacOS={isMacOS}
        isMobileHint={isMobileInteraction}
        onExitPlanning={handleExitPlanning}
        onClearPlan={handleClearPlan}
        onExportGpx={handleExportGpx}
        onShareRoute={handleShareRoute}
        onReverseRoute={handleReverseRoute}
        onSelectAnchor={handleSelectPlannedAnchor}
        onRemoveAnchor={handleRemoveAnchor}
      />

      {selectedTrail ? (
        <TrailDetailsPanel
          selectedTrail={selectedTrail}
          selectedTrailLengthKm={selectedTrailLengthKm}
          selectedTrailElevationMetrics={selectedTrailElevationMetrics}
          selectedRouteInsights={selectedRouteInsights}
          formatDistance={formatDistance}
          onClose={clearSelectedTrail}
        />
      ) : null}

      {isInfoPanelOpen ? <InfoPanel onClose={() => setIsInfoPanelOpen(false)} /> : null}

      <main className="map-stage">
        <div
          ref={mapContainer}
          className={`map-container${isInitialMapViewSettled ? ' map-container-ready' : ''}`}
        />
      </main>
    </div>
  );
}
