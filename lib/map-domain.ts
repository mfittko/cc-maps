import type { GeoBounds } from '../types/geo';

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

function projectCoordinatesToKilometers(coordinates, referenceLatitude) {
  const [longitude, latitude] = coordinates;
  const latitudeScale = 110.574;
  const longitudeScale = 111.32 * Math.cos(toRadians(referenceLatitude));

  return {
    x: longitude * longitudeScale,
    y: latitude * latitudeScale,
  };
}

function getDistanceFromPointToSegmentKm(referenceCoordinates, startCoordinates, endCoordinates) {
  const closestPoint = getClosestPointOnSegment(referenceCoordinates, startCoordinates, endCoordinates);

  return closestPoint.distanceKm;
}

function getClosestPointOnSegment(referenceCoordinates, startCoordinates, endCoordinates) {
  const referenceLatitude =
    (referenceCoordinates[1] + startCoordinates[1] + endCoordinates[1]) / 3;
  const point = projectCoordinatesToKilometers(referenceCoordinates, referenceLatitude);
  const start = projectCoordinatesToKilometers(startCoordinates, referenceLatitude);
  const end = projectCoordinatesToKilometers(endCoordinates, referenceLatitude);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;

  if (segmentLengthSquared === 0) {
    return {
      distanceKm: Math.hypot(point.x - start.x, point.y - start.y),
      segmentFactor: 0,
    };
  }

  const projection =
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / segmentLengthSquared;
  const segmentFactor = Math.min(1, Math.max(0, projection));
  const closestPointX = start.x + deltaX * segmentFactor;
  const closestPointY = start.y + deltaY * segmentFactor;

  return {
    distanceKm: Math.hypot(point.x - closestPointX, point.y - closestPointY),
    segmentFactor,
  };
}

function getDistanceFromPointToTrailKm(referenceCoordinates, feature) {
  const lineStrings = getLineStrings(feature?.geometry);
  let closestDistanceKm = Number.POSITIVE_INFINITY;

  lineStrings.forEach((coordinates) => {
    for (let index = 1; index < coordinates.length; index += 1) {
      const candidateDistanceKm = getDistanceFromPointToSegmentKm(
        referenceCoordinates,
        coordinates[index - 1],
        coordinates[index]
      );

      if (candidateDistanceKm < closestDistanceKm) {
        closestDistanceKm = candidateDistanceKm;
      }
    }
  });

  return closestDistanceKm;
}

export function findClosestDestinationByTrailProximity(
  destinations,
  trailsGeoJson,
  referenceCoordinates,
  thresholdKm
) {
  if (!destinations.length || !trailsGeoJson?.features?.length || !referenceCoordinates) {
    return null;
  }

  const destinationsById = new Map(destinations.map((destination) => [String(destination.id), destination]));
  let bestMatch = null;

  trailsGeoJson.features.forEach((feature) => {
    const destinationId = String(feature?.properties?.destinationid || '');
    const destination = destinationsById.get(destinationId);

    if (!destination) {
      return;
    }

    const distanceKm = getDistanceFromPointToTrailKm(referenceCoordinates, feature);

    if (distanceKm > thresholdKm) {
      return;
    }

    if (!bestMatch || distanceKm < bestMatch.distanceKm) {
      bestMatch = {
        destination,
        distanceKm,
      };
    }
  });

  return bestMatch?.destination || null;
}

