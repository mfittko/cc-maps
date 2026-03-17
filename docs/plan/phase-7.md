# Phase 7: Planning Mode And Shareable Route Composition

## Goal

Add a destination-scoped planning mode that lets users assemble a ski route from multiple trail sections and persist or share the resulting plan without expanding the app into an unbounded route engine.

## Status

Implemented for the initial planning-mode release on PR #12.

The shipped scope covers destination-scoped planning mode, ordered route anchors, persistence, shareable URLs, GPX export, and desktop/mobile interaction flows. Automatic connector routing was removed from the MVP scope after validation because manual route composition is sufficient for the initial release. Future follow-up work can iterate on richer reordering and additional route-summary polish without reopening the core interaction model.

## Product Intent

The current app is strong at exploration and single-section inspection, but it does not yet support deliberate route building. Planning mode should let a skier:

1. Select multiple trail sections in sequence to sketch a desired outing.
2. Reverse or reorder that intent where it materially changes the route.
3. Review the selected sections in order without automatic connector routing.
4. Review a clear summary of the resulting route length and freshness profile.
5. Keep the plan across reloads and share it with others using a compact URL.

The feature should remain explicitly destination-scoped. It is not a cross-destination tour planner.

## Scope

1. Add a planning mode entry point with distinct desktop and mobile interaction models.
2. Allow selecting multiple trail sections into an ordered route draft.
3. Support route reversal and removal of planned sections without forcing users to start over.
4. Build a destination-local route graph from the existing trail section and crossing model.
5. Show a route summary with at least total distance and section count.
6. Persist the current route plan in local storage.
7. Encode the route plan into URL state so it can be reopened or shared.
8. Keep the implementation bounded to the already loaded destination trail network.

## User Experience

### Desktop interaction

- Keep the existing single-click inspection flow as the default behavior outside planning mode.
- In planning mode, allow additive selection with `Cmd`-click on macOS and `Ctrl`-click on other platforms.
- Provide explicit controls to exit planning mode, clear the plan, and reverse the route.

### Mobile interaction

- Do not rely on modifier keys.
- Add an explicit planning mode toggle or action that changes tap behavior from inspect to route-select.
- Keep the planning controls compact so the map remains usable while editing a route.

### Route presentation

- Show the ordered planned route independently from the existing single-section details panel.
- Preserve the current trail detail inspection behavior when planning mode is off.

## Technical Direction

### Route graph

- Reuse the current destination-scoped trail segmentation and crossing analysis as the basis for graph nodes and edges.
- Treat crossings and dead-end section endpoints as graph nodes.
- Treat navigable trail sections between those nodes as weighted edges.
- Keep graph construction local to the active destination so runtime cost remains bounded.

### Plan model

Suggested shape:

- `PlannedSectionRef`: stable reference to a user-selected trail section or interval.
- `RoutePlan`: ordered anchors, summary metadata, destination id, and version.

The persisted model should reference sections compactly rather than storing raw geometries when possible.

### Persistence and sharing

- Persist route plans in local storage using a versioned schema.
- Mirror the active plan into URL-safe state so shared links rehydrate the same destination and selected route.
- Prefer compact encoded section references over verbose coordinate payloads.

## Deliverables

- Planning mode UX defined for desktop and mobile.
- Destination-local graph builder derived from the loaded trail network.
- Route planning state model with clear ordered-anchor semantics.
- Route summary UI and on-map route highlighting.
- Local-storage persistence and URL rehydration for plans.
- Tests for the extracted graph and routing logic.
- Updated docs describing the new planning behavior and its limits.

## Suggested Implementation Split

This phase is likely large enough to refine into multiple child issues.

1. Graph extraction and stable trail-section identifiers.
2. Planning-mode state, persistence, and URL encoding.
3. Desktop and mobile route-planning UX.
4. Route summary, highlighting, and validation polish.

## Dependencies

- Depends on Phase 6 being complete so graph and persistence logic can live in focused helpers rather than expanding `/pages/index.js` again.
- Depends on the current destination-first trail loading model remaining intact.
- Should reuse the existing map-domain trail section and crossing analysis rather than replacing it wholesale.

## Risks

- Route graph generation could become expensive if it is recomputed too often or against broader-than-destination data.
- URL encoding can become brittle if the plan model depends on unstable section identifiers.
- Planning mode can confuse the current inspect flow if the interaction model is not explicit enough.
- Future connector auto-routing could reintroduce complexity or surprising behavior if it is revisited without clearer product need.

## Acceptance Criteria

1. Users can enter and exit planning mode without breaking the existing inspection flow.
2. Users can add multiple trail sections to an ordered route draft within the selected destination.
3. Users can remove planned sections and reverse the route order.
4. The route summary shows total length and route composition details clearly enough to review before starting.
5. Reloading the page restores the active plan from local storage.
6. Opening a shared planning URL restores the same destination and route plan.
7. The feature does not trigger unbounded trail loading beyond the active destination.
8. The new pure planning helpers are covered by automated tests and keep repository coverage expectations intact.

## Verification

1. Confirm planning mode can be toggled on and off on both desktop and mobile flows.
2. Confirm multi-section selection produces a stable ordered route draft.
3. Confirm reversing the route preserves the selected anchor order correctly.
4. Confirm route plans survive reloads and can be reconstructed from shared URLs.
5. Confirm `npm run test:coverage` and `npm run build` still pass.
6. Confirm route-planning logic does not reintroduce unbounded startup trail loading or repeated heavy graph recomputation.

## Open Questions For Refinement

1. Should users be able to drag-reorder selected anchors, or is reverse plus remove/re-add sufficient for the first version?
2. How should the planner handle one-way practical skiing preferences if the source data does not encode directionality?
3. What is the right compact identifier for a trail section so shared URLs remain stable across app reloads and future data refreshes?
4. Should route plans be shareable only as URLs, or should the product eventually support named saved plans per destination?

## Out Of Scope

- Cross-destination route planning.
- Turn-by-turn navigation or live GPS guidance.
- Offline route syncing or service-worker-backed route caching.
- Public saved-route catalogs, community route publishing, or user accounts.
- Replacing the current single-section inspection flow outside planning mode.