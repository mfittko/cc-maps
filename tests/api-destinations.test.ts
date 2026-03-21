import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/sporet', () => ({
  SPORET_LAYER_IDS: { destinations: 4 },
  fetchSporetGeoJson: vi.fn(),
}));

import handler from '../pages/api/destinations';
import { fetchSporetGeoJson } from '../lib/sporet';

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('/api/destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported methods', async () => {
    const res = createRes();
    await handler({ method: 'POST' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('proxies active destinations', async () => {
    fetchSporetGeoJson.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const res = createRes();

    await handler({ method: 'GET' }, res);

    expect(fetchSporetGeoJson).toHaveBeenCalledWith(4, {
      where: 'is_active=1',
      outFields: 'id,name,prepsymbol,is_active',
      orderByFields: 'name ASC',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['Cache-Control']).toBe('s-maxage=300, stale-while-revalidate=600');
  });

  it('returns a 500 when the upstream call fails', async () => {
    fetchSporetGeoJson.mockRejectedValue(new Error('boom'));
    const res = createRes();

    await handler({ method: 'GET' }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });
});