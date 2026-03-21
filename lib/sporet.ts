import { measureAsyncLoadPerf } from './load-perf';

export const SPORET_API_BASE_URL =
  'https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer';

export const SPORET_LAYER_IDS = {
  destinations: 4,
  trails: 6,
};

export const TRAIL_TYPE_STYLES = {
  20: {
    color: '#2d7ff9',
    label: 'Floodlit',
  },
  30: {
    color: '#17915f',
    label: 'Machine groomed',
  },
  40: {
    color: '#c67a10',
    label: 'Scooter trail',
  },
  50: {
    color: '#7e57c2',
    label: 'Historic trail',
  },
  default: {
    color: '#4f5b67',
    label: 'Other trail',
  },
};

export const DESTINATION_PREP_STYLES = {
  20: {
    color: '#20bf55',
    label: 'Prepared within 6 hours',
  },
  30: {
    color: '#157f3b',
    label: 'Prepared more than 6 hours ago',
  },
  40: {
    color: '#f08c24',
    label: 'Prepared more than 18 hours ago',
  },
  50: {
    color: '#7e57c2',
    label: 'Prepared more than 48 hours ago',
  },
  60: {
    color: '#d64545',
    label: 'Prepared more than 14 days ago',
  },
  70: {
    color: '#7d8894',
    label: 'Not prepared this season',
  },
  default: {
    color: '#52606d',
    label: 'Preparation status unknown',
  },
};

export function getSporetApiBaseUrl() {
  return process.env.SPORET_API_BASE_URL || SPORET_API_BASE_URL;
}

export function parseIntegerParam(value) {
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
}

export async function fetchSporetGeoJson(layerId, queryParams) {
  const searchParams = new URLSearchParams({
    returnGeometry: 'true',
    f: 'geojson',
    ...queryParams,
  });
  const requestUrl = `${getSporetApiBaseUrl()}/${layerId}/query?${searchParams.toString()}`;
  const response = await measureAsyncLoadPerf(`sporet layer ${layerId} fetch`, () =>
    fetch(requestUrl)
  );

  if (!response.ok) {
    throw new Error(`Sporet API request failed: ${response.status}`);
  }

  return measureAsyncLoadPerf(`sporet layer ${layerId} parse`, () => response.json());
}