export function getLineStrings(geometry) {
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
  /* v8 ignore next -- malformed coordinate arrays are guarded here defensively */
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

export function getTrailSelectionLengthInKilometers(feature) {
  if (!feature) {
    return 0;
  }

  return getFeatureLengthInKilometers(feature);
}

export function getRouteProgressMetrics(routeTraversalGeoJson, referenceCoordinates) {
  const traversalFeatures = routeTraversalGeoJson?.features;

  if (!Array.isArray(traversalFeatures) || !Array.isArray(referenceCoordinates)) {
    return null;
  }

  let traversedDistanceKm = 0;
  let closestMatch = null;

  traversalFeatures.forEach((feature, index) => {
    const positionMetrics = getTrailPositionMetrics(feature, referenceCoordinates);
    const segmentDistanceKm = positionMetrics.totalLengthKm;
    const segmentStartKm = traversedDistanceKm;
    const segmentEndKm = segmentStartKm + segmentDistanceKm;

    if (
      Number.isFinite(positionMetrics.distanceToTrailKm) &&
      (!closestMatch || positionMetrics.distanceToTrailKm < closestMatch.distanceToRouteKm)
    ) {
      closestMatch = {
        matchedFeature: feature,
        matchedFeatureIndex: index,
        distanceAlongFeatureKm: positionMetrics.distanceAlongTrailKm,
        distanceToRouteKm: positionMetrics.distanceToTrailKm,
        distanceTraveledKm: segmentStartKm + positionMetrics.distanceAlongTrailKm,
        segmentDistanceKm,
        segmentStartKm,
        segmentEndKm,
        segmentRemainingKm: Math.max(0, segmentDistanceKm - positionMetrics.distanceAlongTrailKm),
      };
    }

    traversedDistanceKm = segmentEndKm;
  });

  if (!closestMatch) {
    return null;
  }

  return {
    ...closestMatch,
    distanceRemainingKm: Math.max(0, traversedDistanceKm - closestMatch.distanceTraveledKm),
    totalDistanceKm: traversedDistanceKm,
  };
}

export function getSampledCoordinatesAlongFeature(feature, sampleSpacingMeters = 25) {
  if (!feature) {
    return [];
  }

  const totalLengthKm = getFeatureLengthInKilometers(feature);
  const endpoints = getTrailEndpoints(feature);

  if (!totalLengthKm) {
    return endpoints.start ? [endpoints.start] : [];
  }

  const stepKm = Math.max(sampleSpacingMeters / 1000, 0.005);
  const sampledCoordinates = [];

  for (let distanceKm = 0; distanceKm < totalLengthKm; distanceKm += stepKm) {
    const coordinate = getCoordinateAlongTrail(feature, distanceKm);

    if (coordinate) {
      sampledCoordinates.push(coordinate);
    }
  }

  const endCoordinate = getCoordinateAlongTrail(feature, totalLengthKm);

  if (endCoordinate) {
    const lastCoordinate = sampledCoordinates[sampledCoordinates.length - 1];

    if (!lastCoordinate || getDistanceInKilometers(lastCoordinate, endCoordinate) > 1e-6) {
      sampledCoordinates.push(endCoordinate);
    }
  }

  return sampledCoordinates;
}

export function getElevationChangeMetrics(elevations) {
  if (!Array.isArray(elevations)) {
    return null;
  }

  let ascentMeters = 0;
  let descentMeters = 0;
  let previousElevation = null;
  let validSampleCount = 0;

  elevations.forEach((elevation) => {
    if (!Number.isFinite(elevation)) {
      return;
    }

    validSampleCount += 1;

    if (previousElevation !== null) {
      const deltaMeters = elevation - previousElevation;

      if (deltaMeters > 0) {
        ascentMeters += deltaMeters;
      } else {
        descentMeters += Math.abs(deltaMeters);
      }
    }

    previousElevation = elevation;
  });

  if (validSampleCount < 2) {
    return null;
  }

  return {
    ascentMeters: Math.round(ascentMeters),
    descentMeters: Math.round(descentMeters),
  };
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
  /* v8 ignore next -- distance requests from public callers stay within feature length */
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

function getTrailPositionMetrics(feature, referenceCoordinates) {
  const lineStrings = getLineStrings(feature?.geometry);
  let traversedDistanceKm = 0;
  let closestMatch = null;

  lineStrings.forEach((coordinates) => {
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      const segmentLengthKm = getDistanceInKilometers(start, end);
      const closestPoint = getClosestPointOnSegment(referenceCoordinates, start, end);
      const distanceAlongTrailKm = traversedDistanceKm + segmentLengthKm * closestPoint.segmentFactor;

      if (!closestMatch || closestPoint.distanceKm < closestMatch.distanceToTrailKm) {
        closestMatch = {
          distanceAlongTrailKm,
          distanceToTrailKm: closestPoint.distanceKm,
        };
      }

      traversedDistanceKm += segmentLengthKm;
    }
  });

  return {
    distanceAlongTrailKm: closestMatch?.distanceAlongTrailKm ?? 0,
    distanceToTrailKm: closestMatch?.distanceToTrailKm ?? Number.POSITIVE_INFINITY,
    totalLengthKm: traversedDistanceKm,
  };
}

function getDistanceAlongTrail(feature, referenceCoordinates) {
  return getTrailPositionMetrics(feature, referenceCoordinates).distanceAlongTrailKm;
}

function interpolateCoordinate(start, end, segmentFactor) {
  return [
    start[0] + (end[0] - start[0]) * segmentFactor,
    start[1] + (end[1] - start[1]) * segmentFactor,
  ];
}

function getTrailGeometryBetweenDistances(feature, startDistanceKm, endDistanceKm) {
  const lineStrings = getLineStrings(feature?.geometry);
  const geometryParts = [];
  let currentPart = [];
  let traversedDistanceKm = 0;

  lineStrings.forEach((coordinates) => {
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1];
      const end = coordinates[index];
      const segmentLengthKm = getDistanceInKilometers(start, end);
      const segmentStartKm = traversedDistanceKm;
      const segmentEndKm = traversedDistanceKm + segmentLengthKm;
      const overlapStartKm = Math.max(startDistanceKm, segmentStartKm);
      const overlapEndKm = Math.min(endDistanceKm, segmentEndKm);

      if (overlapStartKm < overlapEndKm || Math.abs(overlapStartKm - overlapEndKm) < 1e-9) {
        const startFactor =
          segmentLengthKm === 0 ? 0 : (overlapStartKm - segmentStartKm) / segmentLengthKm;
        const endFactor =
          segmentLengthKm === 0 ? 0 : (overlapEndKm - segmentStartKm) / segmentLengthKm;
        const startCoordinate = interpolateCoordinate(start, end, startFactor);
        const endCoordinate = interpolateCoordinate(start, end, endFactor);

        if (!currentPart.length) {
          currentPart.push(startCoordinate);
        }

        const lastCoordinate = currentPart[currentPart.length - 1];
        if (getDistanceInKilometers(lastCoordinate, startCoordinate) > 1e-6) {
          currentPart.push(startCoordinate);
        }

        currentPart.push(endCoordinate);
      } else if (currentPart.length > 1) {
        geometryParts.push(currentPart);
        currentPart = [];
      }

      traversedDistanceKm += segmentLengthKm;
    }
  });

  if (currentPart.length > 1) {
    geometryParts.push(currentPart);
  }

  /* v8 ignore next -- public section selection does not produce empty geometry parts */
  if (!geometryParts.length) {
    return null;
  }

  if (geometryParts.length === 1) {
    return {
      type: 'LineString',
      coordinates: geometryParts[0],
    };
  }

  /* v8 ignore next -- contiguous interval slicing currently produces a single path */
  return {
    type: 'MultiLineString',
    coordinates: geometryParts,
  };
}

