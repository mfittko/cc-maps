import { createRoutePlan } from './route-plan';

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

function buildConnectorTraversal(graph, fromEdge, toEdge, connectorEdgeIds) {
  if (!graph?.edges || !fromEdge || !toEdge || !Array.isArray(connectorEdgeIds)) {
    return null;
  }

  if (connectorEdgeIds.length === 0) {
    const sharedNodeId = [fromEdge.from, fromEdge.to].find(
      (nodeId) => nodeId === toEdge.from || nodeId === toEdge.to
    );

    return sharedNodeId
      ? {
          connectorSegments: [],
          fromConnectionNodeId: sharedNodeId,
          toConnectionNodeId: sharedNodeId,
        }
      : null;
  }

  const connectorEdges = connectorEdgeIds
    .map((edgeId) => graph.edges.get(edgeId))
    .filter(Boolean);

  if (connectorEdges.length !== connectorEdgeIds.length) {
    return null;
  }

  const startingNodeCandidates = [connectorEdges[0].from, connectorEdges[0].to].filter(
    (nodeId) => nodeId === fromEdge.from || nodeId === fromEdge.to
  );

  for (const startingNodeId of startingNodeCandidates) {
    const connectorSegments = [];
    let currentNodeId = startingNodeId;
    let isValidTraversal = true;

    for (const edge of connectorEdges) {
      const nextNodeId = getOppositeNodeId(edge, currentNodeId);

      if (!nextNodeId) {
        isValidTraversal = false;
        break;
      }

      connectorSegments.push({
        edge,
        startNodeId: currentNodeId,
        endNodeId: nextNodeId,
      });
      currentNodeId = nextNodeId;
    }

    if (!isValidTraversal) {
      continue;
    }

    if (currentNodeId === toEdge.from || currentNodeId === toEdge.to) {
      return {
        connectorSegments,
        fromConnectionNodeId: startingNodeId,
        toConnectionNodeId: currentNodeId,
      };
    }
  }

  return null;
}

function buildRouteDirectionFeatures(routePlan, routeResult, routeGraph) {
  const anchorEdgeIds = routePlan?.anchorEdgeIds || [];

  if (!routeGraph?.edges || anchorEdgeIds.length === 0) {
    return [];
  }

  const anchorEntries = anchorEdgeIds.map((edgeId) => ({
    edgeId,
    edge: routeGraph.edges.get(edgeId) || null,
    entryNodeId: null,
    exitNodeId: null,
  }));

  const features = [];

  (routeResult?.connections || []).forEach((connection, index) => {
    const fromAnchor = anchorEntries[index];
    const toAnchor = anchorEntries[index + 1];

    if (!fromAnchor?.edge || !toAnchor?.edge || !Array.isArray(connection.connectorEdgeIds)) {
      return;
    }

    const traversal = buildConnectorTraversal(
      routeGraph,
      fromAnchor.edge,
      toAnchor.edge,
      connection.connectorEdgeIds
    );

    if (!traversal) {
      return;
    }

    fromAnchor.exitNodeId = traversal.fromConnectionNodeId;
    toAnchor.entryNodeId = traversal.toConnectionNodeId;

    traversal.connectorSegments.forEach((segment, connectorIndex) => {
      const coordinates = getOrientedEdgeCoordinates(
        segment.edge,
        segment.startNodeId,
        segment.endNodeId
      );

      if (!coordinates?.length) {
        return;
      }

      features.push({
        type: 'Feature',
        properties: {
          role: 'direction',
          edgeId: segment.edge.id,
          connectionIndex: index,
          connectorIndex,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      });
    });
  });

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

export function appendRoutePlanAnchor(routePlan, destinationId, edgeId) {
  const nextAnchorEdgeIds = [...(routePlan?.anchorEdgeIds || [])];

  if (typeof edgeId === 'string' && edgeId) {
    const existingIndex = nextAnchorEdgeIds.indexOf(edgeId);

    if (existingIndex >= 0) {
      nextAnchorEdgeIds.splice(existingIndex, 1);
    } else {
      nextAnchorEdgeIds.push(edgeId);
    }
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

function buildRouteTraversalFeatures(routePlan, routeResult, routeGraph) {
  const anchorEdgeIds = routePlan?.anchorEdgeIds || [];

  if (!routeGraph?.edges || anchorEdgeIds.length === 0) {
    return [];
  }

  const anchorEntries = anchorEdgeIds.map((edgeId) => ({
    edgeId,
    edge: routeGraph.edges.get(edgeId) || null,
    entryNodeId: null,
    exitNodeId: null,
  }));

  const connectorTraversals = [];

  (routeResult?.connections || []).forEach((connection, index) => {
    const fromAnchor = anchorEntries[index];
    const toAnchor = anchorEntries[index + 1];

    if (!fromAnchor?.edge || !toAnchor?.edge || !Array.isArray(connection.connectorEdgeIds)) {
      connectorTraversals[index] = [];
      return;
    }

    const traversal = buildConnectorTraversal(
      routeGraph,
      fromAnchor.edge,
      toAnchor.edge,
      connection.connectorEdgeIds
    );

    if (!traversal) {
      connectorTraversals[index] = [];
      return;
    }

    fromAnchor.exitNodeId = traversal.fromConnectionNodeId;
    toAnchor.entryNodeId = traversal.toConnectionNodeId;
    connectorTraversals[index] = traversal.connectorSegments;
  });

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

    (connectorTraversals[index] || []).forEach((segment, connectorIndex) => {
      const connectorFeature = createOrientedLineFeature(
        segment.edge,
        segment.startNodeId,
        segment.endNodeId,
        {
          role: 'traversal-connector',
          edgeId: segment.edge.id,
          connectionIndex: index,
          connectorIndex,
        }
      );

      if (connectorFeature) {
        features.push(connectorFeature);
      }
    });

    return features;
  });
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
    directions: {
      type: 'FeatureCollection',
      features: buildRouteDirectionFeatures(routePlan, routeResult, routeGraph),
    },
    traversal: {
      type: 'FeatureCollection',
      features: buildRouteTraversalFeatures(routePlan, routeResult, routeGraph),
    },
  };
}
