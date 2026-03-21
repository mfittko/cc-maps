import { SPORET_LAYER_IDS, fetchSporetGeoJson } from '../../lib/sporet';

const DESTINATION_FIELDS = ['id', 'name', 'prepsymbol', 'is_active'].join(',');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = await fetchSporetGeoJson(SPORET_LAYER_IDS.destinations, {
      where: 'is_active=1',
      outFields: DESTINATION_FIELDS,
      orderByFields: 'name ASC',
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}