function getTrailSectionFeature(feature, segment) {
  const geometry = getTrailGeometryBetweenDistances(
    feature,
    segment.startDistanceKm,
    segment.endDistanceKm
  );

  /* v8 ignore next -- segment selections that exist currently always yield geometry */
  if (!geometry) {
    return feature;
  }

  return {
    type: 'Feature',
    properties: {
      ...feature.properties,
    },
    geometry,
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
        startDistanceKm,
        endDistanceKm,
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
          distanceKm: segment.distanceKm,
          isPlanned: Boolean(segment.isPlanned),
          label: formatDistance(segment.distanceKm),
          route: `${segment.fromLabel} to ${segment.toLabel}`,
          trailFeatureId: segment.trailFeatureId ?? null,
        },
      })),
  };
}

function isCoordinateWithinBounds(coordinates, bounds: GeoBounds | null) {
  if (!Array.isArray(coordinates) || !bounds) {
    return true;
  }

  const [longitude, latitude] = coordinates;
  const isWithinLongitudeRange =
    bounds.west <= bounds.east
      ? longitude >= bounds.west && longitude <= bounds.east
      : longitude >= bounds.west || longitude <= bounds.east;

  return isWithinLongitudeRange && latitude >= bounds.south && latitude <= bounds.north;
}

