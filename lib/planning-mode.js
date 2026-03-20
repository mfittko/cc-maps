import { createRoutePlan } from './route-plan';

function getRoutePlanDestinationIds(destinationId, anchorEdgeIds, graph) {
  const nextDestinationIds = [String(destinationId)];

  (anchorEdgeIds || []).forEach((edgeId) => {
    const edgeDestinationId = graph?.edges?.get(edgeId)?.destinationId;

    if (!edgeDestinationId || nextDestinationIds.includes(edgeDestinationId)) {
      return;
    }

    nextDestinationIds.push(edgeDestinationId);
  });

  return nextDestinationIds;
}

function getOppositeNodeId(edge, nodeId) {
  if (!edge || !nodeId) {
    return null;
  }

  if (edge.from === nodeId) {
    return edge.to;
  }

  if (edge.to === nodeId) {
    return edge.from;
  }

  return null;
}

function getOrientedEdgeCoordinates(edge, startNodeId, endNodeId) {
  if (!edge?.coordinates?.length) {
    return null;
  }

  if (startNodeId === edge.from && endNodeId === edge.to) {
    return edge.coordinates;
  }

  if (startNodeId === edge.to && endNodeId === edge.from) {
    return [...edge.coordinates].reverse();
  }

  return edge.coordinates;
}

function getSharedNodeId(firstEdge, secondEdge) {
  if (!firstEdge || !secondEdge) {
    return null;
  }

  return [firstEdge.from, firstEdge.to].find(
    (nodeId) => nodeId === secondEdge.from || nodeId === secondEdge.to
  ) || null;
}

function buildAnchorEntries(routePlan, routeGraph) {
  const anchorEdgeIds = routePlan?.anchorEdgeIds || [];

  return anchorEdgeIds.map((edgeId) => ({
    edgeId,
    edge: routeGraph?.edges?.get(edgeId) || null,
    entryNodeId: null,
    exitNodeId: null,
  }));
}

function applyAnchorTraversalContext(anchorEntries) {
  for (let index = 0; index < anchorEntries.length - 1; index += 1) {
    const fromAnchor = anchorEntries[index];
    const toAnchor = anchorEntries[index + 1];

    if (!fromAnchor?.edge || !toAnchor?.edge) {
      continue;
    }

    if (fromAnchor.exitNodeId && toAnchor.entryNodeId) {
      continue;
    }

    const sharedNodeId = getSharedNodeId(fromAnchor.edge, toAnchor.edge);

    if (!sharedNodeId) {
      continue;
    }

    fromAnchor.exitNodeId = sharedNodeId;
    toAnchor.entryNodeId = sharedNodeId;
  }
}

function buildRouteDirectionFeatures(routePlan, routeGraph) {
  const anchorEdgeIds = routePlan?.anchorEdgeIds || [];

  if (!routeGraph?.edges || anchorEdgeIds.length === 0) {
    return [];
  }

  const anchorEntries = buildAnchorEntries(routePlan, routeGraph);
  const features = [];
  applyAnchorTraversalContext(anchorEntries);

  anchorEntries.forEach((anchorEntry, index) => {
    if (!anchorEntry.edge) {
      return;
    }

    let startNodeId = anchorEntry.entryNodeId;
    let endNodeId = anchorEntry.exitNodeId;

    if (!startNodeId && endNodeId) {
      startNodeId = getOppositeNodeId(anchorEntry.edge, endNodeId);
    }

    if (startNodeId && !endNodeId) {
      endNodeId = getOppositeNodeId(anchorEntry.edge, startNodeId);
    }

    if (!startNodeId || !endNodeId) {
      startNodeId = anchorEntry.edge.from;
      endNodeId = anchorEntry.edge.to;
    }

    const coordinates = getOrientedEdgeCoordinates(anchorEntry.edge, startNodeId, endNodeId);

    if (!coordinates?.length) {
      return;
    }

    features.push({
      type: 'Feature',
      properties: {
        role: 'direction',
        edgeId: anchorEntry.edgeId,
        index,
      },
      geometry: {
        type: 'LineString',
        coordinates,
      },
    });
  });

  return features;
}

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

