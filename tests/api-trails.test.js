import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/sporet', () => ({
  SPORET_LAYER_IDS: { trails: 6 },
  fetchSporetGeoJson: vi.fn(),
  parseIntegerParam: vi.fn((value) => {
    if (Array.isArray(value)) {
      return null;
    }

    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    if (!/^\d+$/.test(String(value))) {
      return null;
    }

    return Number(value);
  }),
}));

import handler from '../pages/api/trails';
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

describe('/api/trails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unsupported methods', async () => {
    const res = createRes();
    await handler({ method: 'POST', query: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
  });

  it('rejects malformed destination ids', async () => {
    const res = createRes();
    await handler({ method: 'GET', query: { destinationid: 'abc' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/positive integer/);
  });

  it('uses a bounded fallback query when no destination is provided', async () => {
    fetchSporetGeoJson.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const res = createRes();

    await handler({ method: 'GET', query: {} }, res);

    expect(fetchSporetGeoJson).toHaveBeenCalledWith(6, {
      where: '1=1',
      outFields:
        'id,destinationid,trailtypesymbol,prepsymbol,warningtext,has_classic,has_skating,has_floodlight,is_scootertrail,st_length(shape)',
      resultRecordCount: '250',
    });
    expect(res.headers['Cache-Control']).toBe('s-maxage=900, stale-while-revalidate=1800');
  });

  it('uses a bounded proximity query when current location coordinates are provided', async () => {
    fetchSporetGeoJson.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const res = createRes();

    await handler({ method: 'GET', query: { lng: '10.75', lat: '59.91' } }, res);

    expect(fetchSporetGeoJson).toHaveBeenCalledWith(6, {
      where: '1=1',
      outFields:
        'id,destinationid,trailtypesymbol,prepsymbol,warningtext,has_classic,has_skating,has_floodlight,is_scootertrail,st_length(shape)',
      geometry: '10.75,59.91',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '0.05',
      units: 'esriSRUnit_Kilometer',
      resultRecordCount: '25',
    });
  });

  it('uses a destination-scoped query when destinationid is valid', async () => {
    fetchSporetGeoJson.mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const res = createRes();

    await handler({ method: 'GET', query: { destinationid: '12' } }, res);

    expect(fetchSporetGeoJson).toHaveBeenCalledWith(6, {
      where: 'destinationid=12',
      outFields:
        'id,destinationid,trailtypesymbol,prepsymbol,warningtext,has_classic,has_skating,has_floodlight,is_scootertrail,st_length(shape)',
    });
  });

  it('rejects partial or invalid proximity coordinates', async () => {
    const partialRes = createRes();
    await handler({ method: 'GET', query: { lng: '10.75' } }, partialRes);

    expect(partialRes.statusCode).toBe(400);
    expect(partialRes.body.error).toMatch(/provided together/);

    const invalidRes = createRes();
    await handler({ method: 'GET', query: { lng: '999', lat: '59.91' } }, invalidRes);

    expect(invalidRes.statusCode).toBe(400);
    expect(invalidRes.body.error).toMatch(/valid coordinates/);
  });

  it('returns a 500 when the upstream call fails', async () => {
    fetchSporetGeoJson.mockRejectedValue(new Error('boom'));
    const res = createRes();

    await handler({ method: 'GET', query: { destinationid: '12' } }, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'boom' });
  });
});