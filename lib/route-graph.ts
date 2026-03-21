/**
 * Destination-local route graph builder.
 *
 * Constructs a graph of nodes (trail crossings and dead-end endpoints) and
 * edges (navigable trail sections between those nodes) from a
 * destination-scoped trail FeatureCollection.
 *
 * Edge-ID contract
 * ----------------
 * Node IDs are canonical coordinate strings:
 *   "<lng rounded to 6 dp>:<lat rounded to 6 dp>"
 *   Example: "10.752300:59.910000"
 *
 * Edge IDs are derived from the sorted node ID pair for the edge endpoints:
 *   "<nodeIdA>~<nodeIdB>"   (where nodeIdA <= nodeIdB lexicographically)
 *   Example: "10.750000:59.910000~10.760000:59.910000"
 *
 * When multiple edges share the same endpoint node pair (e.g. parallel or
 * looping sections), a 1-based numeric suffix disambiguates them:
 *   "<nodeIdA>~<nodeIdB>:2"  (second edge sharing that node pair)
 *
 * The first occurrence of a node pair carries no suffix. Subsequent
 * occurrences are numbered starting from :2. Tie-breaking order is
 * ascending feature index within the input FeatureCollection, then
 * ascending section index along that feature.
 *
 * These rules ensure that the same destination trail input always produces
 * the same node and edge IDs, making them safe for persistence and URL
 * references.
 */

import { getDistanceInKilometers, getLineStrings, getSegmentIntersection } from './map-domain';

/** Node ID precision: 6 decimal places ≈ 0.1 m at typical latitudes. */
const COORD_PRECISION = 6;

/**
 * Proximity threshold in km below which two node-candidate points are
 * considered the same graph node. Matches the deduplication tolerance used
 * in getCrossingMetrics for consistency with existing segmentation logic.
 */
const NODE_MERGE_THRESHOLD_KM = 0.02;

/**
 * Distance-along-trail tolerance in km used when deduplicating crossings.
 * This mirrors the existing map-domain crossing dedupe rule so nearby
 * switchbacks or overpasses are not collapsed solely on coordinate proximity.
 */
const CROSSING_DISTANCE_THRESHOLD_KM = 0.02;

/**
 * Distance tolerance in km used as an epsilon for floating-point comparisons
 * in coordinate extraction and sub-line range checks (≈ 1 mm).
 */
const COORD_EPSILON_KM = 1e-6;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function roundCoordComponent(value) {
  const factor = 10 ** COORD_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * Build a canonical node ID from a [lng, lat] coordinate pair.
 *
 * @param {number[]} coordinates - [lng, lat]
 * @returns {string}
 */
function makeNodeId([lng, lat]) {
  return (
    roundCoordComponent(lng).toFixed(COORD_PRECISION) +
    ':' +
    roundCoordComponent(lat).toFixed(COORD_PRECISION)
  );
}

/**
 * Build a deterministic edge ID from two node IDs.
 *
 * The pair is sorted lexicographically so edge direction does not affect
 * the identifier. An occurrence count (1-based) disambiguates multiple
 * edges sharing the same node pair; the first occurrence carries no suffix.
 *
 * @param {string} nodeIdA
 * @param {string} nodeIdB
 * @param {number} [occurrence=1]
 * @returns {string}
 */
function makeEdgeId(nodeIdA, nodeIdB, occurrence = 1) {
  const [first, second] = [nodeIdA, nodeIdB].sort();
  const base = first + '~' + second;
  return occurrence > 1 ? base + ':' + occurrence : base;
}

/**
 * Interpolate between two coordinates by factor t ∈ [0, 1].
 *
 * @param {number[]} a - [lng, lat]
 * @param {number[]} b - [lng, lat]
 * @param {number} t
 * @returns {number[]}
 */
function interpolateCoord(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Compute the total geodesic length of a coordinate array in kilometres.
 *
 * @param {number[][]} coordinates
 * @returns {number}
 */
function coordinateLengthKm(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    total += getDistanceInKilometers(coordinates[i - 1], coordinates[i]);
  }
  return total;
}

function createEmptyBounds() {
  return {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };
}

function expandBounds(bounds, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return bounds;
  }

  bounds.minLng = Math.min(bounds.minLng, coordinates[0]);
  bounds.minLat = Math.min(bounds.minLat, coordinates[1]);
  bounds.maxLng = Math.max(bounds.maxLng, coordinates[0]);
  bounds.maxLat = Math.max(bounds.maxLat, coordinates[1]);

  return bounds;
}

