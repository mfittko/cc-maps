import { createRoutePlan } from './route-plan';

function getLineCoordinates(geometry) {
  if (!geometry) {
    return [];
  }

  if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }

  if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter((coordinates) => Array.isArray(coordinates));
  }

  return [];
}

function getPointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];

  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }

  const projection =
    ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy);
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const projectedPoint = [
    start[0] + dx * clampedProjection,
    start[1] + dy * clampedProjection,
  ];

  return Math.hypot(point[0] - projectedPoint[0], point[1] - projectedPoint[1]);
}

function getPointToLineDistance(point, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (coordinates.length === 1) {
    return Math.hypot(point[0] - coordinates[0][0], point[1] - coordinates[0][1]);
  }

  let shortestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < coordinates.length; index += 1) {
    shortestDistance = Math.min(
      shortestDistance,
      getPointToSegmentDistance(point, coordinates[index - 1], coordinates[index])
    );
  }

  return shortestDistance;
}

export function isPlanningSelectionInteraction({
  isPlanning,
  isMobileInteraction,
  isMacOS,
  originalEvent,
}) {
  if (!isPlanning) {
    return false;
  }

  if (isMobileInteraction) {
    return true;
  }

  return isMacOS ? Boolean(originalEvent?.metaKey) : Boolean(originalEvent?.ctrlKey);
}

export function appendRoutePlanAnchor(routePlan, destinationId, edgeId) {
  const nextAnchorEdgeIds = [...(routePlan?.anchorEdgeIds || [])];

  if (typeof edgeId === 'string' && edgeId) {
    nextAnchorEdgeIds.push(edgeId);
  }

  return createRoutePlan(destinationId, nextAnchorEdgeIds);
}

export function removeRoutePlanAnchor(routePlan, destinationId, index) {
  if (!routePlan?.anchorEdgeIds?.length) {
    return createRoutePlan(destinationId, []);
  }

  return createRoutePlan(
    destinationId,
    routePlan.anchorEdgeIds.filter((_, anchorIndex) => anchorIndex !== index)
  );
}

export function reverseRoutePlan(routePlan, destinationId) {
  return createRoutePlan(destinationId, [...(routePlan?.anchorEdgeIds || [])].reverse());
}

export function findNearestRouteGraphEdgeId(graph, trailFeatureId, clickedCoordinates) {
  if (!graph?.edges || trailFeatureId == null || !Array.isArray(clickedCoordinates)) {
    return null;
  }

  let nearestEdgeId = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  graph.edges.forEach((edge, edgeId) => {
    if (String(edge?.trailFeatureId) !== String(trailFeatureId)) {
      return;
    }

    const distance = getPointToLineDistance(clickedCoordinates, edge.coordinates);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestEdgeId = edgeId;
    }
  });

  return nearestEdgeId;
}

function createLineFeature(edge, properties) {
  if (!edge?.coordinates?.length) {
    return null;
  }

  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: edge.coordinates,
    },
  };
}

export function createRoutePlanGeoJson(routePlan, routeResult, routeGraph) {
  const anchorFeatures = (routePlan?.anchorEdgeIds || [])
    .map((edgeId, index) =>
      createLineFeature(routeGraph?.edges?.get(edgeId), {
        edgeId,
        index,
        role: 'anchor',
      })
    )
    .filter(Boolean);

  const connectorFeatures = (routeResult?.connections || [])
    .flatMap((connection, connectionIndex) =>
      (connection.connectorEdgeIds || []).map((edgeId, edgeIndex) =>
        createLineFeature(routeGraph?.edges?.get(edgeId), {
          edgeId,
          connectionIndex,
          edgeIndex,
          role: 'connector',
        })
      )
    )
    .filter(Boolean);

  return {
    anchors: {
      type: 'FeatureCollection',
      features: anchorFeatures,
    },
    connectors: {
      type: 'FeatureCollection',
      features: connectorFeatures,
    },
  };
}
