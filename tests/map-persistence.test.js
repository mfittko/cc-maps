import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPersistedRoutePlanSources,
  getMapViewFromValues,
  getSingleQueryValue,
  getTrailCacheStorageKey,
  isPlanningModeQueryValue,
  isTrailColorMode,
  persistMapSettings,
  readCachedTrailGeoJson,
  readStoredMapSettings,
  writeCachedTrailGeoJson,
} from '../lib/map-persistence';
import { createRoutePlan, writeStoredRoutePlan } from '../lib/route-plan';

const storageKey = 'cc-maps:settings';

function createStorage() {
  const store = new Map();

  return {
    getItem: vi.fn((key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
  };
}

describe('map-persistence', () => {
  beforeEach(() => {
    global.window = {
      localStorage: createStorage(),
    };
    vi.restoreAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('normalizes query values and validates color modes', () => {
    expect(getSingleQueryValue(['one', 'two'])).toBe('one');
    expect(getSingleQueryValue('value')).toBe('value');
    expect(isTrailColorMode('type')).toBe(true);
    expect(isTrailColorMode('freshness')).toBe(true);
    expect(isTrailColorMode('other')).toBe(false);
    expect(isPlanningModeQueryValue('1')).toBe(true);
    expect(isPlanningModeQueryValue('true')).toBe(true);
    expect(isPlanningModeQueryValue('0')).toBe(false);
    expect(isPlanningModeQueryValue('')).toBe(false);
  });

  it('parses map view values safely', () => {
    expect(getMapViewFromValues('10.5', '59.9', '12')).toEqual({
      longitude: 10.5,
      latitude: 59.9,
      zoom: 12,
    });
    expect(getMapViewFromValues('', '59.9', '12')).toBeNull();
    expect(getMapViewFromValues('x', '59.9', '12')).toBeNull();
  });

  it('reads and persists stored settings', () => {
    expect(readStoredMapSettings(storageKey)).toBeNull();

    persistMapSettings(storageKey, { destination: '4' });
    expect(readStoredMapSettings(storageKey)).toEqual({ destination: '4' });

    window.localStorage.setItem(storageKey, '{bad json');
    expect(readStoredMapSettings(storageKey)).toBeNull();
  });

  it('reads and expires cached trail payloads', () => {
    const now = 10_000;
    const data = { type: 'FeatureCollection', features: [] };

    expect(readCachedTrailGeoJson('3', storageKey, 500, now)).toBeNull();

    writeCachedTrailGeoJson('3', data, storageKey, now);
    expect(getTrailCacheStorageKey('3', storageKey)).toBe('cc-maps:settings:trails:3');
    expect(readCachedTrailGeoJson('3', storageKey, 500, now + 100)).toEqual(data);
    expect(readCachedTrailGeoJson('3', storageKey, 500, now + 600)).toBeNull();
    expect(window.localStorage.removeItem).toHaveBeenCalled();
  });

  it('handles missing window and storage failures gracefully', () => {
    const failingStorage = {
      getItem: vi.fn(() => '{bad json'),
      setItem: vi.fn(() => {
        throw new Error('storage full');
      }),
      removeItem: vi.fn(),
    };

    global.window = { localStorage: failingStorage };

    expect(readStoredMapSettings(storageKey)).toBeNull();
    persistMapSettings(storageKey, { destination: '1' });
    expect(readCachedTrailGeoJson('8', storageKey, 100, 100)).toBeNull();
    writeCachedTrailGeoJson('8', { hello: 'world' }, storageKey, 100);
    expect(console.warn).toHaveBeenCalled();

    global.window = undefined;

    expect(readStoredMapSettings(storageKey)).toBeNull();
    expect(readCachedTrailGeoJson('8', storageKey, 100, 100)).toBeNull();
    expect(() => persistMapSettings(storageKey, { destination: '1' })).not.toThrow();
    expect(() => writeCachedTrailGeoJson('8', { hello: 'world' }, storageKey, 100)).not.toThrow();
  });

  it('prefers the canonical route from the URL even when browse focus is on another destination', () => {
    const routePlan = createRoutePlan('7', ['edge-a', 'edge-b'], ['7', '8']);

    const persistedSources = getPersistedRoutePlanSources(
      '2|7|7;8|edge-a,edge-b',
      '8',
      storageKey
    );

    expect(persistedSources.routeFromUrl).toEqual(routePlan);
    expect(persistedSources.routeFromStorage).toBeNull();
    expect(persistedSources.persistedRoutePlan).toEqual(routePlan);
  });

  it('falls back to destination-scoped storage when there is no route in the URL', () => {
    const routePlan = createRoutePlan('8', ['edge-b'], ['8']);
    writeStoredRoutePlan(routePlan, storageKey);

    const persistedSources = getPersistedRoutePlanSources('', '8', storageKey);

    expect(persistedSources.routeFromUrl).toBeNull();
    expect(persistedSources.routeFromStorage).toEqual(routePlan);
    expect(persistedSources.persistedRoutePlan).toEqual(routePlan);
  });
});