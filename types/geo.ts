import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  LineString,
  MultiLineString,
  Point,
} from 'geojson';

export type Coordinates = [number, number];
export type LineCoordinates = Coordinates[];
export type TrailGeometry = LineString | MultiLineString;

export interface DestinationProperties extends GeoJsonProperties {
  id: string | number;
  name: string;
  prepsymbol?: number | null;
}

export interface DestinationSummary {
  id: string;
  name: string;
  prepSymbol?: number | null;
  coordinates: Coordinates;
}

export interface TrailProperties extends GeoJsonProperties {
  id: string | number;
  destinationid?: string | number | null;
  trailtypesymbol?: number | null;
  prepsymbol?: number | null;
  warningtext?: string;
  has_classic?: boolean;
  has_skating?: boolean;
  has_floodlight?: boolean;
  is_scootertrail?: boolean;
}

export interface RouteDirectionProperties extends GeoJsonProperties {
  role: 'direction';
  edgeId: string;
  index: number;
}

export type TrailFeature = Feature<TrailGeometry, TrailProperties>;
export type TrailFeatureCollection = FeatureCollection<TrailGeometry, TrailProperties>;
export type DestinationFeature = Feature<Point, DestinationProperties>;
export type DestinationFeatureCollection = FeatureCollection<Point, DestinationProperties>;
export type RouteDirectionFeature = Feature<LineString, RouteDirectionProperties>;
export type RouteDirectionFeatureCollection = FeatureCollection<LineString, RouteDirectionProperties>;

export interface ElevationMetrics {
  ascentMeters: number;
  descentMeters: number;
}

export interface MapView {
  longitude: number;
  latitude: number;
  zoom: number;
}

export interface GeoBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface LegendItem {
  code: number;
  label: string;
  color: string;
}

export interface TrailCrossing {
  coordinates: Coordinates;
  distanceFromStartKm: number;
}

export interface TrailSegmentSummary {
  fromLabel: string;
  toLabel: string;
  startDistanceKm: number;
  endDistanceKm: number;
  distanceKm: number;
  midpointCoordinates: Coordinates | null;
  trailFeatureId?: string | number | null;
}

export interface TrailCrossingMetrics {
  crossings: TrailCrossing[];
  segments: TrailSegmentSummary[];
  totalLengthKm: number;
}