# Cross-Country maps Specification

## Overview

Cross-Country maps, shipped as `cc-maps`, is a Next.js and Mapbox GL JS web app for browsing cross-country ski destinations and their trail networks from the public Sporet ArcGIS service.

The current implementation is destination-first. The app loads active destinations first, can auto-select the nearest destination based on geolocation, can switch to the destination whose trail geometry is within 0.05 km of the user's live location while follow mode remains active, and fetches trail GeoJSON only for the selected destination. The map UI also includes a winter-tuned basemap treatment, always-on terrain rendering, nearby destination suggestions, trail segment labels, a mobile-first settings overlay, trail crossing analysis in a dedicated trail details sheet, route-aware detail summaries for planned segments outside planning mode, and an explicit planning mode for shareable route composition.

The app exposes minimal PWA metadata through a manifest and icons, but it does not currently ship with a service worker or offline-first caching strategy.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Required client-side token for loading Mapbox styles and controls. |
| `MAPBOX_ACCESS_TOKEN` | Optional server-side override token for `POST /api/elevation`. When unset, the endpoint falls back to `NEXT_PUBLIC_MAPBOX_TOKEN`. |
| `SPORET_API_BASE_URL` | Optional override for the Sporet ArcGIS base URL. Defaults to the public service. |

Current minimal Mapbox token scopes:

- `NEXT_PUBLIC_MAPBOX_TOKEN`: `styles:read`, `fonts:read`, `styles:tiles`
- `MAPBOX_ACCESS_TOKEN`: `styles:tiles`

`MAPBOX_ACCESS_TOKEN` is an optional server-side override. The elevation endpoint prefers it when present and otherwise falls back to `NEXT_PUBLIC_MAPBOX_TOKEN`. It does not have to be a different token from `NEXT_PUBLIC_MAPBOX_TOKEN`.

Default Sporet base URL:

```text
https://maps.sporet.no/arcgis/rest/services/Markadatabase_v2/Sporet_Simple/MapServer
```

## Runtime architecture

| Layer | Current implementation |
| --- | --- |
| Presentation | `pages/index.js` composes the map shell while `components/ControlPanel.js`, `components/InfoPanel.js`, `components/PlanningPanel.js`, and `components/TrailDetailsPanel.js` contain the extracted overlay UI. |
| Hooks | `hooks/useMapPersistence.js` synchronizes destination, color mode, and map view with URL query parameters and local storage. |
| App shell | `pages/_app.js` imports Mapbox CSS, global CSS, title and meta tags, and manifest references. |
| API proxy | `pages/api/destinations.js` and `pages/api/trails.js` proxy the Sporet REST service and keep request rules centralized. |
| Shared domain logic | `lib/map-domain.js`, `lib/map-persistence.js`, `lib/planning-mode.js`, `lib/route-graph.js`, `lib/route-plan.js`, `lib/route-export.js`, and `lib/sporet.js` define the extracted geometry, persistence, planning, graph, export, validation, and Sporet request helpers. |
| Static assets | `public/manifest.json` plus SVG icons provide install metadata for mobile home-screen use. |

## Current user-facing behavior

### Map bootstrap

1. The page initializes a Mapbox map centered on the Oslo region by default.
2. The app restores destination, color mode, and map view from URL query parameters or local storage when available.
3. Terrain rendering is part of the default map presentation and is no longer user-toggleable.
4. A winter-themed basemap treatment is applied after the map loads.
5. Navigation and geolocation controls are added to the map.

### Destination-first flow

1. The client fetches active destinations from `/api/destinations`.
2. If the user has not already selected a destination, the app tries to auto-select the nearest destination based on foreground geolocation.
3. If geolocation is unavailable or denied, the app falls back to the destination nearest the default center.
4. While the destination is still being auto-followed, subsequent geolocation updates can switch to the destination whose trail geometry is within 0.05 km of the reported position.
5. A manual destination choice from URL state, storage, the desktop settings panel, the mobile settings overlay, or the map disables automatic destination switching so planning stays stable.

### Trail loading and rendering

1. The client fetches trails from `/api/trails?destinationid=<id>` for the selected destination.
2. Trail responses are cached in local storage for 15 minutes to reduce repeated network requests.
3. The selected destination's trails render as the primary network and the map fits to their extent unless the current view is intentionally being preserved.
4. Nearby destinations can be suggested based on the active map view, and their trail networks are shown in a lighter preview style.
5. Planning mode can add sections from those nearby preview sectors without switching the primary selected destination.

### Trail visualization and interaction

1. Trail colors can be toggled between trail type and grooming freshness.
2. A legend updates to match the selected color mode.
3. On mobile, the settings surface is minimized to a single icon under the map controls by default so the map remains unobstructed.

### Planning mode and route sharing

1. Users can enter planning mode from the desktop settings panel or the mobile map overlay.
2. Planning mode preserves the existing inspect-first trail click behavior when it is off.
3. In planning mode, desktop uses `Cmd` or `Ctrl` assisted selection while mobile switches to tap-to-add route editing.
4. Planned routes are shown as ordered anchor sections selected by the user and may span the selected destination plus nearby preview sectors.
5. The planning panel supports exit, clear, reverse, per-section removal, GPX export, and route sharing actions.
6. Planned routes persist in local storage and are encoded into the URL so shared links reopen the same destination, route, and supporting preview sectors required to rehydrate it.
7. Outside planning mode, selecting a segment that belongs to the active planned route keeps the normal trail-details sheet but augments it with whole-route distance and elevation context.
8. While live localization tracking is active and the user is on the planned route, the app auto-locks the first route section reached, shows route and selected-section traveled and remaining distances, and warns when movement appears to run opposite the planned route direction.

### Trail details panel

