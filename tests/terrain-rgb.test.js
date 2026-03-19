import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pngjs', () => ({
  PNG: {
    sync: {
      read: vi.fn(),
    },
  },
}));

vi.mock('../lib/map-domain.js', () => ({
  getSampledCoordinatesAlongFeature: vi.fn((feature, spacing) => {
    const coords = feature?.geometry?.coordinates;

    if (!Array.isArray(coords) || !coords.length) {
      return [];
    }

    return coords.slice();
  }),
}));

import { PNG } from 'pngjs';
import { getSampledCoordinatesAlongFeature } from '../lib/map-domain.js';
import {
  MAX_TILE_FETCH_CONCURRENCY,
  TILE_SIZE,
  TILE_ZOOM,
  WEB_MERCATOR_MAX_LAT,
  decodeTerrainRGBHeight,
  decodePngBuffer,
  fetchTilePixels,
  getPixelElevation,
  getTileUrl,
  lngLatToPixelWithinTile,
  lngLatToTileCoords,
  sampleCoordinatesFromGeometry,
  sampleElevationsAlongCoordinates,
} from '../lib/terrain-rgb.js';

describe('terrain-rgb helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('lngLatToTileCoords', () => {
    it('converts a known coordinate to the correct tile at zoom 12', () => {
      const { x, y, z } = lngLatToTileCoords(10.75, 59.91, 12);

      expect(z).toBe(12);
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(0);
      expect(x).toBeLessThan(Math.pow(2, 12));
      expect(y).toBeLessThan(Math.pow(2, 12));
    });

    it('clamps tile coords to valid bounds', () => {
      const { x: xMin, y: yMax } = lngLatToTileCoords(-180, -85, 4);
      const { x: xMax, y: yMin } = lngLatToTileCoords(179.99, 85, 4);
      const n = Math.pow(2, 4);

      expect(xMin).toBe(0);
      expect(xMax).toBe(n - 1);
      expect(yMin).toBeGreaterThanOrEqual(0);
      expect(yMax).toBeLessThanOrEqual(n - 1);
    });

    it('clamps extreme latitudes to the Web Mercator limit', () => {
      const northPoleTile = lngLatToTileCoords(10.75, 90, 12);
      const clampedNorthTile = lngLatToTileCoords(10.75, WEB_MERCATOR_MAX_LAT, 12);
      const southPoleTile = lngLatToTileCoords(10.75, -90, 12);
      const clampedSouthTile = lngLatToTileCoords(10.75, -WEB_MERCATOR_MAX_LAT, 12);

      expect(northPoleTile).toEqual(clampedNorthTile);
      expect(southPoleTile).toEqual(clampedSouthTile);
    });
  });

  describe('lngLatToPixelWithinTile', () => {
    it('returns pixel coordinates within tile bounds', () => {
      const { x, y, z } = lngLatToTileCoords(10.75, 59.91, 12);
      const { px, py } = lngLatToPixelWithinTile(10.75, 59.91, x, y, z);

      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThan(TILE_SIZE);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThan(TILE_SIZE);
    });

    it('keeps pixel coordinates finite for extreme latitudes', () => {
      const { x, y, z } = lngLatToTileCoords(10.75, 90, 12);
      const pixel = lngLatToPixelWithinTile(10.75, 90, x, y, z);

      expect(Number.isFinite(pixel.px)).toBe(true);
      expect(Number.isFinite(pixel.py)).toBe(true);
      expect(pixel.px).toBeGreaterThanOrEqual(0);
      expect(pixel.py).toBeGreaterThanOrEqual(0);
    });
  });

  describe('decodeTerrainRGBHeight', () => {
    it('decodes black pixel (0,0,0) to -10000m', () => {
      expect(decodeTerrainRGBHeight(0, 0, 0)).toBeCloseTo(-10000);
    });

    it('decodes sea-level RGB value correctly', () => {
      const height = decodeTerrainRGBHeight(1, 134, 160);

      expect(typeof height).toBe('number');
      expect(Number.isFinite(height)).toBe(true);
    });

    it('applies the standard Mapbox Terrain-RGB formula', () => {
      const r = 1;
      const g = 134;
      const b = 160;
      const expected = -10000 + (r * 65536 + g * 256 + b) * 0.1;

      expect(decodeTerrainRGBHeight(r, g, b)).toBeCloseTo(expected, 5);
    });
  });

  describe('getTileUrl', () => {
    it('builds a valid Terrain-RGB tile URL', () => {
      const url = getTileUrl(2198, 1157, 12, 'my-token');

      expect(url).toContain('mapbox.terrain-rgb');
      expect(url).toContain('/12/2198/1157.pngraw');
      expect(url).toContain('access_token=my-token');
      expect(url).toContain('api.mapbox.com');
    });
  });

  describe('decodePngBuffer', () => {
    it('calls PNG.sync.read with the buffer', () => {
      const fakeBuffer = Buffer.from([]);
      const fakePng = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4) };

      PNG.sync.read.mockReturnValue(fakePng);

      const result = decodePngBuffer(fakeBuffer);

      expect(PNG.sync.read).toHaveBeenCalledWith(fakeBuffer);
      expect(result).toBe(fakePng);
    });
  });

  describe('getPixelElevation', () => {
    it('reads the correct RGBA pixel index and decodes elevation', () => {
      const width = 256;
      const data = new Uint8Array(width * 256 * 4).fill(0);

      data[0] = 1;
      data[1] = 134;
      data[2] = 160;
      data[3] = 255;

      const fakePng = { width, data };
      const elevation = getPixelElevation(fakePng, 0, 0);

      expect(elevation).toBeCloseTo(decodeTerrainRGBHeight(1, 134, 160), 5);
    });

    it('reads pixel at a non-zero position', () => {
      const width = 256;
      const data = new Uint8Array(width * 256 * 4).fill(0);
      const px = 5;
      const py = 3;
      const idx = (py * width + px) * 4;

      data[idx] = 2;
      data[idx + 1] = 50;
      data[idx + 2] = 100;
      data[idx + 3] = 255;

      const fakePng = { width, data };
      const elevation = getPixelElevation(fakePng, px, py);

      expect(elevation).toBeCloseTo(decodeTerrainRGBHeight(2, 50, 100), 5);
    });
  });

  describe('fetchTilePixels', () => {
    it('fetches the tile URL and decodes the PNG', async () => {
      const fakePng = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4).fill(0) };
      const fakeBuffer = Buffer.from([0x89, 0x50]);

      PNG.sync.read.mockReturnValue(fakePng);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(fakeBuffer.buffer),
      });

      const result = await fetchTilePixels(2198, 1157, 12, 'my-token', mockFetch);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/12/2198/1157.pngraw')
      );
      expect(result).toBe(fakePng);
    });

    it('throws with status when the tile request fails', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });

      await expect(fetchTilePixels(0, 0, 12, 'bad-token', mockFetch)).rejects.toThrow(
        /Terrain-RGB tile request failed: 401/
      );
    });
  });

  describe('sampleElevationsAlongCoordinates', () => {
    it('returns an empty array for an empty coordinate list', async () => {
      const result = await sampleElevationsAlongCoordinates([], 'token');

      expect(result).toEqual([]);
    });

    it('deduplicates tile fetches for coordinates sharing the same tile', async () => {
      const fakePng = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4).fill(10) };

      PNG.sync.read.mockReturnValue(fakePng);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from([]).buffer),
      });

      const coords = [
        [10.75, 59.91],
        [10.76, 59.92],
        [10.77, 59.93],
      ];

      await sampleElevationsAlongCoordinates(coords, 'my-token', TILE_ZOOM, mockFetch);

      expect(mockFetch.mock.calls.length).toBeLessThan(coords.length);
    });

    it('returns one elevation per input coordinate', async () => {
      const fakePng = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4).fill(0) };

      PNG.sync.read.mockReturnValue(fakePng);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(Buffer.from([]).buffer),
      });

      const coords = [
        [10.75, 59.91],
        [10.76, 59.92],
      ];

      const result = await sampleElevationsAlongCoordinates(coords, 'my-token', TILE_ZOOM, mockFetch);

      expect(result).toHaveLength(2);
      result.forEach((e) => expect(Number.isFinite(e)).toBe(true));
    });

    it('limits concurrent tile fetches', async () => {
      const fakePng = { width: 256, height: 256, data: new Uint8Array(256 * 256 * 4).fill(0) };
      let inFlight = 0;
      let maxInFlight = 0;

      PNG.sync.read.mockReturnValue(fakePng);

      const mockFetch = vi.fn().mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);

        await new Promise((resolve) => setTimeout(resolve, 0));

        inFlight -= 1;

        return {
          ok: true,
          arrayBuffer: () => Promise.resolve(Buffer.from([]).buffer),
        };
      });

      const coords = Array.from({ length: MAX_TILE_FETCH_CONCURRENCY + 4 }, (_, index) => [
        -170 + index * 20,
        0,
      ]);
      const uniqueTileCount = new Set(
        coords.map(([lng, lat]) => {
          const { x, y, z } = lngLatToTileCoords(lng, lat, 4);

          return `${z}/${x}/${y}`;
        })
      ).size;

      await sampleElevationsAlongCoordinates(coords, 'my-token', 4, mockFetch);

      expect(mockFetch).toHaveBeenCalledTimes(uniqueTileCount);
      expect(maxInFlight).toBeLessThanOrEqual(MAX_TILE_FETCH_CONCURRENCY);
    });

    it('propagates tile fetch errors', async () => {
      const err = new Error('tile error');

      err.status = 503;

      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });

      await expect(
        sampleElevationsAlongCoordinates([[10.75, 59.91]], 'token', TILE_ZOOM, mockFetch)
      ).rejects.toThrow(/Terrain-RGB tile request failed/);
    });
  });

  describe('sampleCoordinatesFromGeometry', () => {
    it('wraps the geometry in a Feature and delegates to getSampledCoordinatesAlongFeature', () => {
      const geometry = {
        type: 'LineString',
        coordinates: [[10.0, 60.0], [10.01, 60.01]],
      };

      getSampledCoordinatesAlongFeature.mockReturnValue([[10.0, 60.0], [10.01, 60.01]]);

      const result = sampleCoordinatesFromGeometry(geometry, 25);

      expect(getSampledCoordinatesAlongFeature).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'Feature', geometry }),
        25
      );
      expect(result).toEqual([[10.0, 60.0], [10.01, 60.01]]);
    });
  });
});
