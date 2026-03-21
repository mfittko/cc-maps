import {
  SPORET_LAYER_IDS,
  fetchSporetGeoJson,
  parseIntegerParam,
} from '../../lib/sporet';

const TRAIL_FIELDS = [
  'id',
  'destinationid',
  'trailtypesymbol',
  'prepsymbol',
  'warningtext',
  'has_classic',
  'has_skating',
  'has_floodlight',
  'is_scootertrail',
  'st_length(shape)',
].join(',');

const UNFILTERED_TRAIL_LIMIT = '250';
const PROXIMITY_TRAIL_LIMIT = '25';
const PROXIMITY_MATCH_DISTANCE_KM = '0.05';

function parseCoordinateParam(value, min, max) {
  if (Array.isArray(value)) {
    return null;
  }

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < min || parsedValue > max) {
    return null;
  }

  return parsedValue;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const destinationId = parseIntegerParam(req.query.destinationid);
  const longitude = parseCoordinateParam(req.query.lng, -180, 180);
  const latitude = parseCoordinateParam(req.query.lat, -90, 90);

  if (destinationId === null) {
    return res.status(400).json({
      error: 'destinationid must be a positive integer when provided',
    });
  }

  if (longitude === null || latitude === null) {
    return res.status(400).json({
      error: 'lng and lat must be valid coordinates when provided',
    });
  }

  if ((longitude === undefined) !== (latitude === undefined)) {
    return res.status(400).json({
      error: 'lng and lat must be provided together',
    });
  }

  const queryParams: Record<string, string> = {
    where: destinationId === undefined ? '1=1' : `destinationid=${destinationId}`,
    outFields: TRAIL_FIELDS,
  };

  if (destinationId === undefined && longitude !== undefined && latitude !== undefined) {
    queryParams.geometry = `${longitude},${latitude}`;
    queryParams.geometryType = 'esriGeometryPoint';
    queryParams.inSR = '4326';
    queryParams.spatialRel = 'esriSpatialRelIntersects';
    queryParams.distance = PROXIMITY_MATCH_DISTANCE_KM;
    queryParams.units = 'esriSRUnit_Kilometer';
    queryParams.resultRecordCount = PROXIMITY_TRAIL_LIMIT;
  } else if (destinationId === undefined) {
    queryParams.resultRecordCount = UNFILTERED_TRAIL_LIMIT;
  }

  try {
    const data = await fetchSporetGeoJson(SPORET_LAYER_IDS.trails, queryParams);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}