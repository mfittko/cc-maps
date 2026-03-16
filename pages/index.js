import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import mapboxgl from 'mapbox-gl';
import {
  FaCircleInfo,
  FaLayerGroup,
  FaLocationDot,
  FaMountain,
  FaPersonSkiingNordic,
  FaSnowflake,
  FaXmark,
} from 'react-icons/fa6';
import { DESTINATION_PREP_STYLES, TRAIL_TYPE_STYLES } from '../lib/sporet';

const DEFAULT_CENTER = [10.7522, 59.9139];
const WINTER_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';
const DESTINATIONS_SOURCE_ID = 'destinations';
const DESTINATIONS_LAYER_ID = 'destinations-layer';
const SUGGESTED_DESTINATION_SOURCE_ID = 'suggested-destination';
const SUGGESTED_DESTINATION_RING_LAYER_ID = 'suggested-destination-ring-layer';
const SUGGESTED_DESTINATION_DOT_LAYER_ID = 'suggested-destination-dot-layer';
const SUGGESTED_DESTINATION_LABEL_LAYER_ID = 'suggested-destination-label-layer';
const TRAILS_SOURCE_ID = 'trails';
const TRAILS_LAYER_ID = 'trails-layer';
const TRAILS_HIT_LAYER_ID = 'trails-hit-layer';
const SUGGESTED_TRAILS_SOURCE_ID = 'suggested-trails';
const SUGGESTED_TRAILS_LAYER_ID = 'suggested-trails-layer';
const SUGGESTED_TRAILS_HIT_LAYER_ID = 'suggested-trails-hit-layer';
const TRAIL_SEGMENT_LABELS_SOURCE_ID = 'trail-segment-labels';
const TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID = 'trail-segment-labels-glow-layer';
const TRAIL_SEGMENT_LABELS_LAYER_ID = 'trail-segment-labels-layer';
const DEM_SOURCE_ID = 'mapbox-dem';
const BUILDINGS_LAYER_ID = '3d-buildings';
const DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM = 1.25;
const MIN_SEGMENT_DISTANCE_KM = 0.05;
const TRAIL_SEGMENT_LABELS_MIN_ZOOM = 12;
const DEFAULT_TRAIL_COLOR_MODE = 'freshness';
const MAP_SETTINGS_STORAGE_KEY = 'cc-maps:settings';
const DESTINATION_SUGGESTION_DEBOUNCE_MS = 700;
const SUGGESTED_DESTINATION_RADIUS_KM = 20;
const TRAILS_CACHE_TTL_MS = 15 * 60 * 1000;
const TRAIL_HIT_LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 7, 12, 11, 18];

const trailLegendItems = Object.entries(TRAIL_TYPE_STYLES)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => ({ code: Number(key), ...value }));

const freshnessLegendItems = Object.entries(DESTINATION_PREP_STYLES)
  .filter(([key]) => key !== 'default')
  .map(([key, value]) => ({ code: Number(key), ...value }));

function buildMatchExpression(propertyName, styles) {
  const expression = ['match', ['coalesce', ['to-number', ['get', propertyName]], -1]];

  Object.entries(styles).forEach(([key, value]) => {
    if (key === 'default') {
      return;
    }

    expression.push(Number(key), value.color);
  });

  expression.push(styles.default.color);

  return expression;
}

function getTrailColorExpression(colorMode) {
  if (colorMode === 'freshness') {
    return buildMatchExpression('prepsymbol', DESTINATION_PREP_STYLES);
  }

  return buildMatchExpression('trailtypesymbol', TRAIL_TYPE_STYLES);
}

function extendBounds(bounds, coordinates) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    bounds.extend(coordinates);
    return;
  }

  coordinates.forEach((coordinateSet) => extendBounds(bounds, coordinateSet));
}

function fitMapToGeoJson(map, geojson, fallbackCenter) {
  const bounds = new mapboxgl.LngLatBounds();
  let hasCoordinates = false;

  geojson.features.forEach((feature) => {
    if (!feature.geometry?.coordinates) {
      return;
    }

    extendBounds(bounds, feature.geometry.coordinates);
    hasCoordinates = true;
  });

  if (hasCoordinates) {
    map.fitBounds(bounds, { padding: 48, duration: 900, maxZoom: 12 });
    return;
  }

  if (fallbackCenter) {
    map.flyTo({ center: fallbackCenter, zoom: 11, duration: 900 });
  }
}

function getDestinationSummary(feature) {
  return {
    id: String(feature.properties.id),
    name: feature.properties.name,
    prepSymbol: feature.properties.prepsymbol,
    coordinates: feature.geometry?.coordinates || DEFAULT_CENTER,
  };
}

function getSuggestedDestinationGeoJson(destinations) {
  if (!destinations?.length) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  return {
    type: 'FeatureCollection',
    features: destinations.map((destination) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: destination.coordinates,
      },
      properties: {
        id: destination.id,
        name: destination.name,
      },
    })),
  };
}

function getDestinationsWithinRadius(destinations, referenceCoordinates, radiusKm, excludedId) {
  if (!referenceCoordinates) {
    return [];
  }

  return destinations.filter((destination) => {
    if (destination.id === excludedId) {
      return false;
    }

    return getDistanceInKilometers(referenceCoordinates, destination.coordinates) <= radiusKm;
  });
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function getDistanceInKilometers(fromCoordinates, toCoordinates) {
  const [fromLng, fromLat] = fromCoordinates;
  const [toLng, toLat] = toCoordinates;
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getLineStrings(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === 'LineString') {
    return [geometry.coordinates || []];
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates || [];
  }

  return [];
}

function getLineLengthInKilometers(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return 0;
  }

  return coordinates.reduce((total, coordinate, index) => {
    if (index === 0) {
      return total;
    }

    return total + getDistanceInKilometers(coordinates[index - 1], coordinate);
  }, 0);
}

function getFeatureLengthInKilometers(feature) {
  return getLineStrings(feature?.geometry).reduce(
    (total, coordinates) => total + getLineLengthInKilometers(coordinates),
    0
  );
}

function getCoordinateAlongTrail(feature, targetDistanceKm) {
  const lineStrings = getLineStrings(feature?.geometry);
  let traversedDistanceKm = 0;

  for (const coordinates of lineStrings) {
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      const segmentLengthKm = getDistanceInKilometers(start, end);

      if (traversedDistanceKm + segmentLengthKm >= targetDistanceKm) {
        const remainingDistanceKm = targetDistanceKm - traversedDistanceKm;
        const segmentRatio = segmentLengthKm === 0 ? 0 : remainingDistanceKm / segmentLengthKm;

        return [
          start[0] + (end[0] - start[0]) * segmentRatio,
          start[1] + (end[1] - start[1]) * segmentRatio,
        ];
      }

      traversedDistanceKm += segmentLengthKm;
    }
  }

  const endpoints = getTrailEndpoints(feature);
  return endpoints.end || endpoints.start || null;
}

function getTrailEndpoints(feature) {
  const lineStrings = getLineStrings(feature?.geometry).filter((coordinates) => coordinates.length);

  if (!lineStrings.length) {
    return { start: null, end: null };
  }

  const firstLine = lineStrings[0];
  const lastLine = lineStrings[lineStrings.length - 1];

  return {
    start: firstLine[0],
    end: lastLine[lastLine.length - 1],
  };
}

