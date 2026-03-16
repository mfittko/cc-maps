export function getSingleQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function isTrailColorMode(value) {
  return value === 'type' || value === 'freshness';
}

function parseMapViewValue(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function getMapViewFromValues(longitudeValue, latitudeValue, zoomValue) {
  const longitude = parseMapViewValue(longitudeValue);
  const latitude = parseMapViewValue(latitudeValue);
  const zoom = parseMapViewValue(zoomValue);

  if (longitude === null || latitude === null || zoom === null) {
    return null;
  }

  return { longitude, latitude, zoom };
}

export function readStoredMapSettings(storageKey) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    return JSON.parse(rawValue);
  } catch (error) {
    console.warn('Failed to read stored map settings', error);
    return null;
  }
}

export function persistMapSettings(storageKey, settings) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to persist map settings', error);
  }
}

export function getTrailCacheStorageKey(destinationId, storageKey) {
  return `${storageKey}:trails:${destinationId}`;
}

export function readCachedTrailGeoJson(destinationId, storageKey, ttlMs, now = Date.now()) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cacheKey = getTrailCacheStorageKey(destinationId, storageKey);
    const rawValue = window.localStorage.getItem(cacheKey);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue?.cachedAt || !parsedValue?.data || now - parsedValue.cachedAt > ttlMs) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }

    return parsedValue.data;
  } catch (error) {
    console.warn(`Failed to read cached trails for destination ${destinationId}`, error);
    return null;
  }
}

export function writeCachedTrailGeoJson(destinationId, data, storageKey, now = Date.now()) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getTrailCacheStorageKey(destinationId, storageKey),
      JSON.stringify({
        cachedAt: now,
        data,
      })
    );
  } catch (error) {
    console.warn(`Failed to cache trails for destination ${destinationId}`, error);
  }
}