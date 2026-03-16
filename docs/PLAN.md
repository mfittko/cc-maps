# Cross-Country maps MVP Buildout Plan

Bring the scaffold from a demo map into a usable MVP by adding destination-driven trail browsing, production-safe data fetching, clear map styling, and minimal mobile/PWA shell support. The recommended path is to complete the core ski-area flow first, then add UX and installability work, while explicitly deferring non-essential overlay layers.

## Phase Documents

- See `/docs/plan/phase-0.md` for repository bootstrap, naming, CI, and GitHub setup.
- See `/docs/plan/README.md` for the phase index.
- See `/docs/plan/phase-1.md` for API stabilization and shared data setup.
- See `/docs/plan/phase-2.md` for the core map and interaction work.
- See `/docs/plan/phase-3.md` for mobile shell and PWA metadata work.
- See `/docs/plan/phase-4.md` for documentation completion and release alignment.

## Steps

1. Phase 0: Bootstrap the repository for delivery. Initialize git, rename the working title to `cc-maps`, add git hygiene files, configure CI, create the GitHub repository, and push the initial branch so implementation can proceed in a tracked project.
2. Phase 1: Stabilize the current data path. Update `/pages/api/trails.js` to validate `destinationid`, return a clear error for malformed input, and avoid relying on an unbounded `1=1` production flow as the primary loading strategy. This blocks the rest of the MVP because all trail loading depends on a predictable API contract.
3. Phase 1: Add shared map and data constants in a new file such as `/lib/sporet.js` for trail type labels, trail colors keyed by `trailtypesymbol`, and destination prep colors keyed by `prepsymbol`. This can run in parallel with step 2.
4. Phase 1: Add a destinations API route in `/pages/api/destinations.js` that proxies Sporet layer 4, filters to active destinations, and returns the fields needed for marker rendering and selection. This depends on the request and response conventions established in step 2.
5. Phase 2: Rework `/pages/index.js` so the initial map load fetches destinations first rather than all trails, renders destination markers or a destination layer, and lets the user select a destination to load trails for that area. This depends on steps 3 and 4.
6. Phase 2: Replace the placeholder single-color line styling in `/pages/index.js` with data-driven styling based on `trailtypesymbol`, and add a small legend or inline explanation for the color mapping. This depends on step 3 and can be completed alongside step 5.
7. Phase 2: Add essential interaction states in `/pages/index.js` and new UI components under `/components/` for loading, fetch failure, empty destination result, and selected destination metadata. This depends on step 5.
8. Phase 2: Add click behavior for destination selection and optional trail click popups or a compact details panel showing core trail metadata such as type, grooming flags, and warning text when present. This depends on steps 5 and 6.
9. Phase 3: Add app shell support required for a practical mobile MVP: import Mapbox GL CSS via `/pages/_app.js`, add a global stylesheet if needed, and add a minimal `.env.local.example` documenting required variables. This can run in parallel with step 7 once the core map flow is stable.
10. Phase 3: Add minimal PWA metadata in `/public/manifest.json` plus required icons or placeholders and corresponding head metadata so the app can be added to the home screen. This depends on step 9.
11. Phase 3: Review whether service worker and offline behavior should be included in MVP. If yes, add a lightweight PWA integration after the core flow is complete. If no, explicitly defer offline caching to post-MVP to avoid unnecessary complexity.
12. Phase 4: Update `/README.md` to reflect the actual MVP flow, environment setup, and any intentional omissions such as POIs, transport stops, and warnings polling being postponed.

## Relevant Files

- `/pages/index.js` - Main map entry point. It currently loads all trails on map load and will need to own destination-first loading, data-driven styling, selection, and user feedback states.
- `/pages/api/trails.js` - Existing proxy route. It should be hardened with query validation and a cleaner contract for destination-scoped trail loading.
- `/pages/api/destinations.js` - New proxy route for Sporet destination data from layer 4.
- `/pages/_app.js` - New app shell file to import Mapbox GL CSS and shared global styles.
- `/components/` - New presentational components for destination picker, loading and error banners, legend, and trail details.
- `/lib/sporet.js` - New shared constants and helpers for symbol-to-color mappings and response shaping.
- `/public/manifest.json` - New install metadata for mobile PWA support.
- `/public/` - New icons and any minimal static assets required by the manifest.
- `/package.json` - May need updates if PWA support or additional small UI dependencies are introduced.
- `/README.md` - Should be updated after implementation so setup instructions match the actual feature set.

## Verification

1. Install dependencies and run the app locally to confirm the map renders successfully with valid `NEXT_PUBLIC_MAPBOX_TOKEN` and `SPORET_API_BASE_URL` values.
2. Verify that the initial app load shows destinations before trails and does not fetch an unbounded trail dataset by default.
3. Select at least one destination and confirm that `/api/trails?destinationid=...` returns GeoJSON and the map updates to the expected trail extent.
4. Confirm trail lines render with distinct colors for the expected `trailtypesymbol` values and that unknown values degrade gracefully.
5. Confirm user-visible loading and error states appear for missing env vars, failed destination fetches, and failed trail fetches.
6. Confirm Mapbox controls are styled correctly, which implicitly verifies that Mapbox GL CSS is imported globally.
7. Confirm the mobile viewport experience on Safari-sized dimensions, including destination selection, geolocation control placement, and legibility of overlays.
8. If PWA metadata is included in scope, verify that the manifest is served correctly and the app exposes the expected install metadata on mobile.

## Decisions

- Included in MVP: destination discovery and selection, destination-scoped trail loading, trail type styling, loading and error states, and minimal mobile app shell work.
- Deliberately excluded from MVP unless scope changes: POIs, transport stops, periodic warnings polling, advanced map style switching, and sophisticated offline caching.
- Preferred loading strategy: destination-first rather than loading all trails on startup, because the current unfiltered trail query is likely too broad and brittle.
- Preferred architecture: keep external Sporet access in Next.js API routes so the client map code stays thin and query behavior remains centralized.

## Further Considerations

1. If the goal is the absolute smallest MVP, trail click details can be reduced to a popup and a simple destination list instead of a richer side panel.
2. If the Sporet API returns unexpectedly large destination or trail payloads, add request field narrowing and light response shaping before introducing heavier caching.
3. If installability is important but offline is not, include manifest and icons now and defer service worker work to a later phase.