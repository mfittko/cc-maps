import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { NextRouter } from 'next/router';
import { MAP_SETTINGS_STORAGE_KEY, getRouteDestinationIds, routeIncludesDestination } from '../lib/home-page';
import { getSingleQueryValue, isPlanningModeQueryValue } from '../lib/map-persistence';
import { reorderAnchorEdgeIds } from '../lib/planning-mode';
import {
  clearStoredRoutePlan,
  createRoutePlan,
  decodeRoutePlanFromUrl,
  encodeRoutePlanToUrl,
  hydrateRoutePlan,
  shouldRestoreHydratedRoutePlan,
  writeStoredRoutePlan,
} from '../lib/route-plan';
import type { MapView } from '../types/geo';
import type { RouteGraph, RoutePlan } from '../types/route';

interface PersistedRouteSelection {
  routeFromUrl: RoutePlan | null;
  routeFromStorage: RoutePlan | null;
  persistedRoutePlan: RoutePlan | null;
}

interface UseRoutePlanSyncArgs {
  router: NextRouter;
  hasInitializedFromUrlRef: MutableRefObject<boolean>;
  shouldOpenPlanningFromUrlRef: MutableRefObject<boolean>;
  shouldPreserveMapViewRef: MutableRefObject<boolean>;
  pendingRouteViewportFitRef: MutableRefObject<string>;
  hydratedRoutePlanKeyRef: MutableRefObject<string>;
  dismissedPlanningRouteKeyRef: MutableRefObject<string>;
  persistedRouteOwnerDestinationIdRef: MutableRefObject<string>;
  selectedDestinationId: string;
  routePlan: RoutePlan | null;
  setRoutePlan: Dispatch<SetStateAction<RoutePlan | null>>;
  routeGraph: RouteGraph | null;
  loadedPrimaryDestinationIds: string[];
  persistedRouteSelection: PersistedRouteSelection;
  mapView: MapView | null;
  isPlanning: boolean;
  setIsPlanning: Dispatch<SetStateAction<boolean>>;
}

interface EmptyPlanningInitializationArgs {
  hasInitializedFromUrl: boolean;
  shouldOpenPlanningFromUrl: boolean;
  persistedRoutePlan: RoutePlan | null;
  selectedDestinationId: string;
  isPlanning: boolean;
}

interface PreserveRouteQueryArgs {
  encodedRoutePlan: string;
  routeFromCurrentUrl: RoutePlan | null;
  selectedDestinationId: string;
  dismissedRoutePlanKey?: string;
}

export function shouldInitializeEmptyPlanningRoute({
  hasInitializedFromUrl,
  shouldOpenPlanningFromUrl,
  persistedRoutePlan,
  selectedDestinationId,
  isPlanning,
}: EmptyPlanningInitializationArgs) {
  return Boolean(
    hasInitializedFromUrl &&
      shouldOpenPlanningFromUrl &&
      persistedRoutePlan === null &&
      selectedDestinationId &&
      !isPlanning
  );
}

export function shouldHydratePersistedRoutePlan(
  routePlan: RoutePlan | null | undefined,
  dismissedRoutePlanKey = ''
) {
  if (!routePlan) {
    return false;
  }

  const routePlanKey = encodeRoutePlanToUrl(routePlan) || '';

  return routePlanKey === '' || routePlanKey !== dismissedRoutePlanKey;
}

export function shouldPreserveRouteQueryWhenClearingPlan({
  encodedRoutePlan,
  routeFromCurrentUrl,
  selectedDestinationId,
  dismissedRoutePlanKey = '',
}: PreserveRouteQueryArgs) {
  if (encodedRoutePlan || !routeIncludesDestination(routeFromCurrentUrl, selectedDestinationId)) {
    return false;
  }

  const currentRouteKey = encodeRoutePlanToUrl(routeFromCurrentUrl) || '';

  return currentRouteKey === '' || currentRouteKey !== dismissedRoutePlanKey;
}

