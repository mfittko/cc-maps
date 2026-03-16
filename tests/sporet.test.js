import { describe, expect, it, vi } from 'vitest';
import {
  fetchSporetGeoJson,
  parseIntegerParam,
  SPORET_API_BASE_URL,
} from '../lib/sporet';

describe('sporet helpers', () => {
  it('parses integer params defensively', () => {
    expect(parseIntegerParam(undefined)).toBeUndefined();
    expect(parseIntegerParam('12')).toBe(12);
    expect(parseIntegerParam('001')).toBe(1);
    expect(parseIntegerParam('abc')).toBeNull();
    expect(parseIntegerParam(['12'])).toBeNull();
  });

  it('shapes sporet geojson requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const response = await fetchSporetGeoJson(6, { where: '1=1', outFields: 'id' });

    expect(response.features).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      `${SPORET_API_BASE_URL}/6/query?returnGeometry=true&f=geojson&where=1%3D1&outFields=id`
    );
  });

  it('throws when sporet responds with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    );

    await expect(fetchSporetGeoJson(4, { where: '1=1' })).rejects.toThrow(
      'Sporet API request failed: 503'
    );
  });
});