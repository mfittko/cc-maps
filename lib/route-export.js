function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collectRouteCoordinates(routeFeatures) {
  if (!Array.isArray(routeFeatures)) {
    return [];
  }

  return routeFeatures.reduce((coordinates, feature) => {
    const featureCoordinates = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;

    if (!Array.isArray(featureCoordinates) || featureCoordinates.length === 0) {
      return coordinates;
    }

    featureCoordinates.forEach((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return;
      }

      const previousCoordinate = coordinates[coordinates.length - 1];

      if (
        previousCoordinate &&
        previousCoordinate[0] === coordinate[0] &&
        previousCoordinate[1] === coordinate[1]
      ) {
        return;
      }

      coordinates.push(coordinate);
    });

    return coordinates;
  }, []);
}

export function createGpxFromRouteFeatures(routeFeatures, options = {}) {
  const coordinates = collectRouteCoordinates(routeFeatures);

  if (coordinates.length < 2) {
    return '';
  }

  const routeName = options.name || 'CC Maps route';
  const trackPoints = coordinates
    .map(
      ([longitude, latitude]) =>
        `      <trkpt lat="${latitude}" lon="${longitude}"></trkpt>`
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="cc-maps" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    `    <name>${escapeXml(routeName)}</name>`,
    '    <trkseg>',
    trackPoints,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
  ].join('\n');
}

export function createGpxFileName(routeName) {
  const normalizedName = String(routeName || 'cc-maps-route')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${normalizedName || 'cc-maps-route'}.gpx`;
}