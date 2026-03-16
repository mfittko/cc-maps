export function getDestinationSummary(feature, fallbackCenter) {
  return {
    id: String(feature.properties.id),
    name: feature.properties.name,
    prepSymbol: feature.properties.prepsymbol,
    coordinates: feature.geometry?.coordinates || fallbackCenter,
  };
}

export function getSuggestedDestinationGeoJson(destinations) {
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

export function getDestinationsWithinRadius(destinations, referenceCoordinates, radiusKm, excludedId) {
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

export function getDistanceInKilometers(fromCoordinates, toCoordinates) {
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

function getNearestDestinationLabel(referenceCoordinates, destinations, endpointMatchThresholdKm) {
  if (!referenceCoordinates || !destinations.length) {
    return null;
  }

  const closestDestination = findClosestDestination(destinations, referenceCoordinates);
  const distanceKm = getDistanceInKilometers(referenceCoordinates, closestDestination.coordinates);

  return distanceKm <= endpointMatchThresholdKm ? closestDestination.name : null;
}

function normalizePathPoints(pathPoints, minSegmentDistanceKm) {
  return pathPoints.reduce((normalizedPoints, point) => {
    const previousPoint = normalizedPoints[normalizedPoints.length - 1];

    if (!previousPoint) {
      normalizedPoints.push(point);
      return normalizedPoints;
    }

    if (
      Math.abs(point.distanceFromStartKm - previousPoint.distanceFromStartKm) < minSegmentDistanceKm
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

function buildTrailSegments(
  selectedTrailFeature,
  crossingMetrics,
  destinations,
  endpointMatchThresholdKm,
  minSegmentDistanceKm
) {
  const endpoints = getTrailEndpoints(selectedTrailFeature);
  const pathPoints = normalizePathPoints(
    [
      {
        kind: 'start',
        label: getNearestDestinationLabel(
          endpoints.start,
          destinations,
          endpointMatchThresholdKm
        ) || 'Trail start',
        distanceFromStartKm: 0,
      },
      ...crossingMetrics.crossings.map((crossing, index) => ({
        kind: 'crossing',
        label: `Crossing ${index + 1}`,
        distanceFromStartKm: crossing.distanceFromStartKm,
      })),
      {
        kind: 'end',
        label: getNearestDestinationLabel(
          endpoints.end,
          destinations,
          endpointMatchThresholdKm
        ) || 'Trail end',
        distanceFromStartKm: crossingMetrics.totalLengthKm,
      },
    ],
    minSegmentDistanceKm
  );

  return pathPoints
    .slice(1)
    .map((point, index) => {
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
    })
    .filter((segment) => segment.distanceKm >= minSegmentDistanceKm);
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

export function getAllTrailSegmentLabelsGeoJson(
  trailsGeoJson,
  destinations,
  endpointMatchThresholdKm,
  minSegmentDistanceKm
) {
  if (!trailsGeoJson?.features?.length) {
    return getTrailSegmentLabelsGeoJson([]);
  }

  const allSegments = trailsGeoJson.features.flatMap((feature) => {
    const crossingMetrics = getCrossingMetrics(
      feature,
      trailsGeoJson,
      destinations,
      endpointMatchThresholdKm,
      minSegmentDistanceKm
    );

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

export function getCrossingMetrics(
  selectedTrailFeature,
  trailsGeoJson,
  destinations,
  endpointMatchThresholdKm,
  minSegmentDistanceKm
) {
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
  const totalLengthKm = getFeatureLengthInKilometers(selectedTrailFeature);

  return {
    crossings: uniqueCrossings,
    segments: buildTrailSegments(
      selectedTrailFeature,
      {
        crossings: uniqueCrossings,
        totalLengthKm,
      },
      destinations,
      endpointMatchThresholdKm,
      minSegmentDistanceKm
    ),
    totalLengthKm,
  };
}

export function formatDistance(distanceKm) {
  return `${distanceKm.toFixed(1)} km`;
}

export function findClosestDestination(destinations, referenceCoordinates) {
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