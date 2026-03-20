import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import mapboxgl from 'mapbox-gl';
import { FaRoute } from 'react-icons/fa6';
import mapboxglMock from '../lib/mapbox-gl-mock';
import ControlPanel from '../components/ControlPanel';
import InfoPanel from '../components/InfoPanel';
import PlanningPanel from '../components/PlanningPanel';
import TrailDetailsPanel from '../components/TrailDetailsPanel';
import { useMapPersistence } from '../hooks/useMapPersistence';
import {
  findClosestDestinationByTrailProximity,
  findClosestDestination,
  formatDistance,
  getClickedTrailSection,
  getAllTrailSegmentLabelsGeoJson,
  getCrossingMetrics,
  getDestinationSummary,
  getDestinationsWithinRadius,
  getDistanceInKilometers,
  getRouteProgressMetrics,
  getSuggestedDestinationGeoJson,
  getTrailSelectionLengthInKilometers,
} from '../lib/map-domain';
import {
  readCachedTrailGeoJson,
  isPlanningModeQueryValue,
  writeCachedTrailGeoJson,
} from '../lib/map-persistence';
import {
  appendRoutePlanAnchor,
  createRoutePlanGeoJson,
  findNearestRouteGraphEdgeId,
  findNearestRouteTraversalFeature,
  isPlanningSelectionInteraction,
  reorderAnchorEdgeIds,
  removeRoutePlanAnchor,
  reverseRoutePlan,
} from '../lib/planning-mode';
import {
  clearStoredRoutePlan,
  createRoutePlan,
  decodeRoutePlanFromUrl,
  encodeRoutePlanToUrl,
  hydrateRoutePlan,
  readStoredRoutePlan,
  shouldRestoreHydratedRoutePlan,
  writeStoredRoutePlan,
} from '../lib/route-plan';
import { createGpxFileName, createGpxFromRouteFeatures } from '../lib/route-export';
import { getSingleQueryValue } from '../lib/map-persistence';
import { buildRouteGraph } from '../lib/route-graph';
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
const SELECTED_TRAIL_SOURCE_ID = 'selected-trail';
const SELECTED_TRAIL_GLOW_LAYER_ID = 'selected-trail-glow-layer';
const SELECTED_TRAIL_BORDER_LAYER_ID = 'selected-trail-border-layer';
const SELECTED_TRAIL_COLOR_LAYER_ID = 'selected-trail-color-layer';
const SUGGESTED_TRAILS_SOURCE_ID = 'suggested-trails';
const SUGGESTED_TRAILS_LAYER_ID = 'suggested-trails-layer';
const SUGGESTED_TRAILS_HIT_LAYER_ID = 'suggested-trails-hit-layer';
const TRAIL_SEGMENT_LABELS_SOURCE_ID = 'trail-segment-labels';
const TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID = 'trail-segment-labels-glow-layer';
const TRAIL_SEGMENT_LABELS_LAYER_ID = 'trail-segment-labels-layer';
const ROUTE_PLAN_ANCHORS_SOURCE_ID = 'route-plan-anchors';
const ROUTE_PLAN_ANCHORS_LAYER_ID = 'route-plan-anchors-layer';
const ROUTE_PLAN_DIRECTIONS_SOURCE_ID = 'route-plan-directions';
const ROUTE_PLAN_DIRECTIONS_LAYER_ID = 'route-plan-directions-layer';
const DEM_SOURCE_ID = 'mapbox-dem';
const BUILDINGS_LAYER_ID = '3d-buildings';
const DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM = 1.25;
const MIN_SEGMENT_DISTANCE_KM = 0.05;
const TRAIL_SEGMENT_LABELS_MIN_ZOOM = 10.5;
const DEFAULT_TRAIL_COLOR_MODE = 'freshness';
const MAP_SETTINGS_STORAGE_KEY = 'cc-maps:settings';
const DESTINATION_SUGGESTION_DEBOUNCE_MS = 700;
const SUGGESTED_DESTINATION_RADIUS_KM = 20;
const MAX_NEARBY_DESTINATION_PREVIEWS = 3;
const TRAILS_CACHE_TTL_MS = 15 * 60 * 1000;
const TRAIL_HIT_LINE_WIDTH = ['interpolate', ['linear'], ['zoom'], 7, 12, 11, 18];
const ACTIVE_TRAIL_OPACITY = 0.85;
const PREVIEW_TRAIL_OPACITY = 0.45;
const CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM = 0.05;
const CURRENT_LOCATION_RECHECK_DISTANCE_KM = 0.02;
const ROUTE_DIRECTION_CHANGE_THRESHOLD_KM = CURRENT_LOCATION_RECHECK_DISTANCE_KM;
const GEOLOCATE_MAX_ZOOM = 13.5;
// NEXT_PUBLIC_* values are compiled into the client bundle, so choosing the
// real or mock Mapbox implementation at module load is intentional.
const isMapboxMockEnabled = process.env.NEXT_PUBLIC_ENABLE_MAPBOX_MOCK === '1';
const mapboxApi = isMapboxMockEnabled ? mapboxglMock : mapboxgl;
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

