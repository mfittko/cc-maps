# Phase 3: Mobile Shell And PWA Metadata

## Goal

Make the MVP practical on mobile by adding the minimum app shell work required for correct Mapbox rendering, environment clarity, and home-screen install metadata.

## Status

Complete at the intended MVP level.

This phase is satisfied in the current implementation:

- `/pages/_app.js` imports Mapbox GL CSS and app-wide metadata.
- `.env.local.example` documents the required runtime variables.
- `public/manifest.json` and the icon assets under `public/` provide install metadata.
- Offline support remains explicitly deferred, which matches the intended scope of this phase.

## Scope

1. Add `/pages/_app.js` to import Mapbox GL CSS and any global styles required by the app shell.
2. Add a minimal `.env.local.example` documenting required environment variables.
3. Add `/public/manifest.json` with the metadata needed for home-screen installation.
4. Add any required static assets or placeholders under `/public/` that the manifest references.
5. Decide whether offline support should be included now or explicitly deferred.

## Deliverables

- Global app shell with Mapbox CSS loaded correctly.
- Environment example file for local setup.
- Minimal manifest and supporting assets for install metadata.
- Explicit decision on service worker scope for MVP.

## Dependencies

- Can begin once Phase 2 is stable enough to verify mobile behavior.

## Risks

- PWA work can introduce unnecessary complexity if offline behavior is added too early.
- Missing icon assets can leave the manifest incomplete.
- Mobile layout adjustments may still be needed after the first device check.

## Verification

1. Confirm Mapbox controls render correctly, indicating global CSS is loaded.
2. Confirm the `.env.local.example` file reflects the actual runtime requirements.
3. Confirm the manifest is served and references existing assets.
4. Confirm the app remains usable at mobile viewport sizes after app shell changes.

## Out Of Scope

- Full offline caching unless explicitly approved.
- Complex install prompts or onboarding flows.