function getDistanceFromPointToGeometryKm(referenceCoordinates, geometry) {
  return getLineStrings(geometry).reduce((closestDistanceKm, coordinates) => {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return closestDistanceKm;
    }

    let nearestLineDistanceKm = closestDistanceKm;

    for (let index = 1; index < coordinates.length; index += 1) {
      nearestLineDistanceKm = Math.min(
        nearestLineDistanceKm,
        getDistanceFromPointToSegmentKm(referenceCoordinates, coordinates[index - 1], coordinates[index])
      );
    }

    return nearestLineDistanceKm;
  }, Number.POSITIVE_INFINITY);
}

function filterSegmentsByTraversal(segments, traversalGeoJson, matchThresholdKm = 0.02) {
  const traversalFeatures = traversalGeoJson?.features;

  if (!Array.isArray(traversalFeatures) || !traversalFeatures.length) {
    return [];
  }

  return segments.filter((segment) =>
    traversalFeatures.some((feature) => {
      if (
        segment.trailFeatureId != null &&
        feature?.properties?.trailFeatureId != null &&
        String(segment.trailFeatureId) !== String(feature.properties.trailFeatureId)
      ) {
        return false;
      }

      return (
        getDistanceFromPointToGeometryKm(segment.midpointCoordinates, feature?.geometry) <= matchThresholdKm
      );
    })
  );
}

export function getAllTrailSegmentLabelsGeoJson(
  trailsGeoJson,
  destinations,
  endpointMatchThresholdKm,
  minSegmentDistanceKm,
  traversalGeoJson = null,
  viewportBounds: GeoBounds | null = null
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

    return (crossingMetrics?.segments || []).map((segment) => ({
      ...segment,
      trailFeatureId: feature?.properties?.id ?? null,
    }));
  }).filter((segment) => Array.isArray(segment.midpointCoordinates));

  const plannedSegments = traversalGeoJson
    ? filterSegmentsByTraversal(allSegments, traversalGeoJson).map((segment) => ({
        ...segment,
        isPlanned: true,
      }))
    : allSegments.map((segment) => ({
        ...segment,
        isPlanned: false,
      }));

  const visibleSegments = plannedSegments.filter((segment) =>
    isCoordinateWithinBounds(segment.midpointCoordinates, viewportBounds)
  );

  return getTrailSegmentLabelsGeoJson(visibleSegments);
}

export function getSegmentIntersection(firstStart, firstEnd, secondStart, secondEnd) {
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
    secondFactor,
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

export function getClickedTrailSection(
  clickedFeature,
  clickedCoordinates,
  trailsGeoJson,
  destinations,
  endpointMatchThresholdKm,
  minSegmentDistanceKm
) {
  if (!clickedFeature) {
    return null;
  }

  const crossingMetrics = getCrossingMetrics(
    clickedFeature,
    trailsGeoJson,
    destinations,
    endpointMatchThresholdKm,
    minSegmentDistanceKm
  );

  if (!crossingMetrics?.segments?.length) {
    return {
      crossingMetrics,
      feature: clickedFeature,
      segment: null,
    };
  }

  const distanceAlongTrailKm = clickedCoordinates
    ? getDistanceAlongTrail(clickedFeature, clickedCoordinates)
    : 0;
  const segment =
    crossingMetrics.segments.find(
      (candidate) =>
        distanceAlongTrailKm >= candidate.startDistanceKm - 1e-6 &&
        distanceAlongTrailKm <= candidate.endDistanceKm + 1e-6
    ) ||
    crossingMetrics.segments.reduce((closestSegment, candidate) => {
      if (!closestSegment) {
        return candidate;
      }

      const closestDistance = Math.abs(
        distanceAlongTrailKm -
          (closestSegment.startDistanceKm + closestSegment.endDistanceKm) / 2
      );
      const candidateDistance = Math.abs(
        distanceAlongTrailKm - (candidate.startDistanceKm + candidate.endDistanceKm) / 2
      );

      return candidateDistance < closestDistance ? candidate : closestSegment;
    }, null);

  return {
    crossingMetrics,
    feature: segment ? getTrailSectionFeature(clickedFeature, segment) : clickedFeature,
    segment,
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