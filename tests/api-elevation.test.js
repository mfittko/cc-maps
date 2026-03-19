import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/terrain-rgb', () => ({
  DEFAULT_SAMPLE_SPACING_METERS: 25,
  TERRAIN_RGB_TILESET: 'mapbox.terrain-rgb',
  sampleCoordinatesFromGeometry: vi.fn((geometry) => {
    if (geometry.type === 'LineString') {
      return geometry.coordinates.slice();
    }

    return geometry.coordinates.flat();
  }),
  sampleElevationsAlongCoordinates: vi.fn(),
}));

import handler from '../pages/api/elevation';
import { sampleCoordinatesFromGeometry, sampleElevationsAlongCoordinates } from '../lib/terrain-rgb';

const VALID_LINE_GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [10.0, 60.0],
    [10.01, 60.01],
    [10.02, 60.0],
  ],
};

const VALID_SECTION_GEOMETRY = {
  type: 'LineString',
  coordinates: [
    [10.0, 60.0],
    [10.01, 60.01],
  ],
};

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

function createReq(overrides = {}) {
  return {
    method: 'POST',
    body: {
      destinationId: '42',
      routeTraversal: [VALID_LINE_GEOMETRY],
      routeSections: [],
    },
    ...overrides,
  };
}

describe('/api/elevation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, MAPBOX_ACCESS_TOKEN: 'test-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('method validation', () => {
    it('rejects non-POST methods', async () => {
      const res = createRes();
      await handler({ method: 'GET', body: {} }, res);

      expect(res.statusCode).toBe(405);
      expect(res.headers.Allow).toBe('POST');
      expect(res.body.error).toMatch(/method not allowed/i);
    });

    it('rejects PUT method', async () => {
      const res = createRes();
      await handler({ method: 'PUT', body: {} }, res);

      expect(res.statusCode).toBe(405);
    });
  });

  describe('configuration validation', () => {
    it('returns 503 when MAPBOX_ACCESS_TOKEN is not configured', async () => {
      process.env = { ...originalEnv, MAPBOX_ACCESS_TOKEN: '' };
      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/not configured/i);
    });
  });

  describe('request body validation', () => {
    it('rejects malformed JSON body', async () => {
      const res = createRes();
      await handler({ method: 'POST', body: 'not json {{{' }, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/valid JSON/i);
    });

    it('rejects missing destinationId', async () => {
      const res = createRes();
      await handler(createReq({ body: { routeTraversal: [VALID_LINE_GEOMETRY] } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/destinationId/i);
    });

    it('rejects non-numeric destinationId', async () => {
      const res = createRes();
      await handler(createReq({ body: { destinationId: 'abc', routeTraversal: [VALID_LINE_GEOMETRY] } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/destinationId/i);
    });

    it('rejects missing routeTraversal', async () => {
      const res = createRes();
      await handler(createReq({ body: { destinationId: '42' } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/routeTraversal/i);
    });

    it('rejects empty routeTraversal array', async () => {
      const res = createRes();
      await handler(createReq({ body: { destinationId: '42', routeTraversal: [] } }), res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/routeTraversal/i);
    });

    it('rejects routeTraversal with invalid geometry type', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [{ type: 'Point', coordinates: [10.0, 60.0] }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('rejects routeTraversal with a null geometry entry', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [null],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('rejects routeTraversal with out-of-range coordinates', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [{ type: 'LineString', coordinates: [[999, 60.0], [10.01, 60.01]] }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('rejects routeSections that is not an array', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [VALID_LINE_GEOMETRY],
            routeSections: 'bad',
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/routeSections/i);
    });

    it('rejects a section missing sectionKey', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [VALID_LINE_GEOMETRY],
            routeSections: [{ geometry: VALID_SECTION_GEOMETRY }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/sectionKey/i);
    });

    it('rejects a section with invalid geometry', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [VALID_LINE_GEOMETRY],
            routeSections: [{ sectionKey: 'A', geometry: { type: 'Point', coordinates: [0, 0] } }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('returns 413 when routeSections exceeds the maximum count', async () => {
      const sections = Array.from({ length: 201 }, (_, i) => ({
        sectionKey: `s${i}`,
        geometry: VALID_SECTION_GEOMETRY,
      }));
      const res = createRes();
      await handler(
        createReq({ body: { destinationId: '42', routeTraversal: [VALID_LINE_GEOMETRY], routeSections: sections } }),
        res
      );

      expect(res.statusCode).toBe(413);
      expect(res.body.error).toMatch(/maximum.*sections/i);
    });

    it('rejects geometry with no coordinates array', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [{ type: 'LineString' }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('rejects MultiLineString with a non-array inner line', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [
              {
                type: 'MultiLineString',
                coordinates: ['not-an-array'],
              },
            ],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/invalid or unsupported geometry/i);
    });

    it('rejects a null entry in routeSections', async () => {
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [VALID_LINE_GEOMETRY],
            routeSections: [null],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/routeSection must be an object/i);
    });

    it('returns 413 when total geometry coordinate count is oversized', async () => {
      const bigCoords = Array.from({ length: 50001 }, (_, i) => [10 + i * 0.0001, 60.0]);
      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [{ type: 'LineString', coordinates: bigCoords }],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(413);
      expect(res.body.error).toMatch(/maximum.*coordinates/i);
    });

    it('returns 413 when sampled geometry exceeds the post-sampling cap', async () => {
      sampleCoordinatesFromGeometry.mockReturnValue(
        Array.from({ length: 20001 }, (_, i) => [10 + i * 0.00001, 60.0])
      );

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(413);
      expect(res.body.error).toMatch(/sampled route geometry exceeds the maximum/i);
      expect(sampleElevationsAlongCoordinates).not.toHaveBeenCalled();
    });
  });

  describe('success responses', () => {
    it('returns ok status with route metrics when elevation is available', async () => {
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 115, 130]);
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01], [10.02, 60.0], [10.03, 60.01]]);

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.route.status).toBe('ok');
      expect(res.body.route.metrics).toEqual({
        ascentMeters: expect.any(Number),
        descentMeters: expect.any(Number),
      });
      expect(res.body.sections).toEqual([]);
      expect(res.body.source.id).toBe('mapbox.terrain-rgb');
      expect(res.body.sampleSpacingMeters).toBe(25);
    });

    it('returns ok status with route and section metrics when all sections have elevation', async () => {
      sampleCoordinatesFromGeometry.mockImplementation((geometry) => geometry.coordinates.slice());
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 110, 130]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [
              { type: 'LineString', coordinates: [[10.0, 60.0], [10.01, 60.01]] },
            ],
            routeSections: [
              {
                sectionKey: 'A',
                geometry: { type: 'LineString', coordinates: [[10.02, 60.0], [10.03, 60.01]] },
              },
            ],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.route.status).toBe('ok');
      expect(res.body.sections).toHaveLength(1);
      expect(res.body.sections[0].sectionKey).toBe('A');
      expect(res.body.sections[0].status).toBe('ok');
    });

    it('returns partial status when some sections lack usable elevation', async () => {
      sampleCoordinatesFromGeometry.mockImplementation((geometry) => geometry.coordinates.slice());
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 110, 115]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [
              { type: 'LineString', coordinates: [[10.0, 60.0], [10.01, 60.01]] },
            ],
            routeSections: [
              {
                sectionKey: 'ok-section',
                geometry: { type: 'LineString', coordinates: [[10.02, 60.0], [10.03, 60.01]] },
              },
              {
                sectionKey: 'short-section',
                geometry: { type: 'LineString', coordinates: [[10.04, 60.0]] },
              },
            ],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('partial');
      expect(res.body.route.status).toBe('ok');
      const okSection = res.body.sections.find((s) => s.sectionKey === 'ok-section');
      const shortSection = res.body.sections.find((s) => s.sectionKey === 'short-section');

      expect(okSection.status).toBe('ok');
      expect(shortSection.status).toBe('unavailable');
    });

    it('returns partial status when all sections have unavailable elevation', async () => {
      sampleCoordinatesFromGeometry.mockImplementation((geometry) => geometry.coordinates.slice());
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [
              { type: 'LineString', coordinates: [[10.0, 60.0], [10.01, 60.01]] },
            ],
            routeSections: [
              {
                sectionKey: 'short-only',
                geometry: { type: 'LineString', coordinates: [[10.02, 60.0]] },
              },
            ],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('partial');
      expect(res.body.route.status).toBe('ok');
      expect(res.body.sections[0].status).toBe('unavailable');
    });

    it('returns unavailable when route traversal has insufficient samples', async () => {
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0]]);
      sampleElevationsAlongCoordinates.mockResolvedValue([100]);

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('unavailable');
      expect(res.body.route.status).toBe('unavailable');
      expect(res.body.route.unavailableReason).toBeTruthy();
    });

    it('accepts MultiLineString geometry in routeTraversal', async () => {
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01], [10.02, 60.0]]);
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 110]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [
              {
                type: 'MultiLineString',
                coordinates: [
                  [[10.0, 60.0], [10.01, 60.01]],
                  [[10.01, 60.01], [10.02, 60.0]],
                ],
              },
            ],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
    });

    it('accepts an optional requestContext field without error', async () => {
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 110]);
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01], [10.02, 60.0]]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            routeTraversal: [VALID_LINE_GEOMETRY],
            requestContext: { platform: 'ios', routeVersion: 2 },
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
    });

    it('accepts an optional destinationIds field without error', async () => {
      sampleElevationsAlongCoordinates.mockResolvedValue([100, 120, 110]);
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01], [10.02, 60.0]]);

      const res = createRes();
      await handler(
        createReq({
          body: {
            destinationId: '42',
            destinationIds: ['42', '43'],
            routeTraversal: [VALID_LINE_GEOMETRY],
          },
        }),
        res
      );

      expect(res.statusCode).toBe(200);
    });
  });

  describe('upstream failure handling', () => {
    it('returns 502 when the elevation provider returns a 5xx error', async () => {
      const err = new Error('upstream error');

      err.status = 500;
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01]]);
      sampleElevationsAlongCoordinates.mockRejectedValue(err);

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(502);
      expect(res.body.error).toMatch(/temporarily unavailable/i);
    });

    it('returns 503 when the elevation provider returns a 429 rate limit error', async () => {
      const err = new Error('rate limited');

      err.status = 429;
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01]]);
      sampleElevationsAlongCoordinates.mockRejectedValue(err);

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/rate limit/i);
    });

    it('returns 502 for unexpected tile fetch errors', async () => {
      sampleCoordinatesFromGeometry.mockReturnValue([[10.0, 60.0], [10.01, 60.01]]);
      sampleElevationsAlongCoordinates.mockRejectedValue(new Error('network error'));

      const res = createRes();
      await handler(createReq(), res);

      expect(res.statusCode).toBe(502);
    });
  });
});