function getNearestDestinationLabel(referenceCoordinates, destinations) {
  if (!referenceCoordinates || !destinations.length) {
    return null;
  }

  const closestDestination = findClosestDestination(destinations, referenceCoordinates);

  if (!closestDestination) {
    return null;
  }

  const distanceKm = getDistanceInKilometers(referenceCoordinates, closestDestination.coordinates);

  return distanceKm <= DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM ? closestDestination.name : null;
}

function normalizePathPoints(pathPoints) {
  return pathPoints.reduce((normalizedPoints, point) => {
    const previousPoint = normalizedPoints[normalizedPoints.length - 1];

    if (!previousPoint) {
      normalizedPoints.push(point);
      return normalizedPoints;
    }

    if (
      Math.abs(point.distanceFromStartKm - previousPoint.distanceFromStartKm) < MIN_SEGMENT_DISTANCE_KM
    ) {
      if (point.kind === 'end') {
        normalizedPoints[normalizedPoints.length - 1] = point;
      }

      return normalizedPoints;
    }

    normalizedPoints.push(point);
    return normalizedPoints;
  }, []);
}

function buildTrailSegments(selectedTrailFeature, crossingMetrics, destinations) {
  if (!selectedTrailFeature || !crossingMetrics) {
    return [];
  }

  const endpoints = getTrailEndpoints(selectedTrailFeature);
  const pathPoints = normalizePathPoints([
    {
      kind: 'start',
      label: getNearestDestinationLabel(endpoints.start, destinations) || 'Trail start',
      distanceFromStartKm: 0,
    },
    ...crossingMetrics.crossings.map((crossing, index) => ({
      kind: 'crossing',
      label: `Crossing ${index + 1}`,
      distanceFromStartKm: crossing.distanceFromStartKm,
    })),
    {
      kind: 'end',
      label: getNearestDestinationLabel(endpoints.end, destinations) || 'Trail end',
      distanceFromStartKm: crossingMetrics.totalLengthKm,
    },
  ]);

  return pathPoints.slice(1).map((point, index) => {
    const startDistanceKm = pathPoints[index].distanceFromStartKm;
    const endDistanceKm = point.distanceFromStartKm;

    return {
      fromLabel: pathPoints[index].label,
      toLabel: point.label,
      distanceKm: endDistanceKm - startDistanceKm,
      midpointCoordinates: getCoordinateAlongTrail(
        selectedTrailFeature,
        startDistanceKm + (endDistanceKm - startDistanceKm) / 2
      ),
    };
  }).filter((segment) => segment.distanceKm >= MIN_SEGMENT_DISTANCE_KM);
}

function getTrailSegmentLabelsGeoJson(segments) {
  return {
    type: 'FeatureCollection',
    features: segments
      .filter((segment) => Array.isArray(segment.midpointCoordinates))
      .map((segment, index) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: segment.midpointCoordinates,
        },
        properties: {
          id: String(index),
          label: formatDistance(segment.distanceKm),
          route: `${segment.fromLabel} to ${segment.toLabel}`,
        },
      })),
  };
}

function getAllTrailSegmentLabelsGeoJson(trailsGeoJson, destinations) {
  if (!trailsGeoJson?.features?.length) {
    return getTrailSegmentLabelsGeoJson([]);
  }

  const allSegments = trailsGeoJson.features.flatMap((feature) => {
    const crossingMetrics = getCrossingMetrics(feature, trailsGeoJson, destinations);
    return crossingMetrics?.segments || [];
  });

  return getTrailSegmentLabelsGeoJson(allSegments);
}

function getSegmentIntersection(firstStart, firstEnd, secondStart, secondEnd) {
  const firstDeltaLng = firstEnd[0] - firstStart[0];
  const firstDeltaLat = firstEnd[1] - firstStart[1];
  const secondDeltaLng = secondEnd[0] - secondStart[0];
  const secondDeltaLat = secondEnd[1] - secondStart[1];
  const denominator = firstDeltaLng * secondDeltaLat - firstDeltaLat * secondDeltaLng;

  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const startDeltaLng = secondStart[0] - firstStart[0];
  const startDeltaLat = secondStart[1] - firstStart[1];
  const firstFactor =
    (startDeltaLng * secondDeltaLat - startDeltaLat * secondDeltaLng) / denominator;
  const secondFactor =
    (startDeltaLng * firstDeltaLat - startDeltaLat * firstDeltaLng) / denominator;

  if (firstFactor < 0 || firstFactor > 1 || secondFactor < 0 || secondFactor > 1) {
    return null;
  }

  return {
    coordinates: [
      firstStart[0] + firstFactor * firstDeltaLng,
      firstStart[1] + firstFactor * firstDeltaLat,
    ],
    firstFactor,
  };
}

function dedupeCrossings(crossings) {
  const sortedCrossings = [...crossings].sort(
    (left, right) => left.distanceFromStartKm - right.distanceFromStartKm
  );

  return sortedCrossings.reduce((uniqueCrossings, crossing) => {
    const lastCrossing = uniqueCrossings[uniqueCrossings.length - 1];

    if (
      lastCrossing &&
      Math.abs(lastCrossing.distanceFromStartKm - crossing.distanceFromStartKm) < 0.02 &&
      getDistanceInKilometers(lastCrossing.coordinates, crossing.coordinates) < 0.02
    ) {
      return uniqueCrossings;
    }

    uniqueCrossings.push(crossing);
    return uniqueCrossings;
  }, []);
}

function getCrossingMetrics(selectedTrailFeature, trailsGeoJson, destinations) {
  if (!selectedTrailFeature || !trailsGeoJson?.features?.length) {
    return null;
  }

  const selectedTrailId = selectedTrailFeature.properties?.id;
  const crossings = [];
  let traversedDistanceKm = 0;

  getLineStrings(selectedTrailFeature.geometry).forEach((selectedCoordinates) => {
    for (let index = 1; index < selectedCoordinates.length; index += 1) {
      const selectedStart = selectedCoordinates[index - 1];
      const selectedEnd = selectedCoordinates[index];
      const selectedSegmentLengthKm = getDistanceInKilometers(selectedStart, selectedEnd);

      trailsGeoJson.features.forEach((candidateFeature) => {
        if (candidateFeature.properties?.id === selectedTrailId) {
          return;
        }

        getLineStrings(candidateFeature.geometry).forEach((candidateCoordinates) => {
          for (let candidateIndex = 1; candidateIndex < candidateCoordinates.length; candidateIndex += 1) {
            const candidateStart = candidateCoordinates[candidateIndex - 1];
            const candidateEnd = candidateCoordinates[candidateIndex];
            const intersection = getSegmentIntersection(
              selectedStart,
              selectedEnd,
              candidateStart,
              candidateEnd
            );

            if (!intersection) {
              continue;
            }

            crossings.push({
              coordinates: intersection.coordinates,
              distanceFromStartKm:
                traversedDistanceKm + selectedSegmentLengthKm * intersection.firstFactor,
            });
          }
        });
      });

      traversedDistanceKm += selectedSegmentLengthKm;
    }
  });

  const uniqueCrossings = dedupeCrossings(crossings);
  const crossingIntervals = uniqueCrossings.slice(1).map((crossing, index) => ({
    fromCrossing: index + 1,
    toCrossing: index + 2,
    distanceKm: crossing.distanceFromStartKm - uniqueCrossings[index].distanceFromStartKm,
  }));

  return {
    crossings: uniqueCrossings,
    crossingIntervals,
    segments: buildTrailSegments(selectedTrailFeature, {
      crossings: uniqueCrossings,
      totalLengthKm: getFeatureLengthInKilometers(selectedTrailFeature),
    }, destinations),
    totalLengthKm: getFeatureLengthInKilometers(selectedTrailFeature),
  };
}

