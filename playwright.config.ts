import { defineConfig } from '@playwright/test';

const defaultPort = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${defaultPort}`;
const shouldUseMapboxMock = !process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${defaultPort}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
      NEXT_PUBLIC_ENABLE_MAPBOX_MOCK: shouldUseMapboxMock ? '1' : '',
      SPORET_API_BASE_URL: process.env.SPORET_API_BASE_URL || '',
    },
  },
});
