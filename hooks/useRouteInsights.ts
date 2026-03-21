import { useMemo } from 'react';
import {
  CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM,
  clampDistance,
} from '../lib/home-page';
import {
  findNearestRouteTraversalFeature,
  createRoutePlanGeoJson,
} from '../lib/planning-mode';
import {
  getRouteProgressMetrics,
  getTrailSelectionLengthInKilometers,
} from '../lib/map-domain';
import type { Coordinates, ElevationMetrics, TrailFeature, TrailFeatureCollection } from '../types/geo';
import type { RouteGraph, RoutePlan, RouteSummary, RouteTraversalSegment, SelectedRouteInsights } from '../types/route';

interface UseRouteInsightsArgs {
  routePlan: RoutePlan | null;
  routeGraph: RouteGraph | null;
  currentLocationCoordinates: Coordinates | null;
  selectedTrailFeature: TrailFeature | null;
  selectedTrailSectionFeature: TrailFeature | null;
  selectedTrailClickCoordinates: Coordinates | null;
  isPlanning: boolean;
  isRouteTravelingReverse: boolean;
  routeElevationMetrics: ElevationMetrics | null;
}

export function useRouteInsights({
  routePlan,
  routeGraph,
  currentLocationCoordinates,
  selectedTrailFeature,
  selectedTrailSectionFeature,
  selectedTrailClickCoordinates,
  isPlanning,
  isRouteTravelingReverse,
  routeElevationMetrics,
}: UseRouteInsightsArgs) {
  const routeTraversalGeoJson = useMemo(
    () => createRoutePlanGeoJson(routePlan, routeGraph).traversal as TrailFeatureCollection,
    [routeGraph, routePlan]
  );

  const routeTraversalSegments = useMemo<RouteTraversalSegment[]>(() => {
    let cumulativeDistanceKm = 0;

    return routeTraversalGeoJson.features.map((feature, index) => {
      const distanceKm = getTrailSelectionLengthInKilometers(feature);
      const segment = {
        feature,
        index: feature?.properties?.index ?? index,
        distanceKm,
        startKm: cumulativeDistanceKm,
        endKm: cumulativeDistanceKm + distanceKm,
      };

      cumulativeDistanceKm = segment.endKm;
      return segment;
    });
  }, [routeTraversalGeoJson]);

  const routeSummary = useMemo<RouteSummary>(
    () => ({
      totalSections: routeTraversalSegments.length,
      totalDistanceKm: routeTraversalSegments[routeTraversalSegments.length - 1]?.endKm || 0,
    }),
    [routeTraversalSegments]
  );

  const currentRouteProgress = useMemo(
    () => getRouteProgressMetrics(routeTraversalGeoJson, currentLocationCoordinates),
    [currentLocationCoordinates, routeTraversalGeoJson]
  );

  const isCurrentLocationOnRoute = Boolean(
    currentLocationCoordinates &&
      currentRouteProgress?.distanceToRouteKm <= CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM
  );

  const selectedRouteTraversalFeature = useMemo(
    () =>
      findNearestRouteTraversalFeature(
        routeTraversalGeoJson,
        selectedTrailFeature?.properties?.id,
        selectedTrailClickCoordinates
      ),
    [routeTraversalGeoJson, selectedTrailClickCoordinates, selectedTrailFeature]
  );

  const selectedRouteSegment = useMemo(() => {
    if (!selectedRouteTraversalFeature) {
      return null;
    }

    return (
      routeTraversalSegments.find(
        (segment) => segment.index === selectedRouteTraversalFeature.properties?.index
      ) || null
    );
  }, [routeTraversalSegments, selectedRouteTraversalFeature]);

  const selectedElevationFeature = useMemo(
    () => selectedRouteTraversalFeature || selectedTrailSectionFeature || selectedTrailFeature || null,
    [selectedRouteTraversalFeature, selectedTrailSectionFeature, selectedTrailFeature]
  );

  const selectedRouteInsights = useMemo<SelectedRouteInsights | null>(() => {
    if (isPlanning || !selectedRouteSegment || !routeSummary.totalSections) {
      return null;
    }

    const insights = {
      selectedSectionNumber: selectedRouteSegment.index + 1,
      totalSections: routeSummary.totalSections,
      totalDistanceKm: routeSummary.totalDistanceKm,
      selectedSectionDistanceKm: selectedRouteSegment.distanceKm,
      routeElevationMetrics,
      isLocationOnRoute: isCurrentLocationOnRoute,
      isReverse: isRouteTravelingReverse,
      currentSectionNumber: isCurrentLocationOnRoute
        ? (currentRouteProgress?.matchedFeature?.properties?.index ??
            currentRouteProgress?.matchedFeatureIndex ??
            -1) + 1
        : null,
      routeTraveledKm: isCurrentLocationOnRoute ? currentRouteProgress?.distanceTraveledKm ?? null : null,
      routeRemainingKm: isCurrentLocationOnRoute ? currentRouteProgress?.distanceRemainingKm ?? null : null,
      sectionTraveledKm: null,
      sectionRemainingKm: null,
    };

    if (!isCurrentLocationOnRoute || !currentRouteProgress) {
      return insights;
    }

    const sectionTraveledKm = clampDistance(
      currentRouteProgress.distanceTraveledKm - selectedRouteSegment.startKm,
      0,
      selectedRouteSegment.distanceKm
    );

    return {
      ...insights,
      sectionTraveledKm,
      sectionRemainingKm: Math.max(0, selectedRouteSegment.distanceKm - sectionTraveledKm),
    };
  }, [
    currentRouteProgress,
    isCurrentLocationOnRoute,
    isPlanning,
    isRouteTravelingReverse,
    routeElevationMetrics,
    routeSummary,
    selectedRouteSegment,
  ]);

  return {
    routeTraversalGeoJson,
    routeTraversalSegments,
    routeSummary,
    currentRouteProgress,
    isCurrentLocationOnRoute,
    selectedRouteTraversalFeature,
    selectedRouteSegment,
    selectedElevationFeature,
    selectedRouteInsights,
  };
}