export function useRoutePlanSync({
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
}: UseRoutePlanSyncArgs) {
  useEffect(() => {
    if (!router.isReady || hasInitializedFromUrlRef.current) {
      return;
    }

    shouldOpenPlanningFromUrlRef.current = isPlanningModeQueryValue(
      getSingleQueryValue(router.query.planning)
    );
  }, [hasInitializedFromUrlRef, router.isReady, router.query.planning, shouldOpenPlanningFromUrlRef]);

  useEffect(() => {
    if (
      !shouldInitializeEmptyPlanningRoute({
        hasInitializedFromUrl: hasInitializedFromUrlRef.current,
        shouldOpenPlanningFromUrl: shouldOpenPlanningFromUrlRef.current,
        persistedRoutePlan: persistedRouteSelection.persistedRoutePlan,
        selectedDestinationId,
        isPlanning,
      })
    ) {
      return;
    }

    setIsPlanning(true);
    setRoutePlan((currentPlan) => currentPlan ?? createRoutePlan(selectedDestinationId, []));
    shouldOpenPlanningFromUrlRef.current = false;
  }, [
    hasInitializedFromUrlRef,
    isPlanning,
    persistedRouteSelection.persistedRoutePlan,
    selectedDestinationId,
    setIsPlanning,
    setRoutePlan,
    shouldOpenPlanningFromUrlRef,
  ]);

  useEffect(() => {
    if (!router.isReady || !selectedDestinationId || !routeGraph || routePlan !== null) {
      return;
    }

    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const { routeFromUrl, persistedRoutePlan: nextRoutePlan } = persistedRouteSelection;
    const requiredPrimaryDestinationIds = getRouteDestinationIds(nextRoutePlan);

    if (
      requiredPrimaryDestinationIds.some(
        (destinationId) => !loadedPrimaryDestinationIds.includes(destinationId)
      )
    ) {
      return;
    }

    const nextRouteKey = nextRoutePlan ? encodeRoutePlanToUrl(nextRoutePlan) || '' : '';
    const hydrationScopeKey = `${selectedDestinationId}:${requiredPrimaryDestinationIds.join(',')}:${nextRouteKey}`;
    const isPlanningRequestedFromUrl = isPlanningModeQueryValue(
      searchParams?.get('planning') ?? getSingleQueryValue(router.query.planning)
    );
    const shouldHydrateRoutePlan = shouldHydratePersistedRoutePlan(
      nextRoutePlan,
      dismissedPlanningRouteKeyRef.current
    );
    const shouldRestorePlanningMode = routeFromUrl
      ? isPlanningRequestedFromUrl
      : shouldRestoreHydratedRoutePlan(nextRoutePlan, dismissedPlanningRouteKeyRef.current);

    if (hydratedRoutePlanKeyRef.current === hydrationScopeKey) {
      return;
    }

    hydratedRoutePlanKeyRef.current = hydrationScopeKey;

    if (!shouldHydrateRoutePlan) {
      return;
    }

    const hydratedRoutePlan = hydrateRoutePlan(nextRoutePlan, routeGraph);
    const hasExplicitMapViewQuery = Boolean(
      searchParams?.get('lng') && searchParams?.get('lat') && searchParams?.get('zoom')
    );

    if (
      routeFromUrl &&
      !hasExplicitMapViewQuery &&
      !shouldPreserveMapViewRef.current &&
      !mapView &&
      nextRouteKey
    ) {
      pendingRouteViewportFitRef.current = nextRouteKey;
    }

    if (!hydratedRoutePlan.validAnchorEdgeIds.length && nextRoutePlan.anchorEdgeIds.length) {
      setRoutePlan(nextRoutePlan);
      if (shouldRestorePlanningMode) {
        setIsPlanning(true);
      }
      return;
    }

    const reorderedRoutePlan = createRoutePlan(
      nextRoutePlan.destinationId,
      reorderAnchorEdgeIds(hydratedRoutePlan.validAnchorEdgeIds, routeGraph),
      nextRoutePlan.destinationIds
    );

    setRoutePlan(reorderedRoutePlan);
    if (reorderedRoutePlan.anchorEdgeIds.length && shouldRestorePlanningMode) {
      setIsPlanning(true);
    }
  }, [
    dismissedPlanningRouteKeyRef,
    hydratedRoutePlanKeyRef,
    loadedPrimaryDestinationIds,
    mapView,
    pendingRouteViewportFitRef,
    persistedRouteSelection,
    routeGraph,
    routePlan,
    router.isReady,
    router.query.planning,
    selectedDestinationId,
    setIsPlanning,
    setRoutePlan,
    shouldPreserveMapViewRef,
  ]);

  useEffect(() => {
    if (!router.isReady || !hasInitializedFromUrlRef.current || typeof window === 'undefined') {
      return;
    }

    const nextUrl = new URL(window.location.href);
    const routeFromCurrentUrl = decodeRoutePlanFromUrl(nextUrl.searchParams.get('route'));
    const encodedRoutePlan =
      routePlan && routePlan.anchorEdgeIds.length ? encodeRoutePlanToUrl(routePlan) : '';

    if (
      shouldPreserveRouteQueryWhenClearingPlan({
        encodedRoutePlan,
        routeFromCurrentUrl,
        selectedDestinationId,
        dismissedRoutePlanKey: dismissedPlanningRouteKeyRef.current,
      })
    ) {
      return;
    }

    if (encodedRoutePlan) {
      nextUrl.searchParams.set('route', encodedRoutePlan);
    } else {
      nextUrl.searchParams.delete('route');
    }

    const currentRoute = new URLSearchParams(window.location.search).get('route') || '';
    const nextRoute = nextUrl.searchParams.get('route') || '';

    if (currentRoute === nextRoute) {
      return;
    }

    window.history.replaceState(window.history.state, '', nextUrl);
  }, [dismissedPlanningRouteKeyRef, hasInitializedFromUrlRef, routePlan, router, selectedDestinationId]);

  useEffect(() => {
    if (!router.isReady || !hasInitializedFromUrlRef.current || typeof window === 'undefined') {
      return;
    }

    const nextUrl = new URL(window.location.href);
    const currentPlanning = nextUrl.searchParams.get('planning') || '';
    const nextPlanning = isPlanning ? '1' : '';

    if (nextPlanning) {
      nextUrl.searchParams.set('planning', nextPlanning);
    } else {
      nextUrl.searchParams.delete('planning');
    }

    if (currentPlanning === nextPlanning) {
      return;
    }

    window.history.replaceState(window.history.state, '', nextUrl);
  }, [hasInitializedFromUrlRef, isPlanning, router.isReady]);

  useEffect(() => {
    if (!hasInitializedFromUrlRef.current) {
      return;
    }

    if (routePlan?.anchorEdgeIds.length) {
      writeStoredRoutePlan(routePlan, MAP_SETTINGS_STORAGE_KEY);
      persistedRouteOwnerDestinationIdRef.current = routePlan.destinationId;
      return;
    }

    const destinationIdToClear =
      persistedRouteOwnerDestinationIdRef.current || routePlan?.destinationId || selectedDestinationId;

    clearStoredRoutePlan(destinationIdToClear, MAP_SETTINGS_STORAGE_KEY);
    persistedRouteOwnerDestinationIdRef.current = '';
  }, [hasInitializedFromUrlRef, persistedRouteOwnerDestinationIdRef, routePlan, selectedDestinationId]);
}