export function shouldMergePreviewTrailsIntoRouteGraph(isPlanning, plannedDestinationIds) {
  return Boolean(isPlanning || plannedDestinationIds?.length);
}

function getRouteGraphEdge(graph, edgeId) {
  return graph?.edges?.get(edgeId) || null;
}

function edgesAreAdjacent(graph, firstEdgeId, secondEdgeId) {
  const firstEdge = getRouteGraphEdge(graph, firstEdgeId);
  const secondEdge = getRouteGraphEdge(graph, secondEdgeId);

  if (!firstEdge || !secondEdge) {
    return false;
  }

  return [firstEdge.from, firstEdge.to].some(
    (nodeId) => nodeId === secondEdge.from || nodeId === secondEdge.to
  );
}

export function reorderAnchorEdgeIds(anchorEdgeIds, graph) {
  if (!Array.isArray(anchorEdgeIds) || anchorEdgeIds.length < 2 || !graph?.edges) {
    return anchorEdgeIds || [];
  }

  const uniqueEdgeIds = [...new Set(anchorEdgeIds)].filter((edgeId) => getRouteGraphEdge(graph, edgeId));

  if (uniqueEdgeIds.length < 2) {
    return uniqueEdgeIds.length ? uniqueEdgeIds : anchorEdgeIds;
  }

  const firstEdgeId = uniqueEdgeIds[0];
  const originalIndexByEdgeId = new Map(uniqueEdgeIds.map((edgeId, index) => [edgeId, index]));
  const selectedNeighborMap = new Map(uniqueEdgeIds.map((edgeId) => [edgeId, []]));

  for (let leftIndex = 0; leftIndex < uniqueEdgeIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < uniqueEdgeIds.length; rightIndex += 1) {
      const leftEdgeId = uniqueEdgeIds[leftIndex];
      const rightEdgeId = uniqueEdgeIds[rightIndex];

      if (!edgesAreAdjacent(graph, leftEdgeId, rightEdgeId)) {
        continue;
      }

      selectedNeighborMap.get(leftEdgeId).push(rightEdgeId);
      selectedNeighborMap.get(rightEdgeId).push(leftEdgeId);
    }
  }

  selectedNeighborMap.forEach((neighbors, edgeId) => {
    neighbors.sort(
      (leftEdgeId, rightEdgeId) =>
        originalIndexByEdgeId.get(leftEdgeId) - originalIndexByEdgeId.get(rightEdgeId)
    );
  });

  const path = [firstEdgeId];
  const visitedEdgeIds = new Set(path);

  function dfs(currentEdgeId) {
    if (path.length === uniqueEdgeIds.length) {
      return true;
    }

    const nextCandidates = (selectedNeighborMap.get(currentEdgeId) || []).filter(
      (edgeId) => !visitedEdgeIds.has(edgeId)
    );

    for (const nextEdgeId of nextCandidates) {
      visitedEdgeIds.add(nextEdgeId);
      path.push(nextEdgeId);

      if (dfs(nextEdgeId)) {
        return true;
      }

      path.pop();
      visitedEdgeIds.delete(nextEdgeId);
    }

    return false;
  }

  if (dfs(firstEdgeId)) {
    return path;
  }

  return [
    ...path,
    ...uniqueEdgeIds.filter((edgeId) => !visitedEdgeIds.has(edgeId)),
  ];
}

export function appendRoutePlanAnchor(routePlan, destinationId, edgeId, graph) {
  const nextAnchorEdgeIds = [...(routePlan?.anchorEdgeIds || [])];

  if (typeof edgeId === 'string' && edgeId) {
    const existingIndex = nextAnchorEdgeIds.indexOf(edgeId);

    if (existingIndex >= 0) {
      nextAnchorEdgeIds.splice(existingIndex, 1);
    } else {
      nextAnchorEdgeIds.push(edgeId);
    }
  }

  const reorderedAnchorEdgeIds = reorderAnchorEdgeIds(nextAnchorEdgeIds, graph);

  return createRoutePlan(
    destinationId,
    reorderedAnchorEdgeIds,
    getRoutePlanDestinationIds(destinationId, reorderedAnchorEdgeIds, graph)
  );
}

