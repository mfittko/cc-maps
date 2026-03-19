import { getElevationChangeMetrics } from '../../lib/map-domain.js';
import {
  DEFAULT_SAMPLE_SPACING_METERS,
  TERRAIN_RGB_TILESET,
  sampleCoordinatesFromGeometry,
  sampleElevationsAlongCoordinates,
} from '../../lib/terrain-rgb.js';

const MAX_GEOMETRY_COORDINATES = 50000;
const MAX_SECTION_COUNT = 200;
const VALID_GEOMETRY_TYPES = new Set(['LineString', 'MultiLineString']);

const ELEVATION_SOURCE = {
  id: TERRAIN_RGB_TILESET,
  type: 'terrain-rgb',
  attribution: '© Mapbox',
};

function getMapboxToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || '';
}

function countCoordinates(geometry) {
  if (geometry.type === 'LineString') {
    return geometry.coordinates.length;
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.reduce((total, ring) => total + ring.length, 0);
  }

  /* v8 ignore next -- geometry types are validated before counting */
  return 0;
}

function isValidLineGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    return false;
  }

  if (!VALID_GEOMETRY_TYPES.has(geometry.type)) {
    return false;
  }

  if (!Array.isArray(geometry.coordinates)) {
    return false;
  }

  const lines =
    geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;

  for (const line of lines) {
    if (!Array.isArray(line)) {
      return false;
    }

    for (const coord of line) {
      if (
        !Array.isArray(coord) ||
        coord.length < 2 ||
        !Number.isFinite(coord[0]) ||
        !Number.isFinite(coord[1]) ||
        coord[0] < -180 ||
        coord[0] > 180 ||
        coord[1] < -90 ||
        coord[1] > 90
      ) {
        return false;
      }
    }
  }

  return true;
}

function buildUnavailableMetrics(reason) {
  return { status: 'unavailable', unavailableReason: reason };
}

function buildOkMetrics(metrics) {
  return { status: 'ok', metrics };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getMapboxToken();

  if (!token) {
    return res.status(503).json({ error: 'Elevation service is not configured' });
  }

  let body;

  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body);
  } catch {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }

  const { destinationId, routeTraversal, routeSections = [], requestContext } = body;

  if (!destinationId || typeof destinationId !== 'string' || !/^\d+$/.test(destinationId)) {
    return res.status(400).json({ error: 'destinationId must be a non-empty numeric string' });
  }

  if (!Array.isArray(routeTraversal) || routeTraversal.length === 0) {
    return res.status(400).json({ error: 'routeTraversal must be a non-empty array of line geometries' });
  }

  for (const geometry of routeTraversal) {
    if (!isValidLineGeometry(geometry)) {
      return res.status(400).json({ error: 'routeTraversal contains an invalid or unsupported geometry' });
    }
  }

  if (!Array.isArray(routeSections)) {
    return res.status(400).json({ error: 'routeSections must be an array when provided' });
  }

  if (routeSections.length > MAX_SECTION_COUNT) {
    return res.status(413).json({ error: `routeSections exceeds the maximum of ${MAX_SECTION_COUNT} sections` });
  }

  for (const section of routeSections) {
    if (!section || typeof section !== 'object') {
      return res.status(400).json({ error: 'Each routeSection must be an object' });
    }

    if (typeof section.sectionKey !== 'string' || !section.sectionKey) {
      return res.status(400).json({ error: 'Each routeSection must have a non-empty string sectionKey' });
    }

    if (!isValidLineGeometry(section.geometry)) {
      return res.status(400).json({ error: `routeSection "${section.sectionKey}" contains an invalid or unsupported geometry` });
    }
  }

  const totalCoordinateCount = [
    ...routeTraversal,
    ...routeSections.map((s) => s.geometry),
  ].reduce((total, geometry) => total + countCoordinates(geometry), 0);

  if (totalCoordinateCount > MAX_GEOMETRY_COORDINATES) {
    return res.status(413).json({ error: `Request geometry exceeds the maximum of ${MAX_GEOMETRY_COORDINATES} coordinates` });
  }

  const traversalSampledCoords = routeTraversal.flatMap((geometry) =>
    sampleCoordinatesFromGeometry(geometry, DEFAULT_SAMPLE_SPACING_METERS)
  );

  const sectionSampledCoords = routeSections.map((section) =>
    sampleCoordinatesFromGeometry(section.geometry, DEFAULT_SAMPLE_SPACING_METERS)
  );

  const allCoordinates = [
    ...traversalSampledCoords,
    ...sectionSampledCoords.flat(),
  ];

  let allElevations;

  try {
    allElevations = await sampleElevationsAlongCoordinates(allCoordinates, token);
  } catch (err) {
    const upstreamStatus = err.status;

    if (upstreamStatus >= 500) {
      return res.status(502).json({ error: 'Elevation data source is temporarily unavailable' });
    }

    if (upstreamStatus === 429) {
      return res.status(503).json({ error: 'Elevation data source rate limit reached' });
    }

    return res.status(502).json({ error: 'Failed to retrieve elevation data' });
  }

  const traversalElevations = allElevations.slice(0, traversalSampledCoords.length);
  let offset = traversalSampledCoords.length;

  const routeMetrics = getElevationChangeMetrics(traversalElevations);
  const routeResult = routeMetrics
    ? buildOkMetrics(routeMetrics)
    : buildUnavailableMetrics('Insufficient elevation samples for route traversal');

  const sectionResults = routeSections.map((section, index) => {
    const sectionCoordCount = sectionSampledCoords[index].length;
    const sectionElevations = allElevations.slice(offset, offset + sectionCoordCount);

    offset += sectionCoordCount;

    const metrics = getElevationChangeMetrics(sectionElevations);

    return {
      sectionKey: section.sectionKey,
      ...(metrics ? buildOkMetrics(metrics) : buildUnavailableMetrics('Insufficient elevation samples for section')),
    };
  });

  const allSectionsOk = sectionResults.every((s) => s.status === 'ok');
  const someSectionsOk = sectionResults.some((s) => s.status === 'ok');

  let overallStatus;

  if (routeResult.status !== 'ok') {
    overallStatus = 'unavailable';
  } else if (routeSections.length === 0 || allSectionsOk) {
    overallStatus = 'ok';
  } else if (someSectionsOk) {
    overallStatus = 'partial';
  } else {
    overallStatus = 'partial';
  }

  return res.status(200).json({
    status: overallStatus,
    sampleSpacingMeters: DEFAULT_SAMPLE_SPACING_METERS,
    source: ELEVATION_SOURCE,
    route: routeResult,
    sections: sectionResults,
  });
}
