import type { TrailFeature, Coordinates, ElevationMetrics } from './geo';

export interface RoutePlan {
  version: number;
  destinationId: string;
  destinationIds: string[];
  anchorEdgeIds: string[];
}

export interface HydrationResult {
  status: 'ok' | 'partial' | 'empty';
  validAnchorEdgeIds: string[];
  staleAnchorEdgeIds: string[];
}

export interface GraphNode {
  id: string;
  coordinates: Coordinates;
  kind: 'crossing' | 'endpoint';
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  destinationId: string | null;
  coordinates: Coordinates[];
  distanceKm: number;
  trailFeatureId: string | number | null;
  trailType: number | null;
  freshness: number | null;
}

export interface RouteGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
}

export interface RouteTraversalSegment {
  feature: TrailFeature;
  index: number;
  distanceKm: number;
  startKm: number;
  endKm: number;
}

export interface RouteProgressMetrics {
  matchedFeature: TrailFeature;
  matchedFeatureIndex: number;
  distanceAlongFeatureKm: number;
  distanceToRouteKm: number;
  distanceTraveledKm: number;
  distanceRemainingKm: number;
  segmentDistanceKm: number;
  segmentStartKm: number;
  segmentEndKm: number;
  segmentRemainingKm: number;
  totalDistanceKm: number;
}

export interface RouteSummary {
  totalSections: number;
  totalDistanceKm: number;
}

export interface SelectedRouteInsights {
  selectedSectionNumber: number;
  totalSections: number;
  totalDistanceKm: number;
  selectedSectionDistanceKm: number;
  routeElevationMetrics: ElevationMetrics | null;
  isLocationOnRoute: boolean;
  isReverse: boolean;
  currentSectionNumber: number | null;
  routeTraveledKm: number | null;
  routeRemainingKm: number | null;
  sectionTraveledKm: number | null;
  sectionRemainingKm: number | null;
}

export type TrailColorMode = 'type' | 'freshness';