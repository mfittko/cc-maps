# Cross-Country maps MVP Buildout Plan

This document now serves as a buildout record and status snapshot for the original MVP plan.

## Current status

- Phase 0 is complete: the repository is initialized, tracked as `mfittko/cc-maps`, and has baseline CI.
- Phase 1 is complete: the API routes exist, `destinationid` validation is in place, and shared Sporet mappings live in `lib/sporet.js`.
- Phase 2 is complete: the app loads destinations first, fetches trails on demand, renders legends and details, and exposes loading and error states.
- Phase 3 is complete at the intended MVP level: Mapbox CSS is global, `.env.local.example` exists, and manifest plus icon metadata are wired in.
- Phase 4 is now complete: the repository docs reflect the shipped behavior and current intentional exclusions.
- Phase 5 is complete retroactive documentation of the post-MVP enhancements that shipped after the original handoff plan.
- Phase 6 is complete: structural cleanup, responsibility splitting, and unit-test setup landed without changing product scope.

## Improvements that landed beyond the original written phase scope

- Winter-specific basemap paint overrides after the Mapbox style loads.
- Optional 3D terrain and building extrusion mode.
- URL and local storage persistence for destination, color mode, terrain mode, and map view.
- Client-side trail response caching with a 15-minute TTL.
- Nearby destination suggestions with preview trails.
- Trail crossing analysis and on-map segment-distance labels.

## Latest completed phase

Phase 6 delivered the cleanup and maintainability split: `/pages/index.js` now focuses on orchestration, panel presentation moved into components, persistence moved into a hook, pure geometry and storage helpers moved into `lib/`, and the repository now has a Vitest coverage gate for the extracted logic and API contract surface.

Guiding principles for that phase:

- SRP: give data fetching, map initialization, panel UI, trail analysis, and persistence separate homes.
- KISS: remove accidental complexity and avoid introducing abstraction layers that are not justified by repeated usage.
- DRY: consolidate repeated layer setup, state synchronization, and GeoJSON handling patterns.
- Add tests where logic becomes pure and isolated, so the cleanup improves maintainability rather than only reshuffling files.
- Behavior preservation first: the refactor should not expand scope unless a small fix is required to make the split safe.

The current engineering baseline after Phase 6:

1. `npm run test:coverage` is part of CI and enforces 90% coverage for lines, statements, branches, and functions across the covered modules.
2. Coverage is intended to surface dead code so it can be removed, not preserved with artificial tests.
3. Future work after this point should mostly be maintenance, targeted fixes, or newly scoped feature work.

## Phase documents

- See `/docs/plan/phase-0.md` for the repository bootstrap scope.
- See `/docs/plan/phase-1.md` for the API stabilization scope.
- See `/docs/plan/phase-2.md` for the destination-first map scope.
- See `/docs/plan/phase-3.md` for the mobile shell and PWA metadata scope.
- See `/docs/plan/phase-4.md` for the documentation alignment scope.
- See `/docs/plan/phase-5.md` for the retroactive record of shipped post-MVP enhancements.
- See `/docs/plan/phase-6.md` for the planned cleanup and architecture split.
- See `/docs/plan/README.md` for the phase index and completion notes.

## Relevant files in the current implementation

- `/pages/index.js` owns the map UI, state restoration, destination suggestions, preview trails, and trail analysis behavior.
- `/pages/api/trails.js` validates `destinationid` and proxies bounded trail queries to Sporet layer 6.
- `/pages/api/destinations.js` proxies active destinations from layer 4.
- `/lib/sporet.js` contains the layer IDs, query helper, and shared style mappings.
- `/pages/_app.js` imports Mapbox CSS and app metadata.
- `/public/manifest.json` and `/public/*.svg` provide install metadata.
- `/README.md` and `/docs/spec.md` describe the shipped behavior.

## Current verification checklist

1. `npm run build` succeeds with valid environment variables.
2. Initial app load fetches destinations before destination-scoped trails.
3. Selecting a destination issues `/api/trails?destinationid=...` and fits to the returned network.
4. Trail colors switch correctly between type and grooming freshness modes.
5. Map state survives reloads through URL query parameters and local storage.
6. Manifest metadata is served, while offline support remains explicitly unimplemented.
7. `npm run test:coverage` covers the extracted pure helpers and API contract surface and fails CI if coverage drops below 90%.

## Scope decisions still in effect

- Included: destination selection, destination-scoped trails, trail legends, trail detail metadata, mobile shell metadata, and the extra map UX enhancements listed above.
- Deferred: POIs, transport stops, warning polling, service worker support, and offline-first behavior.