function formatDistance(distanceKm) {
  return `${distanceKm.toFixed(1)} km`;
}

function getSingleQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isTrailColorMode(value) {
  return value === 'type' || value === 'freshness';
}

function parseMapViewValue(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getMapViewFromValues(longitudeValue, latitudeValue, zoomValue) {
  const longitude = parseMapViewValue(longitudeValue);
  const latitude = parseMapViewValue(latitudeValue);
  const zoom = parseMapViewValue(zoomValue);

  if (longitude === null || latitude === null || zoom === null) {
    return null;
  }

  return { longitude, latitude, zoom };
}

function readStoredMapSettings() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(MAP_SETTINGS_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('Failed to read stored map settings', error);
    return null;
  }
}

function getTrailCacheStorageKey(destinationId) {
  return `${MAP_SETTINGS_STORAGE_KEY}:trails:${destinationId}`;
}

function readCachedTrailGeoJson(destinationId) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getTrailCacheStorageKey(destinationId));

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (
      !parsedValue?.cachedAt ||
      !parsedValue?.data ||
      Date.now() - parsedValue.cachedAt > TRAILS_CACHE_TTL_MS
    ) {
      window.localStorage.removeItem(getTrailCacheStorageKey(destinationId));
      return null;
    }

    return parsedValue.data;
  } catch (error) {
    console.warn(`Failed to read cached trails for destination ${destinationId}`, error);
    return null;
  }
}

function writeCachedTrailGeoJson(destinationId, data) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getTrailCacheStorageKey(destinationId),
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      })
    );
  } catch (error) {
    console.warn(`Failed to cache trails for destination ${destinationId}`, error);
  }
}

function findClosestDestination(destinations, referenceCoordinates) {
  if (!destinations.length) {
    return null;
  }

  return destinations.reduce((closestDestination, candidate) => {
    if (!closestDestination) {
      return candidate;
    }

    const closestDistance = getDistanceInKilometers(
      referenceCoordinates,
      closestDestination.coordinates
    );
    const candidateDistance = getDistanceInKilometers(referenceCoordinates, candidate.coordinates);

    return candidateDistance < closestDistance ? candidate : closestDestination;
  }, null);
}

function findClosestAlternativeDestination(destinations, referenceCoordinates, excludedDestinationId) {
  return findClosestDestination(
    destinations.filter((destination) => destination.id !== excludedDestinationId),
    referenceCoordinates
  );
}

function setLayerPaintIfPresent(map, layerId, property, value) {
  const layer = map.getLayer(layerId);

  if (!layer) {
    return;
  }

  try {
    map.setPaintProperty(layerId, property, value);
  } catch (error) {
    console.warn(`Skipped winter paint override for ${layerId}.${property}`, error);
  }
}

function applyWinterBasemap(map) {
  const layers = map.getStyle().layers || [];

  layers.forEach((layer) => {
    const layerId = layer.id;

    if (layer.type === 'background') {
      setLayerPaintIfPresent(map, layerId, 'background-color', '#eef4f8');
    }

    if (layer.type === 'fill' && /(park|forest|wood|grass|landuse|nature|wetland)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', '#e7eff2');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', 0.85);
    }

    if (layer.type === 'fill' && /(snow|glacier|ice|water)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'fill-color', layerId.includes('water') ? '#c8dced' : '#f7fbfe');
      setLayerPaintIfPresent(map, layerId, 'fill-opacity', layerId.includes('water') ? 0.9 : 0.95);
    }

    if (layer.type === 'line' && /(contour|terrain|hillshade)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#b7c6cf');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.45);
    }

    if (layer.type === 'line' && /(path|road|street|track)/i.test(layerId)) {
      setLayerPaintIfPresent(map, layerId, 'line-color', '#ffffff');
      setLayerPaintIfPresent(map, layerId, 'line-opacity', 0.5);
    }
  });

  if (map.getLayer('hillshade')) {
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-highlight-color', '#f8fbfd');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-shadow-color', '#b9cad5');
    setLayerPaintIfPresent(map, 'hillshade', 'hillshade-accent-color', '#d9e6ee');
  }

  map.setFog({
    color: '#f5f8fb',
    'high-color': '#e5eef5',
    'horizon-blend': 0.04,
    'space-color': '#edf3f8',
    'star-intensity': 0,
  });
}