1. Clicking a loaded trail opens a dedicated trail details panel instead of expanding the general settings controls.
2. The trail details panel shows grooming type, freshness, crossing counts, and segment intervals when they are available.
3. On mobile, the trail details panel sits as a separate bottom sheet so the settings overlay and trail selection stay decoupled.
4. Clicking a trail selects the exact interval between crossings or endpoints that contains the click location, then shows detail metadata including trail type, classic and skating flags, grooming freshness, optional warning text, and computed section length.
5. Crossing analysis detects where the selected trail intersects other loaded trail geometry and derives segment distances between endpoints and crossings.
6. Segment-distance labels are rendered directly on the map at higher zoom levels.
7. When the selected interval is also part of the active planned route, the trail details panel additionally shows the selected route section index, overall route distance, and total route elevation metrics even though planning mode remains off.
8. If live localization tracking is active and the current position matches the active route, the trail details panel also shows route traveled and remaining distance, selected-section traveled and remaining distance, and a warning when the observed movement direction appears reversed relative to the route order.

### Persistence and shareability

1. The selected destination, color mode, and current map view are written back to the URL with `history.replaceState`.
2. The same state is mirrored to local storage so the last view can be restored on a later visit.
3. Planned routes are versioned, mirrored to local storage per primary destination, and encoded into the `route` query parameter with the supporting destination-sector IDs required for sharing and reload hydration.
4. The planning panel also supports GPX export for the active route.

### Mobile and installability

1. The app includes a manifest, theme color, favicon, and Apple touch icon metadata.
2. The current implementation supports home-screen installation metadata only.
3. There is no service worker registration, offline trail caching layer, or install prompt flow.

## API proxy contract

### `GET /api/destinations`

Purpose: Return active destination features from Sporet layer 4.

Behavior:

- Only `GET` is allowed.
- The proxy requests `id`, `name`, `prepsymbol`, and `is_active`.
- Results are filtered with `where=is_active=1` and ordered by `name ASC`.
- Responses are cacheable with `s-maxage=300` and `stale-while-revalidate=600`.

Response shape: GeoJSON `FeatureCollection` with point features.

### `GET /api/trails`

Purpose: Return trail features from Sporet layer 6.

Behavior:

- Only `GET` is allowed.
- `destinationid` must be a positive integer when provided.
- `lng` and `lat` may be provided together to run a bounded proximity query around the current location.
- Invalid `destinationid` values return `400` without calling Sporet.
- The primary product flow is destination-scoped: `where=destinationid=<id>`.
- Current-location trail matching uses a bounded point-distance query with `distance=0.05 km` and `resultRecordCount=25`.
- If `destinationid` is omitted, the proxy falls back to a limited unfiltered request with `resultRecordCount=250`. This exists as a bounded fallback and is not the intended UI flow.
- Responses are cacheable with `s-maxage=900` and `stale-while-revalidate=1800`.

Requested trail fields:

- `id`
- `destinationid`
- `trailtypesymbol`
- `prepsymbol`
- `warningtext`
- `has_classic`
- `has_skating`
- `has_floodlight`
- `is_scootertrail`
- `st_length(shape)`

Response shape: GeoJSON `FeatureCollection` with line features.

## Shared styling definitions

### Trail type styles

| `trailtypesymbol` | Label | Color |
| --- | --- | --- |
| `20` | Floodlit | `#2d7ff9` |
| `30` | Machine groomed | `#17915f` |
| `40` | Scooter trail | `#c67a10` |
| `50` | Historic trail | `#7e57c2` |
| fallback | Other trail | `#4f5b67` |

### Grooming freshness styles

| `prepsymbol` | Label | Color |
| --- | --- | --- |
| `20` | Prepared within 6 hours | `#20bf55` |
| `30` | Prepared more than 6 hours ago | `#157f3b` |
| `40` | Prepared more than 18 hours ago | `#f08c24` |
| `50` | Prepared more than 48 hours ago | `#7e57c2` |
| `60` | Prepared more than 14 days ago | `#d64545` |
| `70` | Not prepared this season | `#7d8894` |
| fallback | Preparation status unknown | `#52606d` |

## Sporet layer usage

### Actively used

| Layer | ID | Usage |
| --- | --- | --- |
| `Destinasjoner_prep` | 4 | Active destination markers and destination selection data. |
| `Loypetype` | 6 | Destination-scoped trail geometry and trail metadata. |

### Documented but not currently shipped in the UI

| Layer | ID | Status |
| --- | --- | --- |
| `POIer` | 2 | Deferred. |
| `Holdeplasser` | 8 | Deferred. |
| `Infopoint` | 13 | Deferred as a polling flow. Trail warning text is shown only when present on trail features already returned by layer 6. |
| `Destinasjoner_singel` | 11 | Not used by the current client. |

## Local development

1. Install dependencies with `npm install`.
2. Create `.env.local` from `.env.local.example`.
3. Provide a valid `NEXT_PUBLIC_MAPBOX_TOKEN` for browser map rendering.
4. Optionally provide `MAPBOX_ACCESS_TOKEN` for the server-side elevation endpoint.
5. The elevation endpoint prefers `MAPBOX_ACCESS_TOKEN` and falls back to `NEXT_PUBLIC_MAPBOX_TOKEN` when it is unset.
6. The token used for the elevation endpoint only needs the `styles:tiles` scope.
7. Run `npm run dev`.
8. Open `http://localhost:3000`.

For production-safe validation in this repository, use `npm run build`.

The extracted pure logic and API contract surface are also covered by `npm run test:coverage`, which enforces at least 90% line, statement, branch, and function coverage in CI.

## Deferred work

- POIs and transport stop overlays.
- Warning polling or a dedicated warnings layer.
- Service worker registration and offline-first behavior.
- More modular extraction of the large map page into dedicated UI components.
