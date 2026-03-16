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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const destinationId = parseIntegerParam(req.query.destinationid);

  if (destinationId === null) {
    return res.status(400).json({
      error: 'destinationid must be a positive integer when provided',
    });
  }

  const queryParams = {
    where: destinationId === undefined ? '1=1' : `destinationid=${destinationId}`,
    outFields: TRAIL_FIELDS,
  };

  if (destinationId === undefined) {
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