function getLineBounds(coordinates) {
  return coordinates.reduce((bounds, coordinatesPair) => expandBounds(bounds, coordinatesPair), createEmptyBounds());
}

function boundsOverlap(firstBounds, secondBounds) {
  if (!Number.isFinite(firstBounds?.minLng) || !Number.isFinite(secondBounds?.minLng)) {
    return false;
  }

  return !(
    firstBounds.maxLng < secondBounds.minLng ||
    secondBounds.maxLng < firstBounds.minLng ||
    firstBounds.maxLat < secondBounds.minLat ||
    secondBounds.maxLat < firstBounds.minLat
  );
}

function getFeatureBounds(lineStrings) {
  return lineStrings.reduce((bounds, coordinates) => {
    const nextBounds = getLineBounds(coordinates);

    if (!Number.isFinite(nextBounds.minLng)) {
      return bounds;
    }

    bounds.minLng = Math.min(bounds.minLng, nextBounds.minLng);
    bounds.minLat = Math.min(bounds.minLat, nextBounds.minLat);
    bounds.maxLng = Math.max(bounds.maxLng, nextBounds.maxLng);
    bounds.maxLat = Math.max(bounds.maxLat, nextBounds.maxLat);

    return bounds;
  }, createEmptyBounds());
}

/**
 * Extract the coordinate sub-path of a feature between startKm and endKm
 * (inclusive). Handles MultiLineString by measuring distance cumulatively
 * across all sub-lines.
 *
 * @param {object} feature - GeoJSON Feature
 * @param {number} startKm - start distance from feature start
 * @param {number} endKm - end distance from feature start
 * @returns {number[][]} array of [lng, lat]
 */
function extractCoordinatesSlice(feature, startKm, endKm) {
  const result = [];
  let traversedKm = 0;

  getLineStrings(feature?.geometry).forEach((coords) => {
    for (let i = 1; i < coords.length; i += 1) {
      const segStart = coords[i - 1];
      const segEnd = coords[i];
      const segLen = getDistanceInKilometers(segStart, segEnd);
      const segStartKm = traversedKm;
      const segEndKm = segStartKm + segLen;
      const overlapStart = Math.max(startKm, segStartKm);
      const overlapEnd = Math.min(endKm, segEndKm);

      if (overlapStart <= overlapEnd + COORD_EPSILON_KM) {
        const t0 = segLen > 0 ? (overlapStart - segStartKm) / segLen : 0;
        const t1 = segLen > 0 ? (overlapEnd - segStartKm) / segLen : 0;
        const c0 = interpolateCoord(segStart, segEnd, t0);
        const c1 = interpolateCoord(segStart, segEnd, t1);

        if (result.length === 0) {
          result.push(c0);
        } else {
          const last = result[result.length - 1];
          if (getDistanceInKilometers(last, c0) > COORD_EPSILON_KM) {
            result.push(c0);
          }
        }
        if (getDistanceInKilometers(c0, c1) > COORD_EPSILON_KM) {
          result.push(c1);
        }
      }

      traversedKm += segLen;
    }
  });

  return result;
}

/**
 * Sort and deduplicate a set of crossing points along a trail by proximity.
 * Two entries are merged only when they are close in both coordinate space
 * and distance from the trail start. This mirrors map-domain crossing dedupe
 * so topologically distinct nearby crossings are not collapsed.
 *
 * @param {Array<{ distanceFromStartKm: number, coordinates: number[] }>} crossings
 * @returns {Array<{ distanceFromStartKm: number, coordinates: number[] }>}
 */