function applyThreeDimensionalMode(map, isEnabled) {
  if (!map.getSource(DEM_SOURCE_ID)) {
    map.addSource(DEM_SOURCE_ID, {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  if (isEnabled) {
    map.setTerrain({ source: DEM_SOURCE_ID, exaggeration: 1.2 });
    map.setFog({
      color: '#f2f6fb',
      'high-color': '#d9e8f7',
      'horizon-blend': 0.05,
      'space-color': '#edf4fb',
      'star-intensity': 0,
    });

    if (!map.getLayer(BUILDINGS_LAYER_ID)) {
      const labelLayer = map
        .getStyle()
        .layers?.find((layer) => layer.type === 'symbol' && layer.layout?.['text-field']);

      map.addLayer(
        {
          id: BUILDINGS_LAYER_ID,
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', ['get', 'extrude'], 'true'],
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#dbe7ef',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.45,
          },
        },
        labelLayer?.id
      );
    }

    map.easeTo({ pitch: 58, bearing: 18, duration: 900 });
    return;
  }

  if (map.getLayer(BUILDINGS_LAYER_ID)) {
    map.removeLayer(BUILDINGS_LAYER_ID);
  }

  map.setTerrain(null);
  map.setFog(null);
  map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
}

export default function Home() {
  const router = useRouter();
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const hasManualDestinationSelectionRef = useRef(false);
  const hasAutoSelectedDestinationRef = useRef(false);
  const hasInitializedFromUrlRef = useRef(false);
  const shouldPreserveMapViewRef = useRef(false);
  const skipNextTrailFitRef = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isInitialMapViewSettled, setIsInitialMapViewSettled] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [destinationsStatus, setDestinationsStatus] = useState('idle');
  const [trailsStatus, setTrailsStatus] = useState('idle');
  const [requestError, setRequestError] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [destinationsGeoJson, setDestinationsGeoJson] = useState(null);
  const [trailsGeoJson, setTrailsGeoJson] = useState(null);
  const [suggestedTrailsGeoJson, setSuggestedTrailsGeoJson] = useState(null);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [selectedTrailFeature, setSelectedTrailFeature] = useState(null);
  const [selectedTrailCrossings, setSelectedTrailCrossings] = useState(null);
  const [trailColorMode, setTrailColorMode] = useState(DEFAULT_TRAIL_COLOR_MODE);
  const [isThreeDimensional, setIsThreeDimensional] = useState(false);
  const [mapView, setMapView] = useState(null);
  const [nearbyDestinationIds, setNearbyDestinationIds] = useState([]);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);

  const selectedDestination =
    destinations.find((destination) => destination.id === selectedDestinationId) || null;
  const nearbyDestinations = destinations.filter((destination) =>
    nearbyDestinationIds.includes(destination.id)
  );
  const selectedTrail = selectedTrailFeature?.properties || null;
  const activeTrailLegendItems =
    trailColorMode === 'freshness' ? freshnessLegendItems : trailLegendItems;

  function applyTrailGeoJsonToPrimaryLayer(geojson) {
    const map = mapRef.current;

    setTrailsGeoJson(geojson);
    setTrailsStatus('success');
    setRequestError('');

    if (map?.getSource(TRAILS_SOURCE_ID)) {
      map.getSource(TRAILS_SOURCE_ID).setData(geojson);
    }
  }

  function updateSelectedDestination(destinationId, options = {}) {
    const { manual = false, prefetchedTrailsGeoJson = null } = options;

    if (manual) {
      hasManualDestinationSelectionRef.current = true;
    }

    if (prefetchedTrailsGeoJson) {
      applyTrailGeoJsonToPrimaryLayer(prefetchedTrailsGeoJson);
    }

    setSelectedDestinationId(destinationId);
    setSelectedTrailFeature(null);
    setSelectedTrailCrossings(null);
    setNearbyDestinationIds([]);
    setSuggestedTrailsGeoJson(null);
  }

  useEffect(() => {
    if (!router.isReady || hasInitializedFromUrlRef.current) {
      return;
    }

    const storedSettings = readStoredMapSettings();
    const destinationFromUrl = getSingleQueryValue(router.query.destination);
    const colorModeFromUrl = getSingleQueryValue(router.query.colors);
    const threeDimensionalFromUrl = getSingleQueryValue(router.query.terrain);
    const longitudeFromUrl = getSingleQueryValue(router.query.lng);
    const latitudeFromUrl = getSingleQueryValue(router.query.lat);
    const zoomFromUrl = getSingleQueryValue(router.query.zoom);
    const destinationFromStorage = getSingleQueryValue(storedSettings?.destination);
    const colorModeFromStorage = getSingleQueryValue(storedSettings?.colors);
    const threeDimensionalFromStorage = getSingleQueryValue(storedSettings?.terrain);
    const mapViewFromUrl = getMapViewFromValues(longitudeFromUrl, latitudeFromUrl, zoomFromUrl);
    const mapViewFromStorage = getMapViewFromValues(
      storedSettings?.lng,
      storedSettings?.lat,
      storedSettings?.zoom
    );

    const initialDestination = destinationFromUrl || destinationFromStorage;
    const initialColorMode = colorModeFromUrl || colorModeFromStorage;
    const initialTerrain = threeDimensionalFromUrl || threeDimensionalFromStorage;
    const initialMapView = mapViewFromUrl || mapViewFromStorage;

    if (typeof initialDestination === 'string' && /^\d+$/.test(initialDestination)) {
      hasManualDestinationSelectionRef.current = true;
      hasAutoSelectedDestinationRef.current = true;
      setSelectedDestinationId(initialDestination);
    }

    if (isTrailColorMode(initialColorMode)) {
      setTrailColorMode(initialColorMode);
    }

    if (initialTerrain === '1') {
      setIsThreeDimensional(true);
    }

    if (initialMapView) {
      shouldPreserveMapViewRef.current = true;
      setMapView(initialMapView);
    }

    hasInitializedFromUrlRef.current = true;
  }, [
    router.isReady,
    router.query.destination,
    router.query.colors,
    router.query.terrain,
    router.query.lng,
    router.query.lat,
    router.query.zoom,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!router.isReady || !isMapLoaded || !map || isInitialMapViewSettled) {
      return;
    }

    if (shouldPreserveMapViewRef.current && mapView) {
      map.jumpTo({
        center: [mapView.longitude, mapView.latitude],
        zoom: mapView.zoom,
      });

      skipNextTrailFitRef.current = true;
      shouldPreserveMapViewRef.current = false;
    }

    setIsInitialMapViewSettled(true);
    setMapReady(true);
  }, [router.isReady, isMapLoaded, isInitialMapViewSettled, mapView]);

  useEffect(() => {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!accessToken) {
      setMapError('Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to load the map.');
      return undefined;
    }

    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: WINTER_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 7,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right'
    );

    map.on('load', () => {
      try {
        applyWinterBasemap(map);
      } catch (error) {
        console.error('Failed to apply winter basemap styling', error);
      }

      setIsMapLoaded(true);
    });

    map.on('error', (event) => {
      if (event?.error?.message) {
        setMapError(event.error.message);
      }
    });

    map.on('moveend', () => {
      const center = map.getCenter();

      setMapView({
        longitude: Number(center.lng.toFixed(5)),
        latitude: Number(center.lat.toFixed(5)),
        zoom: Number(map.getZoom().toFixed(2)),
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return;
    }

    applyThreeDimensionalMode(map, isThreeDimensional);
  }, [mapReady, isThreeDimensional]);

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

        const geojson = await response.json();

        if (isCancelled) {
          return;
        }

        const destinationOptions = geojson.features
          .map(getDestinationSummary)
          .sort((left, right) => left.name.localeCompare(right.name));

        setDestinations(destinationOptions);
        setDestinationsGeoJson(geojson);
        setDestinationsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setDestinationsStatus('error');
        setRequestError(error.message);
      }
    }

    loadDestinations();

    return () => {
      isCancelled = true;
    };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !destinations.length || hasManualDestinationSelectionRef.current) {
      return undefined;
    }

    if (!navigator.geolocation) {
      const fallbackDestination = findClosestDestination(destinations, DEFAULT_CENTER);

      if (fallbackDestination && !selectedDestinationId && !hasAutoSelectedDestinationRef.current) {
        hasAutoSelectedDestinationRef.current = true;
        updateSelectedDestination(fallbackDestination.id);
      }

      return undefined;
    }

    let isCancelled = false;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (isCancelled || hasManualDestinationSelectionRef.current) {
          return;
        }

        const nearestDestination = findClosestDestination(destinations, [
          position.coords.longitude,
          position.coords.latitude,
        ]);

        if (nearestDestination && !selectedDestinationId) {
          hasAutoSelectedDestinationRef.current = true;
          updateSelectedDestination(nearestDestination.id);
        }
      },
      () => {
        if (isCancelled || hasManualDestinationSelectionRef.current) {
          return;
        }

        const fallbackDestination = findClosestDestination(destinations, DEFAULT_CENTER);

        if (fallbackDestination && !selectedDestinationId && !hasAutoSelectedDestinationRef.current) {
          hasAutoSelectedDestinationRef.current = true;
          updateSelectedDestination(fallbackDestination.id);
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 300000,
        timeout: 10000,
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [mapReady, destinations, selectedDestinationId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !destinationsGeoJson) {
      return undefined;
    }

    if (map.getSource(DESTINATIONS_SOURCE_ID)) {
      map.getSource(DESTINATIONS_SOURCE_ID).setData(destinationsGeoJson);
      return undefined;
    }

    map.addSource(DESTINATIONS_SOURCE_ID, {
      type: 'geojson',
      data: destinationsGeoJson,
    });

    map.addLayer({
      id: DESTINATIONS_LAYER_ID,
      type: 'circle',
      source: DESTINATIONS_SOURCE_ID,
      paint: {
        'circle-color': buildMatchExpression('prepsymbol', DESTINATION_PREP_STYLES),
        'circle-radius': 6,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });

    const handleDestinationClick = (event) => {
      const feature = event.features?.[0];

      if (!feature?.properties?.id) {
        return;
      }

      updateSelectedDestination(String(feature.properties.id), { manual: true });
    };

    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
    map.on('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
    map.on('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);

    return () => {
      if (!map.getLayer(DESTINATIONS_LAYER_ID)) {
        return;
      }

      map.off('click', DESTINATIONS_LAYER_ID, handleDestinationClick);
      map.off('mouseenter', DESTINATIONS_LAYER_ID, handleMouseEnter);
      map.off('mouseleave', DESTINATIONS_LAYER_ID, handleMouseLeave);
    };
  }, [mapReady, destinationsGeoJson]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const suggestedGeoJson = getSuggestedDestinationGeoJson(nearbyDestinations);

    if (map.getSource(SUGGESTED_DESTINATION_SOURCE_ID)) {
      map.getSource(SUGGESTED_DESTINATION_SOURCE_ID).setData(suggestedGeoJson);
    } else {
      map.addSource(SUGGESTED_DESTINATION_SOURCE_ID, {
        type: 'geojson',
        data: suggestedGeoJson,
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_RING_LAYER_ID,
        type: 'circle',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        paint: {
          'circle-radius': 13,
          'circle-color': 'rgba(31, 127, 89, 0.12)',
          'circle-stroke-color': '#1f7f59',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_DOT_LAYER_ID,
        type: 'circle',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        paint: {
          'circle-radius': 6,
          'circle-color': '#1f7f59',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });

      map.addLayer({
        id: SUGGESTED_DESTINATION_LABEL_LAYER_ID,
        type: 'symbol',
        source: SUGGESTED_DESTINATION_SOURCE_ID,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.35],
          'text-anchor': 'top',
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#173127',
          'text-halo-color': 'rgba(250, 252, 250, 0.98)',
          'text-halo-width': 2,
        },
      });
    }

    if (map.getLayer(SUGGESTED_DESTINATION_RING_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_RING_LAYER_ID);
    }

    if (map.getLayer(SUGGESTED_DESTINATION_DOT_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_DOT_LAYER_ID);
    }

    if (map.getLayer(SUGGESTED_DESTINATION_LABEL_LAYER_ID)) {
      map.moveLayer(SUGGESTED_DESTINATION_LABEL_LAYER_ID);
    }

    return undefined;
  }, [mapReady, nearbyDestinations]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !selectedDestinationId) {
      return undefined;
    }

    let isCancelled = false;

    async function loadTrails() {
      setTrailsStatus('loading');
      setRequestError('');

      try {
        let geojson = readCachedTrailGeoJson(selectedDestinationId);

        if (!geojson) {
          const response = await fetch(`/api/trails?destinationid=${selectedDestinationId}`);

          if (!response.ok) {
            throw new Error('Failed to fetch trails for the selected destination');
          }

          geojson = await response.json();
          writeCachedTrailGeoJson(selectedDestinationId, geojson);
        }

        if (isCancelled) {
          return;
        }

        setTrailsGeoJson(geojson);

        if (map.getSource(TRAILS_SOURCE_ID)) {
          map.getSource(TRAILS_SOURCE_ID).setData(geojson);
        } else {
          map.addSource(TRAILS_SOURCE_ID, {
            type: 'geojson',
            data: geojson,
          });

          map.addLayer({
            id: TRAILS_LAYER_ID,
            type: 'line',
            source: TRAILS_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': getTrailColorExpression(trailColorMode),
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
              'line-opacity': 0.85,
            },
          });

          map.addLayer({
            id: TRAILS_HIT_LAYER_ID,
            type: 'line',
            source: TRAILS_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#000000',
              'line-width': TRAIL_HIT_LINE_WIDTH,
              'line-opacity': 0,
            },
          });

          map.on('click', TRAILS_HIT_LAYER_ID, (event) => {
            const feature = event.features?.[0];

            if (!feature?.properties) {
              return;
            }

            setSelectedTrailFeature(feature);
          });

          map.on('mouseenter', TRAILS_HIT_LAYER_ID, () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', TRAILS_HIT_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
          });
        }

        if (skipNextTrailFitRef.current) {
          skipNextTrailFitRef.current = false;
        } else {
          fitMapToGeoJson(map, geojson, selectedDestination?.coordinates || DEFAULT_CENTER);
        }
        setTrailsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setTrailsStatus('error');
        setRequestError(error.message);
      }
    }

    loadTrails();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, selectedDestinationId, selectedDestination, trailColorMode]);

  useEffect(() => {
    if (!mapReady || !nearbyDestinationIds.length) {
      setSuggestedTrailsGeoJson(null);
      return undefined;
    }

    let isCancelled = false;

    async function loadSuggestedTrails() {
      try {
        const previewCollections = await Promise.all(
          nearbyDestinationIds.map(async (destinationId) => {
            const cachedGeoJson = readCachedTrailGeoJson(destinationId);

            if (cachedGeoJson) {
              return cachedGeoJson;
            }

            const response = await fetch(`/api/trails?destinationid=${destinationId}`);

            if (!response.ok) {
              throw new Error('Failed to fetch trails for nearby destinations');
            }

            const geojson = await response.json();
            writeCachedTrailGeoJson(destinationId, geojson);
            return geojson;
          })
        );

        const geojson = {
          type: 'FeatureCollection',
          features: previewCollections.flatMap((collection) => collection.features || []),
        };

        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson(geojson);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson(null);
      }
    }

    loadSuggestedTrails();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, nearbyDestinationIds]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer(TRAILS_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(TRAILS_LAYER_ID, 'line-color', getTrailColorExpression(trailColorMode));
  }, [mapReady, trailColorMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const previewGeoJson = suggestedTrailsGeoJson || {
      type: 'FeatureCollection',
      features: [],
    };

    if (map.getSource(SUGGESTED_TRAILS_SOURCE_ID)) {
      map.getSource(SUGGESTED_TRAILS_SOURCE_ID).setData(previewGeoJson);
    } else {
      map.addSource(SUGGESTED_TRAILS_SOURCE_ID, {
        type: 'geojson',
        data: previewGeoJson,
      });

      const suggestedTrailsLayer = {
        id: SUGGESTED_TRAILS_LAYER_ID,
        type: 'line',
        source: SUGGESTED_TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': getTrailColorExpression(trailColorMode),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 11, 4],
          'line-opacity': 0.45,
          'line-dasharray': [1.2, 1],
        },
      };

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.addLayer(suggestedTrailsLayer, TRAILS_LAYER_ID);
      } else {
        map.addLayer(suggestedTrailsLayer);
      }

      const suggestedTrailsHitLayer = {
        id: SUGGESTED_TRAILS_HIT_LAYER_ID,
        type: 'line',
        source: SUGGESTED_TRAILS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#000000',
          'line-width': TRAIL_HIT_LINE_WIDTH,
          'line-opacity': 0,
        },
      };

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.addLayer(suggestedTrailsHitLayer, TRAILS_LAYER_ID);
      } else {
        map.addLayer(suggestedTrailsHitLayer);
      }

      map.on('click', SUGGESTED_TRAILS_HIT_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const destinationId = feature?.properties?.destinationid;

        if (!destinationId) {
          return;
        }

        const prefetchedTrailsGeoJson = readCachedTrailGeoJson(String(destinationId));

        skipNextTrailFitRef.current = true;
        updateSelectedDestination(String(destinationId), {
          manual: true,
          prefetchedTrailsGeoJson,
        });
      });

      map.on('mouseenter', SUGGESTED_TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', SUGGESTED_TRAILS_HIT_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    if (map.getLayer(SUGGESTED_TRAILS_LAYER_ID)) {
      map.setPaintProperty(
        SUGGESTED_TRAILS_LAYER_ID,
        'line-color',
        getTrailColorExpression(trailColorMode)
      );

      if (map.getLayer(TRAILS_LAYER_ID)) {
        map.moveLayer(SUGGESTED_TRAILS_LAYER_ID, TRAILS_LAYER_ID);
      }

      if (map.getLayer(TRAILS_HIT_LAYER_ID)) {
        map.moveLayer(SUGGESTED_TRAILS_HIT_LAYER_ID, TRAILS_HIT_LAYER_ID);
      }
    }

    return undefined;
  }, [mapReady, suggestedTrailsGeoJson, trailColorMode]);

  useEffect(() => {
    if (!selectedDestinationId || !destinations.length || !selectedDestination) {
      setNearbyDestinationIds([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const referenceCoordinates = mapView
        ? [mapView.longitude, mapView.latitude]
        : selectedDestination.coordinates;

      const nearbyAlternatives = getDestinationsWithinRadius(
        destinations,
        referenceCoordinates,
        SUGGESTED_DESTINATION_RADIUS_KM,
        selectedDestinationId
      );

      if (!nearbyAlternatives.length) {
        setNearbyDestinationIds([]);
        return;
      }

      const sortedNearbyAlternatives = [...nearbyAlternatives].sort((left, right) => {
        const leftDistance = getDistanceInKilometers(referenceCoordinates, left.coordinates);
        const rightDistance = getDistanceInKilometers(referenceCoordinates, right.coordinates);
        return leftDistance - rightDistance;
      });

      setNearbyDestinationIds(sortedNearbyAlternatives.map((destination) => destination.id));
    }, DESTINATION_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mapView, selectedDestinationId, selectedDestination, destinations]);

  useEffect(() => {
    if (!selectedTrailFeature || !trailsGeoJson?.features?.length) {
      setSelectedTrailCrossings(null);
      return;
    }

    setSelectedTrailCrossings(getCrossingMetrics(selectedTrailFeature, trailsGeoJson, destinations));
  }, [selectedTrailFeature, trailsGeoJson, destinations]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(trailsGeoJson, destinations);

    if (map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID)) {
      map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID).setData(labelsGeoJson);
    } else {
      map.addSource(TRAIL_SEGMENT_LABELS_SOURCE_ID, {
        type: 'geojson',
        data: labelsGeoJson,
      });

      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID,
        type: 'circle',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 13, 12, 18],
          'circle-color': 'rgba(248, 252, 248, 0.82)',
          'circle-blur': 0.75,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255, 255, 255, 0.95)',
          'circle-opacity': 0.95,
        },
      });

      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 13],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 0],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'symbol-placement': 'point',
        },
        paint: {
          'text-color': '#173127',
          'text-halo-color': 'rgba(250, 252, 250, 0.98)',
          'text-halo-width': 2.75,
          'text-halo-blur': 1,
        },
      });
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return () => {
      if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
        map.setLayoutProperty(TRAIL_SEGMENT_LABELS_LAYER_ID, 'visibility', 'visible');
      }
    };
  }, [mapReady, trailsGeoJson, destinations]);

  useEffect(() => {
    if (!router.isReady || !hasInitializedFromUrlRef.current) {
      return;
    }

    const nextQuery = { ...router.query };

    if (selectedDestinationId) {
      nextQuery.destination = selectedDestinationId;
    } else {
      delete nextQuery.destination;
    }

    if (trailColorMode !== DEFAULT_TRAIL_COLOR_MODE) {
      nextQuery.colors = trailColorMode;
    } else {
      delete nextQuery.colors;
    }

    if (isThreeDimensional) {
      nextQuery.terrain = '1';
    } else {
      delete nextQuery.terrain;
    }

    if (mapView) {
      nextQuery.lng = mapView.longitude.toFixed(5);
      nextQuery.lat = mapView.latitude.toFixed(5);
      nextQuery.zoom = mapView.zoom.toFixed(2);
    } else {
      delete nextQuery.lng;
      delete nextQuery.lat;
      delete nextQuery.zoom;
    }

    const currentDestination = getSingleQueryValue(router.query.destination) || '';
    const currentColors = getSingleQueryValue(router.query.colors) || '';
    const currentTerrain = getSingleQueryValue(router.query.terrain) || '';
    const currentLongitude = getSingleQueryValue(router.query.lng) || '';
    const currentLatitude = getSingleQueryValue(router.query.lat) || '';
    const currentZoom = getSingleQueryValue(router.query.zoom) || '';
    const nextDestination = getSingleQueryValue(nextQuery.destination) || '';
    const nextColors = getSingleQueryValue(nextQuery.colors) || '';
    const nextTerrain = getSingleQueryValue(nextQuery.terrain) || '';
    const nextLongitude = getSingleQueryValue(nextQuery.lng) || '';
    const nextLatitude = getSingleQueryValue(nextQuery.lat) || '';
    const nextZoom = getSingleQueryValue(nextQuery.zoom) || '';

    if (
      currentDestination === nextDestination &&
      currentColors === nextColors &&
      currentTerrain === nextTerrain &&
      currentLongitude === nextLongitude &&
      currentLatitude === nextLatitude &&
      currentZoom === nextZoom
    ) {
      return;
    }

    router.replace(
      {
        pathname: router.pathname,
        query: nextQuery,
      },
      undefined,
      { shallow: true, scroll: false }
    );
  }, [
    router,
    selectedDestinationId,
    trailColorMode,
    isThreeDimensional,
    mapView,
  ]);

  useEffect(() => {
    if (!hasInitializedFromUrlRef.current || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        MAP_SETTINGS_STORAGE_KEY,
        JSON.stringify({
          destination: selectedDestinationId || '',
          colors: trailColorMode,
          terrain: isThreeDimensional ? '1' : '',
          lng: mapView?.longitude?.toFixed(5) || '',
          lat: mapView?.latitude?.toFixed(5) || '',
          zoom: mapView?.zoom?.toFixed(2) || '',
        })
      );
    } catch (error) {
      console.warn('Failed to persist map settings', error);
    }
  }, [selectedDestinationId, trailColorMode, isThreeDimensional, mapView]);

  return (
    <div className="page-shell">
      <aside className={`control-panel${isPanelCollapsed ? ' control-panel-collapsed' : ''}`}>
        <div className="panel-header">
          <div>
            <p className="eyebrow">cc-maps</p>
            {!isPanelCollapsed ? <h1>Cross-Country maps</h1> : null}
          </div>
          <button
            type="button"
            className="panel-collapse-button"
            onClick={() => setIsPanelCollapsed((current) => !current)}
            aria-expanded={!isPanelCollapsed}
            aria-controls="control-panel-body"
          >
            {isPanelCollapsed ? 'Open' : 'Minimize'}
          </button>
        </div>

        {!isPanelCollapsed ? (
          <div id="control-panel-body">
            <div className="quick-actions">
              <button
                type="button"
                className="icon-chip"
                onClick={() => setIsInfoPanelOpen(true)}
                aria-label="Open info panel"
              >
                <FaCircleInfo />
                <span>Info</span>
              </button>
              <label className="icon-toggle" htmlFor="three-d-toggle">
                <span className="icon-toggle-copy">
                  <FaMountain />
                  <span>3D</span>
                </span>
                <input
                  id="three-d-toggle"
                  type="checkbox"
                  checked={isThreeDimensional}
                  onChange={(event) => setIsThreeDimensional(event.target.checked)}
                />
              </label>
            </div>

            <div className="display-mode-block">
              <p className="detail-label">Trail colors</p>
              <div className="segmented-control" role="tablist" aria-label="Trail color mode">
                <button
                  type="button"
                  className={`segment-button${trailColorMode === 'type' ? ' segment-button-active' : ''}`}
                  onClick={() => setTrailColorMode('type')}
                  aria-pressed={trailColorMode === 'type'}
                >
                  Type
                </button>
                <button
                  type="button"
                  className={`segment-button${trailColorMode === 'freshness' ? ' segment-button-active' : ''}`}
                  onClick={() => setTrailColorMode('freshness')}
                  aria-pressed={trailColorMode === 'freshness'}
                >
                  Freshness
                </button>
              </div>
            </div>

            <label className="field-label" htmlFor="destination-select">
              <span className="field-label-content">
                <FaLocationDot />
                <span>Destination</span>
              </span>
            </label>
            <select
              id="destination-select"
              className="select-input"
              value={selectedDestinationId}
              onChange={(event) => {
                updateSelectedDestination(event.target.value, { manual: true });
              }}
              disabled={destinationsStatus !== 'success'}
            >
              <option value="">Choose a ski area</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}
                </option>
              ))}
            </select>

            <div className="status-stack">
              {mapError ? <p className="status-card status-error">{mapError}</p> : null}
              {destinationsStatus === 'loading' ? (
                <p className="status-card">Loading destinations...</p>
              ) : null}
              {trailsStatus === 'loading' ? <p className="status-card">Loading trails...</p> : null}
              {requestError ? <p className="status-card status-error">{requestError}</p> : null}
              {destinationsStatus === 'success' && destinations.length === 0 ? (
                <p className="status-card">No active destinations were returned by the API.</p>
              ) : null}
            </div>

            {selectedDestination ? (
              <section className="detail-card detail-card-compact">
                <p className="detail-label">Selected destination</p>
                <h2>{selectedDestination.name}</h2>
                <p>
                  {DESTINATION_PREP_STYLES[selectedDestination.prepSymbol]?.label ||
                    DESTINATION_PREP_STYLES.default.label}
                </p>
              </section>
            ) : null}

            <section className="detail-card detail-card-compact">
              <p className="detail-label">
                {trailColorMode === 'freshness' ? 'Grooming freshness legend' : 'Trail type legend'}
              </p>
              <ul className="legend-list">
                {activeTrailLegendItems.map((item) => (
                  <li key={item.code} className="legend-item">
                    <span className="legend-swatch" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </section>

            {selectedTrail ? (
              <section className="detail-card detail-card-compact">
                <p className="detail-label">Trail details</p>
                <h2>
                  {TRAIL_TYPE_STYLES[selectedTrail.trailtypesymbol]?.label ||
                    TRAIL_TYPE_STYLES.default.label}
                </h2>
                <p>
                  Classic: {selectedTrail.has_classic ? 'Yes' : 'No'} · Skating:{' '}
                  {selectedTrail.has_skating ? 'Yes' : 'No'}
                </p>
                <p>
                  Freshness:{' '}
                  {DESTINATION_PREP_STYLES[selectedTrail.prepsymbol]?.label ||
                    DESTINATION_PREP_STYLES.default.label}
                </p>
                {selectedTrailCrossings ? (
                  <p>
                    Length: {formatDistance(selectedTrailCrossings.totalLengthKm)} · Crossings:{' '}
                    {selectedTrailCrossings.crossings.length}
                  </p>
                ) : null}
                {selectedTrail.warningtext ? <p>{selectedTrail.warningtext}</p> : null}
                {selectedTrailCrossings?.segments?.length ? (
                  <div className="crossing-list-block">
                    <p className="detail-label">Trail segments</p>
                    <ul className="crossing-list">
                      {selectedTrailCrossings.segments.map((segment, index) => (
                        <li
                          key={`${segment.fromLabel}-${segment.toLabel}-${index}`}
                          className="crossing-item"
                        >
                          <span>
                            {segment.fromLabel} to {segment.toLabel}
                          </span>
                          <strong>{formatDistance(segment.distanceKm)}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : selectedTrailCrossings?.crossings?.length === 1 ? (
                  <p>Only one crossing was found on this trail, so no interval can be shown yet.</p>
                ) : selectedTrailCrossings ? (
                  <p>No crossings were found for this trail within the loaded destination network.</p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : selectedDestination ? (
          <div className="panel-collapsed-summary">
            <p className="detail-label">Destination</p>
            <p>{selectedDestination.name}</p>
          </div>
        ) : null}
      </aside>

      {isInfoPanelOpen ? (
        <aside className="info-panel" aria-label="Map information">
          <div className="info-panel-header">
            <div>
              <p className="eyebrow">Guide</p>
              <h2 className="info-title">How to use the map</h2>
            </div>
            <button
              type="button"
              className="info-close-button"
              onClick={() => setIsInfoPanelOpen(false)}
              aria-label="Close info panel"
            >
              <FaXmark />
            </button>
          </div>

          <div className="info-list">
            <section className="info-item">
              <FaPersonSkiingNordic className="info-icon" />
              <div>
                <p className="detail-label">Browse</p>
                <p>Pick a ski area from the destination menu or tap a destination marker on the map.</p>
              </div>
            </section>

            <section className="info-item">
              <FaSnowflake className="info-icon" />
              <div>
                <p className="detail-label">Winter mode</p>
                <p>The base map is winter-styled by default. Turn on 3D only when you want terrain depth.</p>
              </div>
            </section>

            <section className="info-item">
              <FaLayerGroup className="info-icon" />
              <div>
                <p className="detail-label">Trail colors</p>
                <p>Freshness is the default view. Switch to type colors when you want trail categories instead.</p>
              </div>
            </section>
          </div>
        </aside>
      ) : null}

      <main className="map-stage">
        <div
          ref={mapContainer}
          className={`map-container${isInitialMapViewSettled ? ' map-container-ready' : ''}`}
        />
      </main>

      <style jsx>{`
        .page-shell {
          position: relative;
          height: 100vh;
          overflow: hidden;
          background: linear-gradient(145deg, #ebf4ef 0%, #dfe8ef 100%);
        }

        .control-panel {
          position: absolute;
          top: 1rem;
          left: 1rem;
          z-index: 1;
          width: min(340px, calc(100% - 2rem));
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          padding: 1rem;
          border: 1px solid rgba(29, 50, 42, 0.1);
          border-radius: 20px;
          background: rgba(250, 252, 250, 0.92);
          box-shadow: 0 24px 48px rgba(47, 74, 61, 0.16);
          backdrop-filter: blur(14px);
        }

        .control-panel-collapsed {
          width: auto;
          max-width: min(260px, calc(100% - 2rem));
        }

        .panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .panel-collapse-button {
          border: 0;
          border-radius: 999px;
          background: #dfeae2;
          color: #1d4236;
          padding: 0.45rem 0.7rem;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
        }

        .panel-collapse-button:hover {
          background: #d2e2d7;
        }

        .panel-collapsed-summary {
          margin-top: 0.6rem;
          color: #284638;
          font-size: 0.92rem;
        }

        .quick-actions {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin-top: 0.75rem;
        }

        .icon-chip,
        .icon-toggle {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          border-radius: 999px;
          padding: 0.55rem 0.75rem;
          background: #eef4ef;
          color: #1f4235;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 700;
        }

        .icon-chip {
          border: 0;
          cursor: pointer;
        }

        .icon-toggle {
          justify-content: space-between;
          flex: 1;
        }

        .icon-toggle-copy,
        .field-label-content {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
        }

        .icon-toggle input {
          width: 1rem;
          height: 1rem;
          margin: 0;
          accent-color: #1f7f59;
        }

        .info-panel {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 1;
          width: min(320px, calc(100% - 2rem));
          max-height: calc(100vh - 2rem);
          overflow-y: auto;
          padding: 1rem;
          border: 1px solid rgba(29, 50, 42, 0.1);
          border-radius: 20px;
          background: rgba(252, 253, 251, 0.94);
          box-shadow: 0 24px 48px rgba(47, 74, 61, 0.14);
          backdrop-filter: blur(14px);
        }

        .info-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .info-title {
          font-size: 1.15rem;
        }

        .info-close-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 2rem;
          height: 2rem;
          border: 0;
          border-radius: 999px;
          background: #eef3ee;
          color: #234236;
          cursor: pointer;
        }

        .info-list {
          display: grid;
          gap: 0.85rem;
          margin-top: 1rem;
        }

        .info-item {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 0.75rem;
          align-items: flex-start;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(35, 66, 54, 0.08);
          color: #2a4639;
        }

        .info-item:first-child {
          padding-top: 0;
          border-top: 0;
        }

        .info-icon {
          margin-top: 0.1rem;
          font-size: 1rem;
          color: #2f6d58;
        }

        .eyebrow,
        .detail-label {
          margin: 0 0 0.35rem;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #567261;
        }

        h1,
        h2,
        p {
          margin: 0;
        }

        h1 {
          font-size: 1.8rem;
          line-height: 1.05;
          color: #18352b;
        }

        h2 {
          font-size: 1rem;
          color: #163127;
        }

        .panel-copy {
          margin-top: 0.7rem;
          color: #385445;
          line-height: 1.5;
          max-width: 28ch;
        }

        .field-label {
          display: block;
          margin-top: 1rem;
          margin-bottom: 0.4rem;
          font-size: 0.9rem;
          font-weight: 600;
          color: #234236;
        }

        .display-mode-block {
          margin-top: 0.85rem;
        }

        .segmented-control {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.35rem;
          padding: 0.25rem;
          border-radius: 12px;
          background: #eef4ef;
        }

        .segment-button {
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #2f5142;
          padding: 0.55rem 0.7rem;
          font: inherit;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
        }

        .segment-button-active {
          background: #ffffff;
          color: #163127;
          box-shadow: 0 1px 3px rgba(30, 49, 39, 0.12);
        }

        .select-input {
          width: 100%;
          padding: 0.85rem 0.9rem;
          border: 1px solid #c7d6cc;
          border-radius: 12px;
          background: #ffffff;
          color: #143126;
          font: inherit;
        }

        .status-stack {
          display: grid;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .status-card,
        .detail-card {
          margin-top: 0.75rem;
          padding: 0.75rem 0.85rem;
          border-radius: 14px;
          background: #f3f7f3;
          color: #284638;
        }

        .detail-card-compact p:last-of-type {
          margin-top: 0.35rem;
        }

        .detail-card :global(p + p) {
          margin-top: 0.25rem;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-top: 0.75rem;
          font-size: 0.95rem;
          font-weight: 600;
          color: #234236;
        }

        .toggle-row input {
          width: 1.1rem;
          height: 1.1rem;
          accent-color: #1f7f59;
          flex: 0 0 auto;
        }

        .status-error {
          background: #fff0f0;
          color: #8d2d2d;
        }

        .suggestion-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .suggestion-button {
          border: 0;
          border-radius: 999px;
          background: #1f7f59;
          color: #ffffff;
          padding: 0.45rem 0.75rem;
          font: inherit;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
        }

        .suggestion-button-secondary {
          background: #e7efea;
          color: #274538;
        }

        .legend-list {
          display: grid;
          gap: 0.55rem;
          margin: 0.75rem 0 0;
          padding: 0;
          list-style: none;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.65rem;
        }

        .crossing-list-block {
          margin-top: 0.8rem;
        }

        .crossing-list {
          display: grid;
          gap: 0.4rem;
          margin: 0.45rem 0 0;
          padding: 0;
          list-style: none;
        }

        .crossing-item {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
          color: #284638;
        }

        .legend-swatch {
          width: 0.95rem;
          height: 0.95rem;
          border-radius: 999px;
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
        }

        .map-stage,
        .map-container {
          width: 100%;
          height: 100vh;
        }

        .map-container {
          opacity: 0;
          transition: opacity 180ms ease;
        }

        .map-container-ready {
          opacity: 1;
        }

        @media (max-width: 840px) {
          .control-panel {
            width: min(320px, calc(100% - 2rem));
          }

          .info-panel {
            top: auto;
            right: 1rem;
            bottom: 1rem;
          }
        }

        @media (max-width: 640px) {
          .control-panel {
            top: auto;
            right: 0.75rem;
            bottom: 0.75rem;
            left: 0.75rem;
            width: auto;
            max-height: min(40vh, 320px);
            padding: 0.75rem 0.8rem;
            border: 1px solid rgba(29, 50, 42, 0.08);
            border-radius: 14px;
            background: rgba(248, 251, 248, 0.84);
            box-shadow: 0 10px 24px rgba(47, 74, 61, 0.1);
            backdrop-filter: blur(10px);
          }

          .control-panel-collapsed {
            max-width: calc(100% - 1.5rem);
          }

          .info-panel {
            right: 0.75rem;
            bottom: 0.75rem;
            left: 0.75rem;
            width: auto;
            max-height: min(42vh, 340px);
            padding: 0.8rem;
            border-radius: 14px;
          }

          h1 {
            font-size: 1.2rem;
            letter-spacing: -0.02em;
          }

          .panel-copy {
            margin-top: 0.3rem;
            font-size: 0.84rem;
            line-height: 1.25;
            max-width: none;
          }

          .eyebrow,
          .detail-label {
            margin-bottom: 0.2rem;
            font-size: 0.62rem;
            letter-spacing: 0.12em;
          }

          .field-label {
            margin-top: 0.6rem;
            margin-bottom: 0.3rem;
            font-size: 0.78rem;
          }

          .display-mode-block {
            margin-top: 0.6rem;
          }

          .quick-actions {
            margin-top: 0.55rem;
            gap: 0.45rem;
          }

          .icon-chip,
          .icon-toggle {
            padding: 0.45rem 0.6rem;
            font-size: 0.76rem;
          }

          .select-input {
            padding: 0.68rem 0.75rem;
            border-radius: 10px;
            font-size: 0.9rem;
          }

          .segmented-control {
            gap: 0.25rem;
            padding: 0.2rem;
            border-radius: 10px;
          }

          .segment-button {
            padding: 0.45rem 0.55rem;
            font-size: 0.74rem;
          }

          .detail-card,
          .status-card {
            margin-top: 0.45rem;
            padding: 0.55rem 0;
            border-radius: 0;
            background: transparent;
            border-top: 1px solid rgba(35, 66, 54, 0.08);
          }

          .legend-list {
            gap: 0.3rem;
            margin-top: 0.4rem;
          }

          .legend-item {
            gap: 0.5rem;
            font-size: 0.84rem;
          }

          .crossing-item {
            font-size: 0.8rem;
          }

          .legend-swatch {
            width: 0.8rem;
            height: 0.8rem;
          }

          .toggle-row {
            margin-top: 0.55rem;
            font-size: 0.82rem;
            font-weight: 500;
          }

          .toggle-row input {
            width: 1rem;
            height: 1rem;
          }

          .suggestion-actions {
            flex-wrap: wrap;
            gap: 0.4rem;
            margin-top: 0.5rem;
          }

          .suggestion-button {
            padding: 0.38rem 0.6rem;
            font-size: 0.72rem;
          }

          .info-title {
            font-size: 1rem;
          }

          .info-item {
            gap: 0.6rem;
          }

          .info-icon {
            font-size: 0.92rem;
          }

          .panel-collapse-button {
            padding: 0.35rem 0.6rem;
            font-size: 0.74rem;
          }

          h2 {
            font-size: 0.92rem;
          }

          p,
          .status-card,
          .detail-card {
            font-size: 0.82rem;
            line-height: 1.3;
          }
        }
      `}</style>
    </div>
  );
}