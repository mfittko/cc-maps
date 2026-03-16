import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'tests/e2e/**', '**/*.spec.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['lib/**/*.js', 'pages/api/**/*.js'],
      exclude: ['**/*.test.js', 'tests/e2e/**', '**/*.spec.js', 'lib/mapbox-gl-mock.js'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});