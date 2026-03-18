/**
 * Route-plan state, persistence, and URL hydration helpers.
 *
 * Authoritative persisted and shared route plans store only:
 *   - version
 *   - destinationId
 *   - destinationIds
 *   - ordered anchorEdgeIds
 *
 * Resolved connectors and derived route summary data are never persisted.
 * Callers must recompute them from the graph after hydration.
 *
 * RoutePlan shape
 * ---------------
 * @typedef {{
 *   version: number,
 *   destinationId: string,
 *   destinationIds: string[],
 *   anchorEdgeIds: string[],
 * }} RoutePlan
 *
 * HydrationResult shape
 * ---------------------
 * @typedef {{
 *   status: 'ok' | 'partial' | 'empty',
 *   validAnchorEdgeIds: string[],
 *   staleAnchorEdgeIds: string[],
 * }} HydrationResult
 *
 * status meanings:
 *   'ok'      - all anchor IDs found in graph; connectors can be fully resolved
 *   'partial' - some anchors found, some stale; UI should present a partial-plan warning
 *   'empty'   - no anchors found in graph (all stale or input was empty)
 *
 * URL encoding
 * ------------
 * Version 2 encodes as:
 *   "${version}|${destinationId}|${destinationIds.join(';')}|${anchorEdgeIds.join(',')}"
 *
 * Version 1 legacy payloads used:
 *   "${version}|${destinationId}|${anchorEdgeIds.join(',')}"
 *
 * The '|' separator and ',' anchor delimiter are safe because edge IDs only
 * contain '.', ':', '-', and '~' characters.
 */

/** Current plan version. Increment when the persisted shape changes. */
export const ROUTE_PLAN_VERSION = 2;

const LEGACY_ROUTE_PLAN_VERSION = 1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return true if payload is a structurally valid RoutePlan for the current
 * version.  Does not validate anchor IDs against a graph.
 *
 * @param {unknown} payload
 * @returns {boolean}
 */
function isValidRoutePlanPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.version === 'number' &&
    payload.version === ROUTE_PLAN_VERSION &&
    typeof payload.destinationId === 'string' &&
    /^\d+$/.test(payload.destinationId) &&
    Array.isArray(payload.destinationIds) &&
    payload.destinationIds.length > 0 &&
    payload.destinationIds.every((id) => typeof id === 'string' && /^\d+$/.test(id)) &&
    Array.isArray(payload.anchorEdgeIds) &&
    payload.anchorEdgeIds.every((id) => typeof id === 'string' && id.length > 0)
  );
}

function isLegacyRoutePlanPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.version === 'number' &&
    payload.version === LEGACY_ROUTE_PLAN_VERSION &&
    typeof payload.destinationId === 'string' &&
    /^\d+$/.test(payload.destinationId) &&
    Array.isArray(payload.anchorEdgeIds) &&
    payload.anchorEdgeIds.every((id) => typeof id === 'string' && id.length > 0)
  );
}

function normalizeDestinationIds(destinationId, destinationIds = []) {
  const primaryDestinationId = String(destinationId);
  const normalizedDestinationIds = [primaryDestinationId];

  destinationIds.forEach((candidateId) => {
    const nextId = String(candidateId);

    if (!/^\d+$/.test(nextId) || normalizedDestinationIds.includes(nextId)) {
      return;
    }

    normalizedDestinationIds.push(nextId);
  });

  return normalizedDestinationIds;
}

function migrateRoutePlanPayload(payload) {
  if (isValidRoutePlanPayload(payload)) {
    return createRoutePlan(payload.destinationId, payload.anchorEdgeIds, payload.destinationIds);
  }

  if (isLegacyRoutePlanPayload(payload)) {
    return createRoutePlan(payload.destinationId, payload.anchorEdgeIds, [payload.destinationId]);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Plan factory
// ---------------------------------------------------------------------------

/**
 * Create a new RoutePlan for a given destination and ordered anchor edge IDs.
 *
 * @param {string | number} destinationId
 * @param {string[]} anchorEdgeIds
 * @param {Array<string | number>} [destinationIds]
 * @returns {RoutePlan}
 */
export function createRoutePlan(destinationId, anchorEdgeIds, destinationIds = [destinationId]) {
  return {
    version: ROUTE_PLAN_VERSION,
    destinationId: String(destinationId),
    destinationIds: normalizeDestinationIds(destinationId, destinationIds),
    anchorEdgeIds: Array.isArray(anchorEdgeIds) ? [...anchorEdgeIds] : [],
  };
}

// ---------------------------------------------------------------------------
// Local-storage helpers
// ---------------------------------------------------------------------------

/**
 * Return the localStorage key used to store a route plan for a destination.
 *
 * @param {string | number} destinationId
 * @param {string} storageKey  App-level storage namespace (e.g. 'cc-maps:settings').
 * @returns {string}
 */
export function getRoutePlanStorageKey(destinationId, storageKey) {
  return `${storageKey}:plan:${destinationId}`;
}

/**
 * Read the stored route plan for a destination from localStorage.
 * Returns null when unavailable, unreadable, or structurally invalid.
 *
 * @param {string | number} destinationId
 * @param {string} storageKey
 * @returns {RoutePlan | null}
 */
export function readStoredRoutePlan(destinationId, storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const key = getRoutePlanStorageKey(destinationId, storageKey);
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    const migratedRoutePlan = migrateRoutePlanPayload(parsed);

    if (!migratedRoutePlan) {
      return null;
    }

    return migratedRoutePlan;
  } catch (error) {
    console.warn(`Failed to read stored route plan for destination ${destinationId}`, error);
    return null;
  }
}

/**
 * Persist a route plan to localStorage.
 *
 * @param {RoutePlan} routePlan
 * @param {string} storageKey
 * @returns {void}
 */
export function writeStoredRoutePlan(routePlan, storageKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getRoutePlanStorageKey(routePlan.destinationId, storageKey);
    window.localStorage.setItem(key, JSON.stringify(routePlan));
  } catch (error) {
    console.warn(`Failed to write stored route plan for destination ${routePlan.destinationId}`, error);
  }
}