export function removeRoutePlanAnchor(routePlan, destinationId, index, graph) {
  if (!routePlan?.anchorEdgeIds?.length) {
    return createRoutePlan(destinationId, []);
  }

  const nextAnchorEdgeIds = routePlan.anchorEdgeIds.filter(
    (_, anchorIndex) => anchorIndex !== index
  );

  return createRoutePlan(
    destinationId,
    nextAnchorEdgeIds,
    getRoutePlanDestinationIds(destinationId, nextAnchorEdgeIds, graph)
  );
}

export function reverseRoutePlan(routePlan, destinationId) {
  const nextAnchorEdgeIds = [...(routePlan?.anchorEdgeIds || [])].reverse();

  return createRoutePlan(
    destinationId,
    nextAnchorEdgeIds,
    routePlan?.destinationIds || [destinationId]
  );
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

function createOrientedLineFeature(edge, startNodeId, endNodeId, properties) {
  const coordinates = getOrientedEdgeCoordinates(edge, startNodeId, endNodeId);

  if (!coordinates?.length) {
    return null;
  }

  return {
    type: 'Feature',
    properties: {
      ...properties,
      trailFeatureId: edge?.trailFeatureId ?? null,
    },
    geometry: {
      type: 'LineString',
      coordinates,
    },
  };
}

export function findNearestRouteTraversalFeature(traversalGeoJson, trailFeatureId, clickedCoordinates) {
  const traversalFeatures = traversalGeoJson?.features;

  if (!Array.isArray(traversalFeatures) || trailFeatureId == null || !Array.isArray(clickedCoordinates)) {
    return null;
  }

  let nearestFeature = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  traversalFeatures.forEach((feature) => {
    if (String(feature?.properties?.trailFeatureId) !== String(trailFeatureId)) {
      return;
    }

    const lineCoordinatesSets = getLineCoordinates(feature.geometry);
    const distance = lineCoordinatesSets.reduce(
      (nearestLineDistance, lineCoordinates) =>
        Math.min(nearestLineDistance, getPointToLineDistance(clickedCoordinates, lineCoordinates)),
      Number.POSITIVE_INFINITY
    );

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestFeature = feature;
    }
  });

  return nearestFeature;
}

function buildRouteTraversalFeatures(routePlan, routeGraph) {
  const anchorEdgeIds = routePlan?.anchorEdgeIds || [];

  if (!routeGraph?.edges || anchorEdgeIds.length === 0) {
    return [];
  }

  const anchorEntries = buildAnchorEntries(routePlan, routeGraph);
  applyAnchorTraversalContext(anchorEntries);

  return anchorEntries.flatMap((anchorEntry, index) => {
    if (!anchorEntry.edge) {
      return [];
    }

    let startNodeId = anchorEntry.entryNodeId;
    let endNodeId = anchorEntry.exitNodeId;

    if (!startNodeId && endNodeId) {
      startNodeId = getOppositeNodeId(anchorEntry.edge, endNodeId);
    }

    if (startNodeId && !endNodeId) {
      endNodeId = getOppositeNodeId(anchorEntry.edge, startNodeId);
    }

    if (!startNodeId || !endNodeId) {
      startNodeId = anchorEntry.edge.from;
      endNodeId = anchorEntry.edge.to;
    }

    const features = [];
    const anchorFeature = createOrientedLineFeature(anchorEntry.edge, startNodeId, endNodeId, {
      role: 'traversal-anchor',
      edgeId: anchorEntry.edgeId,
      index,
    });

    if (anchorFeature) {
      features.push(anchorFeature);
    }

    return features;
  });
}

export function createRoutePlanGeoJson(routePlan, routeGraph) {
  const anchorFeatures = (routePlan?.anchorEdgeIds || [])
    .map((edgeId, index) =>
      createLineFeature(routeGraph?.edges?.get(edgeId), {
        edgeId,
        index,
        role: 'anchor',
      })
    )
    .filter(Boolean);

  return {
    anchors: {
      type: 'FeatureCollection',
      features: anchorFeatures,
    },
    directions: {
      type: 'FeatureCollection',
      features: buildRouteDirectionFeatures(routePlan, routeGraph),
    },
    traversal: {
      type: 'FeatureCollection',
      features: buildRouteTraversalFeatures(routePlan, routeGraph),
    },
  };
}