function getTrailOpacityExpression(activeTrailFeatureIds) {
  if (!activeTrailFeatureIds.length) {
    return ACTIVE_TRAIL_OPACITY;
  }

  return [
    'case',
    ['in', ['to-string', ['get', 'id']], ['literal', activeTrailFeatureIds]],
    ACTIVE_TRAIL_OPACITY,
    PREVIEW_TRAIL_OPACITY,
  ];
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
  const bounds = new mapboxApi.LngLatBounds();
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

function getFeatureCollectionGeoJson(features) {
  if (!Array.isArray(features) || !features.length) {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

function getTrailFeatureCollectionKey(feature) {
  return JSON.stringify([
    feature?.properties?.destinationid || '',
    feature?.properties?.id || '',
    feature?.geometry?.type || '',
    feature?.geometry?.coordinates || [],
  ]);
}

function mergeTrailFeatureCollections(collections) {
  const seenFeatureKeys = new Set();
  const mergedFeatures = [];

  collections.forEach((collection) => {
    (collection?.features || []).forEach((feature) => {
      const featureKey = getTrailFeatureCollectionKey(feature);

      if (seenFeatureKeys.has(featureKey)) {
        return;
      }

      seenFeatureKeys.add(featureKey);
      mergedFeatures.push(feature);
    });
  });

  return getFeatureCollectionGeoJson(mergedFeatures);
}

function getUniqueDestinationIds(destinationIds) {
  return [...new Set((destinationIds || []).map((destinationId) => String(destinationId || '')).filter(Boolean))];
}

function getRouteDestinationIds(routePlan) {
  if (!routePlan?.destinationId || !Array.isArray(routePlan?.anchorEdgeIds) || !routePlan.anchorEdgeIds.length) {
    return [];
  }

  return getUniqueDestinationIds(routePlan.destinationIds || [routePlan.destinationId]);
}

function routeIncludesDestination(routePlan, destinationId) {
  const nextDestinationId = String(destinationId || '');

  if (!nextDestinationId) {
    return false;
  }

  return getUniqueDestinationIds(routePlan?.destinationIds || [routePlan?.destinationId]).includes(
    nextDestinationId
  );
}

function resolveRoutePlanForDestination(selectedDestinationId, candidatePlans) {
  const nextDestinationId = String(selectedDestinationId || '');

  if (!nextDestinationId) {
    return null;
  }

  return (
    (candidatePlans || []).find(
      (candidatePlan) => candidatePlan && routeIncludesDestination(candidatePlan, nextDestinationId)
    ) || null
  );
}

function getPreviewDestinationIds(destinationIds, excludedDestinationIds = []) {
  const excludedDestinationIdSet = new Set(getUniqueDestinationIds(excludedDestinationIds));

  return getUniqueDestinationIds(destinationIds).filter(
    (destinationId) => !excludedDestinationIdSet.has(destinationId)
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

function ensureTerrainSource(map) {
  if (!map.getSource(DEM_SOURCE_ID)) {
    map.addSource(DEM_SOURCE_ID, {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }
}

function applyThreeDimensionalMode(map, isEnabled) {
  ensureTerrainSource(map);

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

    return;
  }

  if (map.getLayer(BUILDINGS_LAYER_ID)) {
    map.removeLayer(BUILDINGS_LAYER_ID);
  }

  map.setTerrain(null);
  map.setFog(null);
  map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
}

function preventOverlayDoubleClickZoom(event) {
  event.preventDefault?.();
  event.originalEvent?.preventDefault?.();
}

function getEdgeMidpointCoordinates(edge) {
  const coordinates = edge?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  return coordinates[Math.floor(coordinates.length / 2)] || coordinates[0] || null;
}

function clampDistance(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function Home() {
  const router = useRouter();
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const geolocateControlRef = useRef(null);
  const trailColorModeRef = useRef(DEFAULT_TRAIL_COLOR_MODE);
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
  const lastAutoLocationRef = useRef(null);
  const isPlanningRef = useRef(false);
  const wasCurrentLocationOnRouteRef = useRef(false);
  const lastRouteProgressDistanceKmRef = useRef(null);
  const routeGraphRef = useRef(null);
  const routePlanRef = useRef(null);
  const selectedDestinationIdRef = useRef('');
  const selectedTrailFeatureRef = useRef(null);
  const isMacOSRef = useRef(false);
  const isMobileInteractionRef = useRef(false);
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
  const [selectedTrailSectionFeature, setSelectedTrailSectionFeature] = useState(null);
  const [selectedTrailClickCoordinates, setSelectedTrailClickCoordinates] = useState(null);
  const [selectedTrailCrossings, setSelectedTrailCrossings] = useState(null);
  const [selectedTrailElevationMetrics, setSelectedTrailElevationMetrics] = useState(null);
  const [trailColorMode, setTrailColorMode] = useState(DEFAULT_TRAIL_COLOR_MODE);
  const [mapView, setMapView] = useState(null);
  const [nearbyDestinationIds, setNearbyDestinationIds] = useState([]);
  const [plannedDestinationIds, setPlannedDestinationIds] = useState([]);
  const [loadedPrimaryDestinationIds, setLoadedPrimaryDestinationIds] = useState([]);
  const [loadedPreviewDestinationIds, setLoadedPreviewDestinationIds] = useState([]);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [routePlan, setRoutePlan] = useState(null);
  const [routeGraph, setRouteGraph] = useState(null);
  const [routeElevationMetrics, setRouteElevationMetrics] = useState(null);
  const [routeAnchorElevationMetrics, setRouteAnchorElevationMetrics] = useState([]);
  const [currentLocationCoordinates, setCurrentLocationCoordinates] = useState(null);
  const [isRouteTravelingReverse, setIsRouteTravelingReverse] = useState(false);
  const [isMacOS, setIsMacOS] = useState(false);
  const [isMobileInteraction, setIsMobileInteraction] = useState(false);

  const selectedDestination =
    destinations.find((destination) => destination.id === selectedDestinationId) || null;
  const nearbyDestinations = destinations.filter((destination) =>
    nearbyDestinationIds.includes(destination.id)
  );
  const selectedTrail = selectedTrailFeature?.properties || null;
  const selectedTrailLengthKm = selectedTrailSectionFeature
    ? getTrailSelectionLengthInKilometers(selectedTrailSectionFeature)
    : selectedTrailCrossings?.totalLengthKm || 0;
  const activeTrailLegendItems =
    trailColorMode === 'freshness' ? freshnessLegendItems : trailLegendItems;
  const activeRouteDestinationIds = useMemo(
    () =>
      getUniqueDestinationIds(
        routePlan?.anchorEdgeIds?.length ? routePlan.destinationIds : plannedDestinationIds
      ),
    [plannedDestinationIds, routePlan]
  );
  const primaryDestinationIds = useMemo(
    () => getUniqueDestinationIds([selectedDestinationId, ...activeRouteDestinationIds]),
    [activeRouteDestinationIds, selectedDestinationId]
  );
  const primaryDestinationIdsKey = primaryDestinationIds.join(',');
  const previewDestinationIds = getPreviewDestinationIds(
    nearbyDestinationIds,
    primaryDestinationIds
  );
  const previewDestinationIdsKey = previewDestinationIds.join(',');
  const availableTrailsGeoJson = useMemo(
    () => mergeTrailFeatureCollections([trailsGeoJson, suggestedTrailsGeoJson]),
    [trailsGeoJson, suggestedTrailsGeoJson]
  );
  const routeGraphTrailsGeoJson = useMemo(() => {
    if (!isPlanning) {
      return trailsGeoJson;
    }

    return mergeTrailFeatureCollections([trailsGeoJson, suggestedTrailsGeoJson]);
  }, [isPlanning, trailsGeoJson, suggestedTrailsGeoJson]);
  const routeTraversalGeoJson = useMemo(
    () => createRoutePlanGeoJson(routePlan, routeGraph).traversal,
    [routeGraph, routePlan]
  );
  const routeTraversalSegments = useMemo(() => {
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
  const routeSummary = useMemo(
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
  const selectedRouteInsights = useMemo(() => {
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
        ? (currentRouteProgress?.matchedFeature?.properties?.index ?? currentRouteProgress?.matchedFeatureIndex ?? -1) + 1
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

  useEffect(() => {
    trailColorModeRef.current = trailColorMode;
  }, [trailColorMode]);

  useEffect(() => {
    isPlanningRef.current = isPlanning;
  }, [isPlanning]);

  useEffect(() => {
    routeGraphRef.current = routeGraph;
  }, [routeGraph]);

  useEffect(() => {
    routePlanRef.current = routePlan;
  }, [routePlan]);

  useEffect(() => {
    selectedDestinationIdRef.current = selectedDestinationId;
  }, [selectedDestinationId]);

  useEffect(() => {
    selectedTrailFeatureRef.current = selectedTrailFeature;
  }, [selectedTrailFeature]);

  useEffect(() => {
    isMacOSRef.current = isMacOS;
  }, [isMacOS]);

  useEffect(() => {
    isMobileInteractionRef.current = isMobileInteraction;
  }, [isMobileInteraction]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined;
    }

    const mobileMediaQuery = window.matchMedia('(max-width: 640px)');
    const coarsePointerMediaQuery = window.matchMedia('(pointer: coarse)');
    const updateInteractionEnvironment = () => {
      setIsMacOS(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
      setIsMobileInteraction(
        mobileMediaQuery.matches ||
          coarsePointerMediaQuery.matches ||
          Number(navigator.maxTouchPoints) > 0
      );
    };

    updateInteractionEnvironment();

    const addListener = (mediaQuery) => {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', updateInteractionEnvironment);
        return () => mediaQuery.removeEventListener('change', updateInteractionEnvironment);
      }

      mediaQuery.addListener(updateInteractionEnvironment);
      return () => mediaQuery.removeListener(updateInteractionEnvironment);
    };

    const removeMobileListener = addListener(mobileMediaQuery);
    const removeCoarseListener = addListener(coarsePointerMediaQuery);
    window.addEventListener('resize', updateInteractionEnvironment);

    return () => {
      removeMobileListener();
      removeCoarseListener();
      window.removeEventListener('resize', updateInteractionEnvironment);
    };
  }, []);

  function clearSelectedTrail() {
    setSelectedTrailFeature(null);
    setSelectedTrailSectionFeature(null);
    setSelectedTrailClickCoordinates(null);
    setSelectedTrailCrossings(null);
    setSelectedTrailElevationMetrics(null);
  }

  function selectRouteEdge(edge, clickedCoordinates) {
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

  function handleSelectPlannedAnchor(edgeId) {
    const edge = routeGraphRef.current?.edges?.get(edgeId);

    if (!edge) {
      return;
    }

    selectRouteEdge(edge, getEdgeMidpointCoordinates(edge));
  }

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
    const hasLockedRoute = Boolean(routePlanRef.current?.anchorEdgeIds?.length);

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

    setSelectedDestinationId(destinationId);
    clearSelectedTrail();
    setNearbyDestinationIds([]);
    setLoadedPrimaryDestinationIds([]);
    setLoadedPreviewDestinationIds([]);
    setSuggestedTrailsGeoJson(null);

    if (hasLockedRoute) {
      return;
    }

    setPlannedDestinationIds([]);
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
    setRoutePlan((currentPlan) =>
      currentPlan?.anchorEdgeIds?.length
        ? currentPlan
        : createRoutePlan(selectedDestinationId, [])
    );
  }

  function handleClearPlan() {
    if (!selectedDestinationId) {
      return;
    }

    if (
      routePlan?.anchorEdgeIds.length &&
      typeof window !== 'undefined' &&
      !window.confirm('Clear the current planned route?')
    ) {
      return;
    }

    setRoutePlan(createRoutePlan(selectedDestinationId, []));
  }

  function handleReverseRoute() {
    if (!selectedDestinationId) {
      return;
    }

    setRoutePlan((currentPlan) =>
      reverseRoutePlan(currentPlan, currentPlan?.destinationId || selectedDestinationId)
    );
  }

  function handleRemoveAnchor(index) {
    if (!selectedDestinationId) {
      return;
    }

    setRoutePlan((currentPlan) =>
      removeRoutePlanAnchor(
        currentPlan,
        currentPlan?.destinationId || selectedDestinationId,
        index,
        routeGraphRef.current
      )
    );
  }

  function handleExportGpx() {
    if (!selectedDestination || typeof window === 'undefined') {
      return;
    }

    const routeFeatures = createRoutePlanGeoJson(routePlan, routeGraph).traversal.features;
    const routeName = `${selectedDestination.name} route`;
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
    if (!selectedDestination || typeof window === 'undefined') {
      return;
    }

    const shareUrl = window.location.href;
    const shareData = {
      title: `${selectedDestination.name} route`,
      text: `Planned route for ${selectedDestination.name}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
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

  function handlePlanningAnchorSelection(feature, clickedCoordinates) {
    const destinationId = selectedDestinationIdRef.current;
    const edgeId = findNearestRouteGraphEdgeId(
      routeGraphRef.current,
      feature?.properties?.id,
      clickedCoordinates
    );

    if (!destinationId || !edgeId) {
      return false;
    }

    clearSelectedTrail();
    setRoutePlan((currentPlan) =>
      appendRoutePlanAnchor(
        currentPlan,
        currentPlan?.destinationId || destinationId,
        edgeId,
        routeGraphRef.current
      )
    );
    return true;
  }

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

  useEffect(() => {
    if (!router.isReady || hasInitializedFromUrlRef.current) {
      return;
    }

    shouldOpenPlanningFromUrlRef.current = isPlanningModeQueryValue(
      getSingleQueryValue(router.query.planning)
    );
  }, [hasInitializedFromUrlRef, router.isReady, router.query.planning]);

  useEffect(() => {
    const map = mapRef.current;

    if (!router.isReady || !isMapLoaded || !map || isInitialMapViewSettled) {
      return;
    }

    if (shouldPreserveMapViewRef.current && !mapView) {
      return;
    }

    if (shouldPreserveMapViewRef.current && mapView) {
      map.jumpTo({
        center: [mapView.longitude, mapView.latitude],
        zoom: mapView.zoom,
      });

      skipNextTrailFitRef.current = true;
      pendingRouteViewportFitRef.current = '';
      shouldPreserveMapViewRef.current = false;
    }

    setIsInitialMapViewSettled(true);
    setMapReady(true);
  }, [router.isReady, isMapLoaded, isInitialMapViewSettled, mapView]);

  useEffect(() => {
    if (!routeGraphTrailsGeoJson?.features?.length) {
      setRouteGraph(null);
      return;
    }

    setRouteGraph(buildRouteGraph(routeGraphTrailsGeoJson));
  }, [routeGraphTrailsGeoJson]);

  useEffect(() => {
    if (
      !hasInitializedFromUrlRef.current ||
      !shouldOpenPlanningFromUrlRef.current ||
      !selectedDestinationId ||
      isPlanning
    ) {
      return;
    }

    setIsPlanning(true);
    setRoutePlan((currentPlan) =>
      currentPlan?.anchorEdgeIds?.length
        ? currentPlan
        : createRoutePlan(selectedDestinationId, [])
    );
    shouldOpenPlanningFromUrlRef.current = false;
  }, [hasInitializedFromUrlRef, isPlanning, selectedDestinationId]);

  useEffect(() => {
    if (!selectedDestinationId) {
      setPlannedDestinationIds([]);
      return;
    }

    if (routePlan) {
      setPlannedDestinationIds(getRouteDestinationIds(routePlan));
      return;
    }

    if (!router.isReady) {
      return;
    }

    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const routeFromUrl = decodeRoutePlanFromUrl(
      searchParams?.get('route') ?? getSingleQueryValue(router.query.route)
    );
    const routeFromStorage = readStoredRoutePlan(selectedDestinationId, MAP_SETTINGS_STORAGE_KEY);
    const persistedRoutePlan = resolveRoutePlanForDestination(selectedDestinationId, [
      routeFromUrl,
      routeFromStorage,
    ]);

    setPlannedDestinationIds(getRouteDestinationIds(persistedRoutePlan));
  }, [routePlan, router.isReady, router.query.route, selectedDestinationId]);

  useEffect(() => {
    if (!router.isReady || !selectedDestinationId || !routeGraph || routePlan !== null) {
      return;
    }

    const searchParams =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const routeFromUrl = decodeRoutePlanFromUrl(
      searchParams?.get('route') ?? getSingleQueryValue(router.query.route)
    );
    const routeFromStorage = readStoredRoutePlan(selectedDestinationId, MAP_SETTINGS_STORAGE_KEY);
    const nextRoutePlan = resolveRoutePlanForDestination(selectedDestinationId, [
      routeFromUrl,
      routeFromStorage,
    ]);
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
    const shouldRestorePlanningMode = routeFromUrl
      ? isPlanningRequestedFromUrl
      : shouldRestoreHydratedRoutePlan(nextRoutePlan, dismissedPlanningRouteKeyRef.current);

    if (hydratedRoutePlanKeyRef.current === hydrationScopeKey) {
      return;
    }

    hydratedRoutePlanKeyRef.current = hydrationScopeKey;

    if (!nextRoutePlan) {
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
  }, [loadedPrimaryDestinationIds, mapView, routeGraph, routePlan, router.isReady, selectedDestinationId]);

  useEffect(() => {
    if (
      !router.isReady ||
      !hasInitializedFromUrlRef.current ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const nextUrl = new URL(window.location.href);
    const routeFromCurrentUrl = decodeRoutePlanFromUrl(nextUrl.searchParams.get('route'));
    const encodedRoutePlan =
      routePlan && routePlan.anchorEdgeIds.length
        ? encodeRoutePlanToUrl(routePlan)
        : '';

    if (
      !encodedRoutePlan &&
      routePlan === null &&
      routeIncludesDestination(routeFromCurrentUrl, selectedDestinationId)
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
  }, [hasInitializedFromUrlRef, routePlan, router, selectedDestinationId]);

  useEffect(() => {
    if (
      !router.isReady ||
      !hasInitializedFromUrlRef.current ||
      typeof window === 'undefined'
    ) {
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
    if (!hasInitializedFromUrlRef.current || !selectedDestinationId) {
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
  }, [hasInitializedFromUrlRef, routePlan, selectedDestinationId]);

  useEffect(() => {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

    if (!accessToken && !isMapboxMockEnabled) {
      setMapError('Set NEXT_PUBLIC_MAPBOX_TOKEN in .env.local to load the map.');
      return undefined;
    }

    if (!isMapboxMockEnabled) {
      mapboxApi.accessToken = accessToken;
    }

    const map = new mapboxApi.Map({
      container: mapContainer.current,
      style: WINTER_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 7,
    });

    mapRef.current = map;

    map.addControl(new mapboxApi.NavigationControl(), 'top-right');
    geolocateControlRef.current = new mapboxApi.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      fitBoundsOptions: { maxZoom: GEOLOCATE_MAX_ZOOM },
    });

    map.addControl(geolocateControlRef.current, 'top-right');

    map.on('load', () => {
      try {
        applyWinterBasemap(map);
        ensureTerrainSource(map);
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

    applyThreeDimensionalMode(map, true);
  }, [mapReady]);

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

    async function maybeAutoSelectDestinationFromLocation(
      referenceCoordinates,
      options = {}
    ) {
      const { allowFallback = false } = options;

      if (hasManualDestinationSelectionRef.current || !referenceCoordinates) {
        return;
      }

      const lastLocation = lastAutoLocationRef.current;

      if (
        lastLocation &&
        getDistanceInKilometers(lastLocation, referenceCoordinates) <
          CURRENT_LOCATION_RECHECK_DISTANCE_KM
      ) {
        return;
      }

      lastAutoLocationRef.current = referenceCoordinates;

      try {
        const searchParams = new URLSearchParams({
          lng: String(referenceCoordinates[0]),
          lat: String(referenceCoordinates[1]),
        });
        const response = await fetch(`/api/trails?${searchParams.toString()}`);

        if (response.ok) {
          const nearbyTrailsGeoJson = await response.json();
          const nearbyDestination = findClosestDestinationByTrailProximity(
            destinations,
            nearbyTrailsGeoJson,
            referenceCoordinates,
            CURRENT_LOCATION_TRACK_MATCH_THRESHOLD_KM
          );

          if (nearbyDestination && selectedDestinationId !== nearbyDestination.id) {
            hasAutoSelectedDestinationRef.current = true;
            updateSelectedDestination(nearbyDestination.id);
            return;
          }
        }
      } catch (error) {
        console.warn('Skipped current-location trail proximity matching', error);
      }

      if (!allowFallback || selectedDestinationId) {
        return;
      }

      const fallbackDestination = findClosestDestination(destinations, referenceCoordinates);

      if (fallbackDestination && !hasAutoSelectedDestinationRef.current) {
        hasAutoSelectedDestinationRef.current = true;
        updateSelectedDestination(fallbackDestination.id);
      }
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
    const geolocateControl = geolocateControlRef.current;
    const handleGeolocate = (event) => {
      const nextCoordinates = [event.coords.longitude, event.coords.latitude];

      setCurrentLocationCoordinates(nextCoordinates);

      if (isCancelled || hasManualDestinationSelectionRef.current) {
        return;
      }

      void maybeAutoSelectDestinationFromLocation(nextCoordinates);
    };

    if (geolocateControl) {
      geolocateControl.on('geolocate', handleGeolocate);
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (isCancelled || hasManualDestinationSelectionRef.current) {
          return;
        }

        await maybeAutoSelectDestinationFromLocation(
          [
          position.coords.longitude,
          position.coords.latitude,
          ],
          { allowFallback: true }
        );
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

      if (geolocateControl) {
        geolocateControl.off('geolocate', handleGeolocate);
      }
    };
  }, [mapReady, destinations, selectedDestinationId]);

  useEffect(() => {
    wasCurrentLocationOnRouteRef.current = false;
    lastRouteProgressDistanceKmRef.current = null;
    setIsRouteTravelingReverse(false);
  }, [isPlanning, routePlan, selectedDestinationId]);

  useEffect(() => {
    if (isPlanning || !routePlan?.anchorEdgeIds?.length || !currentRouteProgress || !isCurrentLocationOnRoute) {
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
    routeGraph,
    routePlan,
    selectedRouteTraversalFeature,
  ]);

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

    if (!mapReady || !map || !selectedDestinationId || !primaryDestinationIds.length) {
      return undefined;
    }

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

              geojson = await response.json();
              writeCachedTrailGeoJson(destinationId, geojson, MAP_SETTINGS_STORAGE_KEY);
            }

            return geojson;
          })
        );

        if (isCancelled) {
          return;
        }

        const selectedDestinationIndex = primaryDestinationIds.indexOf(selectedDestinationId);
        const selectedDestinationGeoJson =
          selectedDestinationIndex >= 0 ? primaryCollections[selectedDestinationIndex] : null;
        const geojson = mergeTrailFeatureCollections(primaryCollections);

        setTrailsGeoJson(geojson);
        setLoadedPrimaryDestinationIds(primaryDestinationIds);

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
              'line-color': getTrailColorExpression(trailColorModeRef.current),
              'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
              'line-opacity': ACTIVE_TRAIL_OPACITY,
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

            const clickedCoordinates = [event.lngLat.lng, event.lngLat.lat];

            if (
              isPlanningSelectionInteraction({
                isPlanning: isPlanningRef.current,
                isMobileInteraction: isMobileInteractionRef.current,
                isMacOS: isMacOSRef.current,
                originalEvent: event.originalEvent,
              }) &&
              handlePlanningAnchorSelection(feature, clickedCoordinates)
            ) {
              setIsSettingsPanelOpen(false);
              setIsInfoPanelOpen(false);
              return;
            }

            const isSameSelectedTrail =
              selectedTrailFeatureRef.current?.properties?.id != null &&
              String(selectedTrailFeatureRef.current.properties.id) === String(feature.properties.id);

            if (isSameSelectedTrail) {
              clearSelectedTrail();
              setIsSettingsPanelOpen(false);
              setIsInfoPanelOpen(false);
              return;
            }

            setIsSettingsPanelOpen(false);
            setIsInfoPanelOpen(false);
            setSelectedTrailFeature(feature);
            setSelectedTrailClickCoordinates(clickedCoordinates);
          });

          map.on('mouseenter', TRAILS_HIT_LAYER_ID, () => {
            map.getCanvas().style.cursor = 'pointer';
          });

          map.on('mouseleave', TRAILS_HIT_LAYER_ID, () => {
            map.getCanvas().style.cursor = '';
          });
        }

        if (skipNextTrailFitRef.current || isPlanningRef.current) {
          skipNextTrailFitRef.current = false;
        } else {
          fitMapToGeoJson(map, selectedDestinationGeoJson || geojson, DEFAULT_CENTER);
        }
        setTrailsStatus('success');
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLoadedPrimaryDestinationIds([]);
        setTrailsStatus('error');
        setRequestError(error.message);
      }
    }

    loadTrails();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, primaryDestinationIdsKey, selectedDestinationId]);

  useEffect(() => {
    if (!mapReady || !previewDestinationIds.length) {
      setSuggestedTrailsGeoJson(null);
      setLoadedPreviewDestinationIds([]);
      return undefined;
    }

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

              const geojson = await response.json();
              writeCachedTrailGeoJson(destinationId, geojson, MAP_SETTINGS_STORAGE_KEY);
              return geojson;
            } catch (error) {
              return getFeatureCollectionGeoJson([]);
            }
          })
        );

        const geojson = mergeTrailFeatureCollections(previewCollections);

        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson(geojson);
        setLoadedPreviewDestinationIds(previewDestinationIds);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setSuggestedTrailsGeoJson(null);
        setLoadedPreviewDestinationIds(previewDestinationIds);
      }
    }

    loadSuggestedTrails();

    return () => {
      isCancelled = true;
    };
  }, [mapReady, previewDestinationIdsKey]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer(TRAILS_LAYER_ID)) {
      return;
    }

    map.setPaintProperty(TRAILS_LAYER_ID, 'line-color', getTrailColorExpression(trailColorMode));
  }, [mapReady, trailColorMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !map.getLayer(TRAILS_LAYER_ID)) {
      return;
    }

    const activeTrailFeatureIds =
      !isPlanning &&
      routePlan?.destinationId === selectedDestinationId &&
      routePlan.anchorEdgeIds.length
        ? [...new Set(
            routeTraversalGeoJson.features
              .map((feature) => feature?.properties?.trailFeatureId)
              .filter((trailFeatureId) => trailFeatureId != null)
              .map(String)
          )]
        : [];

    map.setPaintProperty(
      TRAILS_LAYER_ID,
      'line-opacity',
      getTrailOpacityExpression(activeTrailFeatureIds)
    );
  }, [isPlanning, mapReady, routePlan, routeTraversalGeoJson, selectedDestinationId]);

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
          'line-opacity': PREVIEW_TRAIL_OPACITY,
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
        const clickedCoordinates = [event.lngLat.lng, event.lngLat.lat];

        if (
          isPlanningSelectionInteraction({
            isPlanning: isPlanningRef.current,
            isMobileInteraction: isMobileInteractionRef.current,
            isMacOS: isMacOSRef.current,
            originalEvent: event.originalEvent,
          }) &&
          handlePlanningAnchorSelection(feature, clickedCoordinates)
        ) {
          setIsSettingsPanelOpen(false);
          setIsInfoPanelOpen(false);
          return;
        }

        const destinationId = feature?.properties?.destinationid;

        if (!destinationId) {
          return;
        }

        const prefetchedTrailsGeoJson = readCachedTrailGeoJson(
          String(destinationId),
          MAP_SETTINGS_STORAGE_KEY,
          TRAILS_CACHE_TTL_MS
        );

        skipNextTrailFitRef.current = true;
        setIsSettingsPanelOpen(false);
        setIsInfoPanelOpen(false);
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
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const routePlanGeoJson = createRoutePlanGeoJson(routePlan, routeGraph);

    if (map.getSource(ROUTE_PLAN_ANCHORS_SOURCE_ID)) {
      map.getSource(ROUTE_PLAN_ANCHORS_SOURCE_ID).setData(routePlanGeoJson.anchors);
    } else {
      map.addSource(ROUTE_PLAN_ANCHORS_SOURCE_ID, {
        type: 'geojson',
        data: routePlanGeoJson.anchors,
      });

      map.addLayer({
        id: ROUTE_PLAN_ANCHORS_LAYER_ID,
        type: 'line',
        source: ROUTE_PLAN_ANCHORS_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#1f5fa8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 11, 6],
          'line-opacity': 0.95,
        },
      });

      map.on('dblclick', ROUTE_PLAN_ANCHORS_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID)) {
      map.getSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID).setData(routePlanGeoJson.directions);
    } else {
      map.addSource(ROUTE_PLAN_DIRECTIONS_SOURCE_ID, {
        type: 'geojson',
        data: routePlanGeoJson.directions,
      });

      map.addLayer({
        id: ROUTE_PLAN_DIRECTIONS_LAYER_ID,
        type: 'symbol',
        source: ROUTE_PLAN_DIRECTIONS_SOURCE_ID,
        layout: {
          'symbol-placement': 'line',
          'symbol-spacing': 120,
          'text-field': '▶',
          'text-size': ['interpolate', ['linear'], ['zoom'], 7, 10, 11, 14],
          'text-keep-upright': false,
          'symbol-z-order': 'source',
        },
        paint: {
          'text-color': '#123f74',
          'text-halo-color': '#f7fbff',
          'text-halo-width': 1.5,
          'text-opacity': 0.9,
        },
      });

      map.on('dblclick', ROUTE_PLAN_DIRECTIONS_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getLayer(ROUTE_PLAN_ANCHORS_LAYER_ID)) {
      map.moveLayer(ROUTE_PLAN_ANCHORS_LAYER_ID);
    }

    if (map.getLayer(ROUTE_PLAN_DIRECTIONS_LAYER_ID)) {
      map.moveLayer(ROUTE_PLAN_DIRECTIONS_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return undefined;
  }, [mapReady, routeGraph, routePlan]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map || !routePlan || routePlan.destinationId !== selectedDestinationId) {
      return;
    }

    const encodedRoutePlan = encodeRoutePlanToUrl(routePlan);

    if (!encodedRoutePlan || pendingRouteViewportFitRef.current !== encodedRoutePlan) {
      return;
    }

    const routePlanGeoJson = createRoutePlanGeoJson(routePlan, routeGraph);
    const featureCollection = {
      type: 'FeatureCollection',
      features: routePlanGeoJson.anchors.features,
    };

    if (!featureCollection.features.length) {
      return;
    }

    fitMapToGeoJson(map, featureCollection, selectedDestination?.coordinates || DEFAULT_CENTER);
    pendingRouteViewportFitRef.current = '';
  }, [mapReady, routeGraph, routePlan, selectedDestination, selectedDestinationId]);

  useEffect(() => {
    const routePlanGeoJson = createRoutePlanGeoJson(routePlan, routeGraph);
    const routeFeatures = routePlanGeoJson.traversal.features;
    const routeAnchorFeatures = routeFeatures.filter(
      (feature) => feature.properties?.role === 'traversal-anchor'
    );

    if (!routeFeatures.length || !selectedDestinationId) {
      setRouteElevationMetrics(null);
      setRouteAnchorElevationMetrics([]);
      return undefined;
    }

    let isCancelled = false;

    fetch('/api/elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationId: selectedDestinationId,
        routeTraversal: routeFeatures.map((feature) => feature.geometry),
        routeSections: routeAnchorFeatures.map((feature) => ({
          sectionKey: String(feature.properties?.index ?? 0),
          geometry: feature.geometry,
        })),
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled) {
          return;
        }

        setRouteElevationMetrics(data.route?.status === 'ok' ? data.route.metrics : null);
        setRouteAnchorElevationMetrics(
          (data.sections || []).map((section) =>
            section.status === 'ok' ? section.metrics : null
          )
        );
      })
      .catch((error) => {
        if (!isCancelled) {
          console.warn('Skipped route ascent/descent calculation', error);
          setRouteElevationMetrics(null);
          setRouteAnchorElevationMetrics([]);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [routeGraph, routePlan, selectedDestinationId]);

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

      setNearbyDestinationIds(
        sortedNearbyAlternatives
          .slice(0, MAX_NEARBY_DESTINATION_PREVIEWS)
          .map((destination) => destination.id)
      );
    }, DESTINATION_SUGGESTION_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [mapView, selectedDestinationId, selectedDestination, destinations]);

  useEffect(() => {
    if (!selectedTrailFeature || !availableTrailsGeoJson.features.length) {
      setSelectedTrailSectionFeature(null);
      setSelectedTrailCrossings(null);
      return;
    }

    const selectedSection = getClickedTrailSection(
      selectedTrailFeature,
      selectedTrailClickCoordinates,
      availableTrailsGeoJson,
      destinations,
      DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
      MIN_SEGMENT_DISTANCE_KM
    );

    setSelectedTrailSectionFeature(selectedSection?.feature || selectedTrailFeature);
    setSelectedTrailCrossings(
      selectedSection?.crossingMetrics ||
        getCrossingMetrics(
        selectedTrailFeature,
        availableTrailsGeoJson,
        destinations,
        DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
        MIN_SEGMENT_DISTANCE_KM
      )
    );
  }, [availableTrailsGeoJson, selectedTrailFeature, selectedTrailClickCoordinates, destinations]);

  useEffect(() => {
    if (!selectedElevationFeature || !selectedDestinationId) {
      setSelectedTrailElevationMetrics(null);
      return undefined;
    }

    let isCancelled = false;

    fetch('/api/elevation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destinationId: selectedDestinationId,
        routeTraversal: [selectedElevationFeature.geometry],
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isCancelled) {
          setSelectedTrailElevationMetrics(
            data.route?.status === 'ok' ? data.route.metrics : null
          );
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.warn('Skipped trail ascent/descent calculation', error);
          setSelectedTrailElevationMetrics(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    selectedDestinationId,
    selectedElevationFeature,
  ]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const selectedTrailGeoJson = getFeatureCollectionGeoJson(
      selectedTrailSectionFeature ? [selectedTrailSectionFeature] : []
    );

    if (map.getSource(SELECTED_TRAIL_SOURCE_ID)) {
      map.getSource(SELECTED_TRAIL_SOURCE_ID).setData(selectedTrailGeoJson);

      if (map.getLayer(SELECTED_TRAIL_COLOR_LAYER_ID)) {
        map.setPaintProperty(
          SELECTED_TRAIL_COLOR_LAYER_ID,
          'line-color',
          getTrailColorExpression(trailColorMode)
        );
      }
    } else {
      map.addSource(SELECTED_TRAIL_SOURCE_ID, {
        type: 'geojson',
        data: selectedTrailGeoJson,
      });

      map.addLayer({
        id: SELECTED_TRAIL_GLOW_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': 'rgba(246, 252, 255, 0.95)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 6, 11, 11],
          'line-opacity': 0.9,
          'line-blur': 0.8,
        },
      });

      map.addLayer({
        id: SELECTED_TRAIL_BORDER_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#173127',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 3, 11, 6],
          'line-opacity': 0.9,
        },
      });

      map.addLayer({
        id: SELECTED_TRAIL_COLOR_LAYER_ID,
        type: 'line',
        source: SELECTED_TRAIL_SOURCE_ID,
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': getTrailColorExpression(trailColorMode),
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 2, 11, 5],
          'line-opacity': 1,
        },
      });

      map.on('dblclick', SELECTED_TRAIL_GLOW_LAYER_ID, preventOverlayDoubleClickZoom);
      map.on('dblclick', SELECTED_TRAIL_BORDER_LAYER_ID, preventOverlayDoubleClickZoom);
      map.on('dblclick', SELECTED_TRAIL_COLOR_LAYER_ID, preventOverlayDoubleClickZoom);
    }

    if (map.getLayer(SELECTED_TRAIL_GLOW_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_GLOW_LAYER_ID);
    }

    if (map.getLayer(SELECTED_TRAIL_BORDER_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_BORDER_LAYER_ID);
    }

    if (map.getLayer(SELECTED_TRAIL_COLOR_LAYER_ID)) {
      map.moveLayer(SELECTED_TRAIL_COLOR_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return undefined;
  }, [mapReady, selectedTrailSectionFeature, trailColorMode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapReady || !map) {
      return undefined;
    }

    const activeTraversalGeoJson =
      !isPlanning &&
      routePlan?.destinationId === selectedDestinationId &&
      routePlan.anchorEdgeIds.length
        ? routeTraversalGeoJson
        : null;

    const labelsGeoJson = getAllTrailSegmentLabelsGeoJson(
      trailsGeoJson,
      destinations,
      DESTINATION_ENDPOINT_MATCH_THRESHOLD_KM,
      MIN_SEGMENT_DISTANCE_KM,
      activeTraversalGeoJson
    );

    if (map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID)) {
      map.getSource(TRAIL_SEGMENT_LABELS_SOURCE_ID).setData(labelsGeoJson);
    } else {
      map.addSource(TRAIL_SEGMENT_LABELS_SOURCE_ID, {
        type: 'geojson',
        data: labelsGeoJson,
      });
    }

    if (map.getLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID)) {
      map.removeLayer(TRAIL_SEGMENT_LABELS_GLOW_LAYER_ID);
    }

    if (!map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.addLayer({
        id: TRAIL_SEGMENT_LABELS_LAYER_ID,
        type: 'symbol',
        source: TRAIL_SEGMENT_LABELS_SOURCE_ID,
        minzoom: TRAIL_SEGMENT_LABELS_MIN_ZOOM,
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 13],
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 0],
          'text-anchor': 'center',
          'text-padding': 2,
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'symbol-sort-key': ['*', -1, ['coalesce', ['get', 'distanceKm'], 0]],
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

    if (map.getLayer(TRAIL_SEGMENT_LABELS_LAYER_ID)) {
      map.moveLayer(TRAIL_SEGMENT_LABELS_LAYER_ID);
    }

    return undefined;
  }, [
    destinations,
    isPlanning,
    mapReady,
    routeGraph,
    routePlan,
    selectedDestinationId,
    trailsGeoJson,
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
