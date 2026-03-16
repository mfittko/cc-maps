# Cross-Country maps

This repository contains `Cross-Country maps`, with `cc-maps` as the working alias for the codebase and deployment setup. The app uses **Next.js** and **Mapbox GL JS** to present an interactive map overlaid with ski trails from the public **Sporet** service. It is designed as a Progressive Web App (PWA) that works on iPhones and modern browsers.

The current MVP loads active ski destinations first, then fetches trails on demand for the selected area. Trail segments are color-coded by trail type, and the UI includes a legend plus basic trail detail feedback.

## Structure

* `pages/index.js` - renders the full-screen Mapbox map, loads active destinations, and fetches trails for the selected ski area.
* `pages/api/trails.js` - API route that proxies requests to the Sporet REST service for cross-country trail GeoJSON.
* `pages/api/destinations.js` - API route that proxies active ski destinations from the Sporet service.
* `lib/sporet.js` - shared Sporet layer IDs, API helpers, and trail and destination style mappings.
* `docs/spec.md` - complete specification of the application and API documentation extracted from the Sporet service.
* `docs/PLAN.md` and `docs/plan/` - implementation plan and phase breakdown.
* `package.json` / `next.config.js` - project configuration and dependencies.

## Usage

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.local.example` to `.env.local` and set the environment variables (see `docs/spec.md` for details).

3. Start the development server:

```bash
npm run dev
```

4. Open `http://localhost:3000` to view the app. On iPhone Safari you can add the app to the home screen for a more native experience.

## MVP Behavior

1. Load the map and wait for destinations to appear.
2. Choose a destination from the dropdown or click a destination marker on the map.
3. The app fetches trails only for that destination and fits the map to the returned extent.
4. Trail colors indicate trail type, and clicking a trail updates the details panel.

## Deferred Work

- Points of interest, transport stops, and warning polling are intentionally postponed.
- Offline caching and service worker support are not part of the current MVP.

For a detailed API specification and workflow description, see [`docs/spec.md`](docs/spec.md).