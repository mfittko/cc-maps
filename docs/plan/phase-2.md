# Phase 2: Destination-First Map Experience

## Goal

Turn the scaffold into a usable MVP by making destinations the primary entry point, loading trails on demand for a selected ski area, and presenting the map with meaningful styling and user feedback.

## Scope

1. Rework `/pages/index.js` so the map loads destinations first instead of loading all trails immediately.
2. Render destinations on the map and let the user select one to fetch its trails.
3. Replace the placeholder line styling with data-driven trail styling based on `trailtypesymbol`.
4. Add user-visible loading, empty, and error states for destination and trail fetches.
5. Add a small legend or equivalent explanation for trail colors.
6. Add destination selection behavior and lightweight trail detail interaction such as a popup or compact details panel.

## Deliverables

- Destination-first loading flow in the main map page.
- Distinct trail colors for the primary trail type codes.
- User-visible loading and error feedback.
- Basic destination selection and trail detail interaction.

## Dependencies

- Requires the API contract and shared constants from Phase 1.

## Risks

- Rendering too many features at low zoom may affect performance.
- If the destination result set is large, the selection UI may need a compact list or filtering approach.
- Trail detail UX should stay lightweight to avoid over-designing before the MVP is proven.

## Verification

1. Confirm the initial page load shows destinations before any destination-specific trail fetch is triggered.
2. Confirm selecting a destination triggers a scoped request to `/api/trails?destinationid=...`.
3. Confirm the map updates to the selected destination and displays only the relevant trail data.
4. Confirm trail color differentiation works for the known `trailtypesymbol` values and degrades cleanly for unknown values.
5. Confirm the UI presents helpful feedback when destination or trail loading fails.

## Out Of Scope

- POIs, transport stops, and periodic warnings.
- Advanced map style switching.
- Rich analytics or telemetry.