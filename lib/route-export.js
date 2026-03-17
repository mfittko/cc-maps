function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collectRouteSegments(routeFeatures) {
  if (!Array.isArray(routeFeatures)) {
    return [];
  }

  return routeFeatures.reduce((segments, feature) => {
    const featureCoordinates = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : null;

    if (!Array.isArray(featureCoordinates) || featureCoordinates.length === 0) {
      return segments;
    }

    const nextSegment = [];

    featureCoordinates.forEach((coordinate) => {
      if (!Array.isArray(coordinate) || coordinate.length < 2) {
        return;
      }

      const previousCoordinate = nextSegment[nextSegment.length - 1];

      if (
        previousCoordinate &&
        previousCoordinate[0] === coordinate[0] &&
        previousCoordinate[1] === coordinate[1]
      ) {
        return;
      }

      nextSegment.push(coordinate);
    });

    if (nextSegment.length >= 2) {
      segments.push(nextSegment);
    }

    return segments;
  }, []);
}

export function createGpxFromRouteFeatures(routeFeatures, options = {}) {
  const segments = collectRouteSegments(routeFeatures);

  if (!segments.length) {
    return '';
  }

  const routeName = options.name || 'CC Maps route';
  const trackSegments = segments
    .map((coordinates) => {
      const trackPoints = coordinates
        .map(
          ([longitude, latitude]) =>
            `      <trkpt lat="${latitude}" lon="${longitude}"></trkpt>`
        )
        .join('\n');

      return ['    <trkseg>', trackPoints, '    </trkseg>'].join('\n');
    })
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="cc-maps" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <trk>',
    `    <name>${escapeXml(routeName)}</name>`,
    trackSegments,
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