/**
 * Remove the stored route plan for a destination from localStorage.
 *
 * @param {string | number} destinationId
 * @param {string} storageKey
 * @returns {void}
 */
export function clearStoredRoutePlan(destinationId, storageKey) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const key = getRoutePlanStorageKey(destinationId, storageKey);
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to clear stored route plan for destination ${destinationId}`, error);
  }
}

// ---------------------------------------------------------------------------
// URL encode / decode helpers
// ---------------------------------------------------------------------------

/**
 * Encode a RoutePlan into a compact URL-safe string.
 *
 * Format: "${version}|${destinationId}|${destinationIds.join(';')}|${anchorEdgeIds.join(',')}"
 *
 * Returns null for invalid or missing input.
 *
 * @param {RoutePlan | null | undefined} routePlan
 * @returns {string | null}
 */
export function encodeRoutePlanToUrl(routePlan) {
  if (!isValidRoutePlanPayload(routePlan)) {
    return null;
  }

  const destinationIdsStr = routePlan.destinationIds.join(';');
  const anchorStr = routePlan.anchorEdgeIds.join(',');
  return `${routePlan.version}|${routePlan.destinationId}|${destinationIdsStr}|${anchorStr}`;
}

/**
 * Return true when a hydrated route plan should automatically re-enter planning mode.
 * Manual dismissals are tracked by the caller via the encoded route-plan key.
 *
 * @param {RoutePlan | null | undefined} routePlan
 * @param {string} [dismissedRoutePlanKey]
 * @returns {boolean}
 */
export function shouldRestoreHydratedRoutePlan(routePlan, dismissedRoutePlanKey = '') {
  if (!Array.isArray(routePlan?.anchorEdgeIds) || routePlan.anchorEdgeIds.length === 0) {
    return false;
  }

  const routePlanKey = encodeRoutePlanToUrl(routePlan) || '';
  return routePlanKey !== '' && routePlanKey !== dismissedRoutePlanKey;
}

/**
 * Decode a compact URL string back into a RoutePlan.
 *
 * Returns null for malformed, unsupported-version, or invalid payloads.
 *
 * @param {string | null | undefined} encoded
 * @returns {RoutePlan | null}
 */
export function decodeRoutePlanFromUrl(encoded) {
  if (typeof encoded !== 'string' || encoded.trim() === '') {
    return null;
  }

  const firstPipe = encoded.indexOf('|');
  const secondPipe = encoded.indexOf('|', firstPipe + 1);

  if (firstPipe === -1 || secondPipe === -1) {
    return null;
  }

  const versionStr = encoded.slice(0, firstPipe);
  const destinationId = encoded.slice(firstPipe + 1, secondPipe);

  const version = Number(versionStr);
  if (!Number.isInteger(version) || version < 1) {
    return null;
  }

  if (!destinationId || !/^\d+$/.test(destinationId)) {
    return null;
  }

  if (version === LEGACY_ROUTE_PLAN_VERSION) {
    const anchorsStr = encoded.slice(secondPipe + 1);
    const anchorEdgeIds = anchorsStr ? anchorsStr.split(',') : [];

    if (!anchorEdgeIds.every((id) => typeof id === 'string' && id.length > 0)) {
      return null;
    }

    return createRoutePlan(destinationId, anchorEdgeIds, [destinationId]);
  }

  if (version !== ROUTE_PLAN_VERSION) {
    return null;
  }

  const thirdPipe = encoded.indexOf('|', secondPipe + 1);

  if (thirdPipe === -1) {
    return null;
  }

  const destinationIdsStr = encoded.slice(secondPipe + 1, thirdPipe);
  const anchorsStr = encoded.slice(thirdPipe + 1);
  const destinationIds = destinationIdsStr ? destinationIdsStr.split(';') : [];
  const anchorEdgeIds = anchorsStr ? anchorsStr.split(',') : [];

  if (!destinationIds.every((id) => typeof id === 'string' && /^\d+$/.test(id))) {
    return null;
  }

  if (!anchorEdgeIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return null;
  }

  return createRoutePlan(destinationId, anchorEdgeIds, destinationIds);
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Validate a RoutePlan's anchor edge IDs against a rebuilt destination graph.
 *
 * Traversal and direction features are derived from the validated anchor list;
 * only stable anchor edge IDs are restored from persisted state.
 *
 * @param {RoutePlan | null | undefined} routePlan
 * @param {{ edges: Map<string, object> } | null | undefined} graph
 * @returns {HydrationResult}
 */
export function hydrateRoutePlan(routePlan, graph) {
  if (!isValidRoutePlanPayload(routePlan)) {
    return { status: 'empty', validAnchorEdgeIds: [], staleAnchorEdgeIds: [] };
  }

  const validAnchorEdgeIds = [];
  const staleAnchorEdgeIds = [];

  for (const anchorId of routePlan.anchorEdgeIds) {
    if (graph?.edges?.has(anchorId)) {
      validAnchorEdgeIds.push(anchorId);
    } else {
      staleAnchorEdgeIds.push(anchorId);
    }
  }

  const status =
    validAnchorEdgeIds.length === 0
      ? 'empty'
      : staleAnchorEdgeIds.length === 0
        ? 'ok'
        : 'partial';

  return { status, validAnchorEdgeIds, staleAnchorEdgeIds };
}
