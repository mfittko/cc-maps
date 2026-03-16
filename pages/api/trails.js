/**
 * API Route: /api/trails
 *
 * This Next.js API route acts as a proxy to the Sporet ArcGIS REST API.  It
 * queries the `Loypetype` (ID: 6) layer of the public `Sporet_Simple` service
 * and returns the resulting GeoJSON.
 *
 * Query parameters:
 *   destinationid (optional) – integer.  When provided the query will
 *   filter by `destinationid=<value>`.  If omitted, all trails are returned
 *   (subject to the server's max record count).
 */
export default async function handler(req, res) {
  const { destinationid } = req.query;
  const baseUrl =
    process.env.SPORET_API_BASE_URL ||
    'https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer';
  const layerId = 6;
  const whereClause = destinationid ? `destinationid=${destinationid}` : '1=1';
  const query = new URLSearchParams({
    where: whereClause,
    outFields: '*',
    returnGeometry: 'true',
    f: 'geojson',
  });
  const url = `${baseUrl}/${layerId}/query?${query.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Sporet API request failed: ${response.status}`);
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}