function mergeCrossings(crossings) {
  const sorted = [...crossings].sort(
    (a, b) => a.distanceFromStartKm - b.distanceFromStartKm
  );
  return sorted.reduce((acc, crossing) => {
    const prev = acc[acc.length - 1];
    if (
      prev &&
      Math.abs(prev.distanceFromStartKm - crossing.distanceFromStartKm) <
        CROSSING_DISTANCE_THRESHOLD_KM &&
      getDistanceInKilometers(prev.coordinates, crossing.coordinates) < NODE_MERGE_THRESHOLD_KM
    ) {
      return acc;
    }
    acc.push(crossing);
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a destination-local route graph from a loaded trail FeatureCollection.
 *
 * @param {object|null|undefined} trailsGeoJson - GeoJSON FeatureCollection of
 *   trail features (LineString or MultiLineString geometry).
 * @returns {{ nodes: Map<string, GraphNode>, edges: Map<string, GraphEdge> }}
 *
 * @typedef {{ id: string, coordinates: number[], kind: 'crossing' | 'endpoint' }} GraphNode
 * @typedef {{
 *   id: string,
 *   from: string,
 *   to: string,
 *   destinationId: string | null,
 *   coordinates: number[][],
 *   distanceKm: number,
 *   trailFeatureId: string | number | null,
 *   trailType: number | null,
 *   freshness: number | null,
 * }} GraphEdge
 */
export function buildRouteGraph(trailsGeoJson) {
  const features = trailsGeoJson?.features;

  if (!Array.isArray(features) || features.length === 0) {
    return { nodes: new Map(), edges: new Map() };
  }

  // Step 1: Gather line strings per feature index for repeated access.
  const featureLines = features.map((f) => getLineStrings(f?.geometry));
  const featureBounds = featureLines.map((lineStrings) => getFeatureBounds(lineStrings));

  // Step 2: Find all crossing points between every ordered pair (i, j).
  //         crossingsByTrail[k] collects { distanceFromStartKm, coordinates }
  //         entries for crossings that occur along feature k.
  const crossingsByTrail = features.map(() => []);

  for (let i = 0; i < features.length; i += 1) {
    for (let j = i + 1; j < features.length; j += 1) {
      if (!boundsOverlap(featureBounds[i], featureBounds[j])) {
        continue;
      }

      let iKm = 0;

      featureLines[i].forEach((iCoords) => {
        const iBounds = getLineBounds(iCoords);

        for (let si = 1; si < iCoords.length; si += 1) {
          const iStart = iCoords[si - 1];
          const iEnd = iCoords[si];
          const iSegLen = getDistanceInKilometers(iStart, iEnd);
          const iSegmentBounds = getLineBounds([iStart, iEnd]);
          let jKm = 0;

          featureLines[j].forEach((jCoords) => {
            const jBounds = getLineBounds(jCoords);

            if (!boundsOverlap(iBounds, jBounds)) {
              jKm += coordinateLengthKm(jCoords);
              return;
            }

            for (let sj = 1; sj < jCoords.length; sj += 1) {
              const jStart = jCoords[sj - 1];
              const jEnd = jCoords[sj];
              const jSegLen = getDistanceInKilometers(jStart, jEnd);

              if (!boundsOverlap(iSegmentBounds, getLineBounds([jStart, jEnd]))) {
                jKm += jSegLen;
                continue;
              }

              const hit = getSegmentIntersection(iStart, iEnd, jStart, jEnd);
              if (hit) {
                // getSegmentIntersection returns both segment factors, so
                // distances along both trails are computed without re-deriving
                // the second factor from the intersection coordinates.
                const iCrossKm = iKm + iSegLen * hit.firstFactor;
                const jCrossKm = jKm + jSegLen * hit.secondFactor;

                crossingsByTrail[i].push({
                  distanceFromStartKm: iCrossKm,
                  coordinates: hit.coordinates,
                });
                crossingsByTrail[j].push({
                  distanceFromStartKm: jCrossKm,
                  coordinates: hit.coordinates,
                });
              }

              jKm += jSegLen;
            }
          });

          iKm += iSegLen;
        }
      });
    }
  }

  // Step 3: Register graph nodes.
  //         Crossings are registered first so that an endpoint coinciding
  //         with a crossing retains the 'crossing' kind.
  const nodes = new Map();

  for (const crossings of crossingsByTrail) {
    for (const { coordinates } of crossings) {
      const id = makeNodeId(coordinates);
      if (!nodes.has(id)) {
        nodes.set(id, { id, coordinates, kind: 'crossing' });
      }
    }
  }

  // Register trail endpoints (start and end of every sub-line).
  for (const feature of features) {
    getLineStrings(feature?.geometry).forEach((coords) => {
      if (coords.length === 0) return;
      for (const endpointCoord of [coords[0], coords[coords.length - 1]]) {
        const id = makeNodeId(endpointCoord);
        if (!nodes.has(id)) {
          nodes.set(id, { id, coordinates: endpointCoord, kind: 'endpoint' });
        }
      }
    });
  }

  // Step 4: Build edges.
  //         For each feature, interleave merged crossings with sub-line
  //         endpoints to form an ordered node list, then emit one edge per
  //         consecutive node pair.
  const edges = new Map();
  const pairOccurrences = new Map();

  for (let fi = 0; fi < features.length; fi += 1) {
    const feature = features[fi];
    const mergedCrossings = mergeCrossings(crossingsByTrail[fi]);
    let cumulativeKm = 0;
    let crossingIndex = 0;

    // Each sub-line is processed independently so that disconnected
    // MultiLineString segments do not generate phantom edges across gaps.
    getLineStrings(feature?.geometry).forEach((coords) => {
      if (coords.length === 0) return;

      const subLineLen = coordinateLengthKm(coords);
      const subLineEnd = cumulativeKm + subLineLen;

      // Collect node points for this sub-line only.
      const subLinePoints = [];

      // Sub-line start endpoint.
      subLinePoints.push({ distanceKm: cumulativeKm, coordinates: coords[0] });

      // Crossings that fall within this sub-line's distance range.
      while (
        crossingIndex < mergedCrossings.length &&
        mergedCrossings[crossingIndex].distanceFromStartKm <= subLineEnd + COORD_EPSILON_KM
      ) {
        const c = mergedCrossings[crossingIndex];
        subLinePoints.push({ distanceKm: c.distanceFromStartKm, coordinates: c.coordinates });
        crossingIndex += 1;
      }

      // Sub-line end endpoint.
      subLinePoints.push({
        distanceKm: cumulativeKm + subLineLen,
        coordinates: coords[coords.length - 1],
      });

      // Remove consecutive node points that map to the same node ID.
      const deduped = subLinePoints.reduce((acc, pt) => {
        const id = makeNodeId(pt.coordinates);
        const prev = acc[acc.length - 1];
        if (!prev || makeNodeId(prev.coordinates) !== id) {
          acc.push(pt);
        }
        return acc;
      }, []);

      // Emit one edge per consecutive node pair within this sub-line.
      for (let k = 0; k + 1 < deduped.length; k += 1) {
        const from = deduped[k];
        const to = deduped[k + 1];
        const fromNodeId = makeNodeId(from.coordinates);
        const toNodeId = makeNodeId(to.coordinates);

        const pairKey = [fromNodeId, toNodeId].sort().join('~');
        const occurrence = (pairOccurrences.get(pairKey) ?? 0) + 1;
        pairOccurrences.set(pairKey, occurrence);

        const edgeId = makeEdgeId(fromNodeId, toNodeId, occurrence);
        const edgeCoords = extractCoordinatesSlice(feature, from.distanceKm, to.distanceKm);
        const distanceKm = coordinateLengthKm(edgeCoords);

        edges.set(edgeId, {
          id: edgeId,
          from: fromNodeId,
          to: toNodeId,
          destinationId:
            feature?.properties?.destinationid == null || feature.properties.destinationid === ''
              ? null
              : String(feature.properties.destinationid),
          coordinates: edgeCoords,
          distanceKm,
          trailFeatureId: feature?.properties?.id ?? null,
          trailType: feature?.properties?.trailtypesymbol ?? null,
          freshness: feature?.properties?.prepsymbol ?? null,
        });
      }

      cumulativeKm += subLineLen;
    });
  }

  return { nodes, edges };
}
