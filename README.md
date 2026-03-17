# Cross-Country maps

This repository contains Cross-Country maps, shipped under the `cc-maps` package and deployment alias. It is a Next.js and Mapbox GL JS application that loads active ski destinations from the public Sporet service, then fetches trail data on demand for the selected area.

The codebase is no longer just at the original MVP baseline. In addition to the destination-first flow, the current implementation includes a winter-tuned basemap, always-on terrain rendering, URL and local storage map-state persistence for destination, color mode, map view, and planned routes, client-side trail caching, nearby destination suggestions, live current-location destination matching when the user is skiing on a nearby track, a mobile-first settings overlay, trail crossing analysis in a dedicated trail details sheet, and a planning mode with shareable manual route composition and GPX export.

## Current implementation state

- Phase 0 through Phase 4 from the buildout plan are materially complete.
- The primary flow is destination-first and does not depend on an unbounded trail fetch.
- Minimal PWA metadata is present through the manifest and app icons, but there is no service worker or offline caching layer.
- A few map UX improvements shipped outside the original written phase scope and are now documented in this repository.

## Main files

- `pages/index.js` now focuses on map orchestration, state wiring, and layer lifecycle effects.
- `components/ControlPanel.js`, `components/InfoPanel.js`, `components/TrailDetailsPanel.js`, and `components/PlanningPanel.js` contain the extracted map overlay presentation.
- `hooks/useMapPersistence.js` handles URL and local-storage synchronization for destination, color mode, and map view.
- `lib/map-domain.js` contains extracted map-domain helpers such as distance calculations, nearby-destination selection, trail crossing analysis, and segment-label shaping.
- `lib/map-persistence.js` contains extracted storage and query-parsing helpers plus trail-cache shaping.
- `lib/planning-mode.js`, `lib/route-plan.js`, `lib/route-graph.js`, and `lib/route-export.js` contain the extracted planning, persistence, graph, and GPX export helpers.
- `pages/api/destinations.js` proxies active destination data from Sporet layer 4.
- `pages/api/trails.js` validates `destinationid` and proxies trail data from Sporet layer 6.
- `lib/sporet.js` contains shared Sporet layer IDs, query helpers, and trail and grooming style mappings.
- `pages/_app.js` wires in global styles, Mapbox CSS, and manifest metadata.
- `public/manifest.json` and the SVG icons under `public/` provide install metadata for mobile home-screen use.
- `docs/spec.md` documents the current product behavior and API contract.
- `docs/PLAN.md` and `docs/plan/` record the implementation phases and their completion status.

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env.local` from `.env.local.example`.

```bash
cp .env.local.example .env.local
```

3. Set the required values.

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=pk.xxxYourMapboxAccessTokenxxx
SPORET_API_BASE_URL=https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer
```

4. Start the development server.

```bash
npm run dev
```

5. Open `http://localhost:3000`.

6. Run the coverage-gated tests when changing extracted logic.

```bash
npm run test:coverage
```

## Runtime behavior

1. The app initializes the map, restores persisted map state when available, and loads active destinations.
2. If possible, it auto-selects the closest destination to the user or falls back to the default Oslo-centered view.
3. While the app is still following the user's current location, it can switch to the destination whose trail geometry is within 0.05 km of the reported position.
4. Manual destination selection still wins for planning and disables automatic switching.
5. Selecting a destination loads only that destination's trails and fits the map to the returned geometry.
6. Trail colors can be switched between trail type and grooming freshness.
7. Terrain rendering stays enabled as part of the default map presentation.
8. Clicking a trail selects the exact interval represented by the section-distance labels, then opens its detail metadata.
9. Nearby destination suggestions can surface around the current map view, with preview trails shown in a lighter style.
10. Users can enter an explicit planning mode, build an ordered manual route from trail sections, reverse or prune it, and keep the same route across reloads.
11. The active route is mirrored into URL state for sharing and can be exported as GPX.

## Deferred work

- POIs, transport stops, and warning polling are still intentionally deferred.
- Service worker support and offline-first behavior are still out of scope.

The up-to-date implementation reference is in `docs/spec.md`.