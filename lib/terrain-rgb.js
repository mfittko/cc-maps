import { PNG } from 'pngjs';
import { getSampledCoordinatesAlongFeature } from './map-domain.js';

export const TERRAIN_RGB_TILESET = 'mapbox.terrain-rgb';
export const MAPBOX_TILE_API_BASE = 'https://api.mapbox.com/v4';
export const TILE_ZOOM = 12;
export const TILE_SIZE = 256;
export const DEFAULT_SAMPLE_SPACING_METERS = 25;

export function lngLatToTileCoords(lng, lat, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );

  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z: zoom };
}

export function lngLatToPixelWithinTile(lng, lat, tileX, tileY, zoom) {
  const n = Math.pow(2, zoom);
  const tileXFrac = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const tileYFrac = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const px = Math.min(Math.floor((tileXFrac - tileX) * TILE_SIZE), TILE_SIZE - 1);
  const py = Math.min(Math.floor((tileYFrac - tileY) * TILE_SIZE), TILE_SIZE - 1);

  return { px: Math.max(0, px), py: Math.max(0, py) };
}

export function decodeTerrainRGBHeight(r, g, b) {
  return -10000 + (r * 65536 + g * 256 + b) * 0.1;
}

export function getTileUrl(x, y, z, token) {
  return `${MAPBOX_TILE_API_BASE}/${TERRAIN_RGB_TILESET}/${z}/${x}/${y}.pngraw?access_token=${token}`;
}

export function decodePngBuffer(buffer) {
  return PNG.sync.read(buffer);
}

export function getPixelElevation(pngData, px, py) {
  const idx = (py * pngData.width + px) * 4;

  return decodeTerrainRGBHeight(pngData.data[idx], pngData.data[idx + 1], pngData.data[idx + 2]);
}

export async function fetchTilePixels(x, y, z, token, fetchFn = fetch) {
  const url = getTileUrl(x, y, z, token);
  const response = await fetchFn(url);

  if (!response.ok) {
    const err = new Error(`Terrain-RGB tile request failed: ${response.status}`);

    err.status = response.status;
    throw err;
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return decodePngBuffer(buffer);
}

export async function sampleElevationsAlongCoordinates(coordinates, token, zoom = TILE_ZOOM, fetchFn = fetch) {
  if (!coordinates.length) {
    return [];
  }

  const coordTileData = coordinates.map(([lng, lat]) => {
    const { x, y, z } = lngLatToTileCoords(lng, lat, zoom);
    const key = `${z}/${x}/${y}`;
    const { px, py } = lngLatToPixelWithinTile(lng, lat, x, y, zoom);

    return { key, x, y, z, px, py };
  });

  const uniqueTiles = new Map();

  for (const { key, x, y, z } of coordTileData) {
    if (!uniqueTiles.has(key)) {
      uniqueTiles.set(key, { x, y, z });
    }
  }

  const tilePixels = new Map();

  await Promise.all(
    Array.from(uniqueTiles.entries()).map(async ([key, { x, y, z }]) => {
      const pngData = await fetchTilePixels(x, y, z, token, fetchFn);

      tilePixels.set(key, pngData);
    })
  );

  return coordTileData.map(({ key, px, py }) => {
    const pngData = tilePixels.get(key);

    return getPixelElevation(pngData, px, py);
  });
}

export function sampleCoordinatesFromGeometry(geometry, sampleSpacingMeters = DEFAULT_SAMPLE_SPACING_METERS) {
  const feature = { type: 'Feature', geometry, properties: {} };

  return getSampledCoordinatesAlongFeature(feature, sampleSpacingMeters);
}
