import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { ROUTE_DIRECTION_CHANGE_THRESHOLD_KM } from '../lib/home-page';
import type { Coordinates } from '../types/geo';
import type { GraphEdge, RouteGraph, RoutePlan, RouteProgressMetrics, TrailColorMode } from '../types/route';

interface UseRouteDirectionTrackingArgs {
  currentLocationCoordinates: Coordinates | null;
  currentRouteProgress: RouteProgressMetrics | null;
  isCurrentLocationOnRoute: boolean;
  isPlanning: boolean;
  routeGraph: RouteGraph | null;
  routePlan: RoutePlan | null;
  selectedRouteTraversalFeature: { properties?: { edgeId?: string | null } } | null;
  wasCurrentLocationOnRouteRef: MutableRefObject<boolean>;
  lastRouteProgressDistanceKmRef: MutableRefObject<number | null>;
  setIsRouteTravelingReverse: Dispatch<SetStateAction<boolean>>;
  selectRouteEdge: (edge: GraphEdge | null | undefined, clickedCoordinates?: Coordinates | null) => boolean;
}

export function useRouteDirectionTracking({
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
}: UseRouteDirectionTrackingArgs) {
  useEffect(() => {
    wasCurrentLocationOnRouteRef.current = false;
    lastRouteProgressDistanceKmRef.current = null;
    setIsRouteTravelingReverse(false);
  }, [
    isPlanning,
    lastRouteProgressDistanceKmRef,
    routePlan,
    setIsRouteTravelingReverse,
    wasCurrentLocationOnRouteRef,
  ]);

  useEffect(() => {
    if (
      isPlanning ||
      !routePlan?.anchorEdgeIds?.length ||
      !currentRouteProgress ||
      !isCurrentLocationOnRoute
    ) {
      wasCurrentLocationOnRouteRef.current = false;
      lastRouteProgressDistanceKmRef.current = null;
      setIsRouteTravelingReverse(false);
      return;
    }

    const currentDistanceKm = currentRouteProgress.distanceTraveledKm;

    if (!wasCurrentLocationOnRouteRef.current) {
      wasCurrentLocationOnRouteRef.current = true;
      lastRouteProgressDistanceKmRef.current = currentDistanceKm;
      setIsRouteTravelingReverse(false);

      if (!selectedRouteTraversalFeature) {
        const matchedEdge = routeGraph?.edges?.get(
          currentRouteProgress.matchedFeature?.properties?.edgeId || ''
        );

        if (matchedEdge) {
          selectRouteEdge(matchedEdge, currentLocationCoordinates);
        }
      }

      return;
    }

    const previousDistanceKm = lastRouteProgressDistanceKmRef.current;

    if (typeof previousDistanceKm !== 'number') {
      lastRouteProgressDistanceKmRef.current = currentDistanceKm;
      return;
    }

    const deltaKm = currentDistanceKm - previousDistanceKm;

    if (Math.abs(deltaKm) < ROUTE_DIRECTION_CHANGE_THRESHOLD_KM) {
      return;
    }

    lastRouteProgressDistanceKmRef.current = currentDistanceKm;
    setIsRouteTravelingReverse(deltaKm < 0);
  }, [
    currentLocationCoordinates,
    currentRouteProgress,
    isCurrentLocationOnRoute,
    isPlanning,
    lastRouteProgressDistanceKmRef,
    routeGraph,
    routePlan,
    selectRouteEdge,
    selectedRouteTraversalFeature,
    setIsRouteTravelingReverse,
    wasCurrentLocationOnRouteRef,
  ]);
}