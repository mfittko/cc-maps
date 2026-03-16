# Cross-Country maps

This repository contains `Cross-Country maps`, with `cc-maps` as the working alias for the codebase and deployment setup. The app uses **Next.js** and **Mapbox GL JS** to present an interactive map overlaid with ski trails from the public **Sporet** service. It is designed as a Progressive Web App (PWA) that works on iPhones and modern browsers.

## Structure

* `pages/index.js` - renders the full-screen Mapbox map, obtains the user's location and fetches trail data from the API route.
* `pages/api/trails.js` - API route that proxies requests to the Sporet REST service. It constructs a query to the `Loypetype` (cross-country trails) layer and returns GeoJSON.
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

For a detailed API specification and workflow description, see [`docs/spec.md`](docs/spec.md).