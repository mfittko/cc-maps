# Phase 3: Native iPhone Destination And Trail Clone MVP

## Status

Phase 3 is complete.

Closeout scope delivered:

1. Native iPhone browse-and-inspect flow under `apps/ios/` with destination-first loading, manual destination selection stabilization, destination-scoped primary trail loading, bounded nearby previews, inspect-first trail tapping, and a map-first SwiftUI plus MapKit presentation.
2. Shared fixture-backed parity coverage for trail-proximity auto-selection, bounded nearby previews, trail-detail categories, interval-aware trail inspection, and whole-feature inspection fallback.
3. Native XCTest coverage for trail-proximity auto-selection, bounded nearby previews, trail-detail labels, bootstrap request order, manual-selection lockout, stale primary-response invalidation, and fit-trigger stability during nearby preview loading.
4. iPhone simulator validation against the checked-in Xcode project and the local Next.js API surface.

## 1. Refined problem statement

Phase 3 delivers the first real native iPhone product surface for Cross-Country maps. The goal is not to explore a new Apple-specific concept. The goal is to prove that the current shipped web product can be cloned natively with `SwiftUI` and `MapKit` while preserving the product's bounded destination-first runtime model.

This phase must reproduce the core browse-and-inspect flow that already defines the web app:

1. load destinations first
2. resolve one active destination
3. load only that selected destination's trails in the normal flow
4. allow explicit manual destination selection
5. keep manual selection stable instead of letting later location updates override it
6. show bounded nearby destination previews without promoting them to the primary network
7. support inspect-first trail tapping and trail details on a phone-sized screen

The clone proof is behavioral, not pixel-identical. `MapKit` does not need to mimic Mapbox styling exactly, but the native app must preserve the same loading order, selection rules, map-fit expectations, inspection semantics, and performance boundaries that the web app already ships.

This phase is the viability gate for the broader native strategy. If Phase 3 cannot demonstrate that the web browse-and-inspect flow translates cleanly to iPhone without unbounded trail loading or product drift, planning work in Phase 4 and watch work in Phase 5 should not expand.

## 2. Scope

In scope for this phase:

1. A native iPhone browse surface built with `SwiftUI` and `MapKit`.
2. App bootstrap that starts in a destination-first state with no trail overlays loaded.
3. Initial fetch of active destinations from the existing `GET /api/destinations` route.
4. Automatic initial destination resolution when the user has not explicitly chosen a destination in the current session.
5. Foreground geolocation-based destination selection derived from current-location trail proximity, with nearest-trail resolution when multiple nearby trail candidates exist.
6. No destination-center fallback when geolocation is unavailable, denied, or does not produce a trail match; the app remains destination-first until location data or an explicit manual choice resolves selection.
7. Manual destination selection from a native destination control and from tappable map destination annotations.
8. Manual-selection stabilization so later automatic location updates do not switch destinations unless the user explicitly chooses another destination.
9. Selected-destination trail fetching through the existing `GET /api/trails?destinationid=<id>` route only.
10. Primary trail rendering in `MapKit` for the selected destination.
11. Bounded nearby-destination suggestions and lighter-weight preview trail rendering for those suggestions.
12. Inspect-first trail tapping that opens a native detail surface rather than entering planning behavior.
13. Trail detail content that matches the core web categories relevant to browse mode.
14. Map-fit behavior for the selected destination's primary trail network.
15. Test and parity evidence that compares native behavior to the current web flow objectively.

Clarifying scope constraints:

1. This phase is iPhone only. iPad-specific layout expansion is not required.
2. The normal browse flow must not call `/api/trails` without `destinationid`.
3. The app may use lightweight local caching or in-memory memoization if needed, but it must not widen request scope or weaken request ordering.
4. The phase may include minimal browse-state continuity only if it does not complicate the core parity target, but full URL-style parity is not required here.

## 3. Explicit deliverables

1. A native iPhone browse screen that displays:
	- a `MapKit` map
	- a destination picker or equivalent native destination-selection control
	- destination annotations
	- selected-destination trail overlays
	- nearby preview destination annotations and preview trail overlays
	- a trail details surface suitable for iPhone
2. A destination-loading and selection orchestration layer that documents and enforces:
	- bootstrap order
	- auto-selection precedence
	- manual-selection stabilization
	- cancellation or stale-result protection for in-flight requests
3. A trail-loading layer that consumes only the existing Next.js API routes and keeps the selected-destination path bounded.
4. A `MapKit` rendering approach for:
	- destination markers or annotations
	- primary selected-destination trail geometry
	- preview trail geometry with visibly lighter styling
	- selected-trail highlighting or equivalent inspection affordance
5. A trail-inspection flow that supports tap selection, interval or segment resolution where available, and a details sheet or panel with the required metadata.
6. Native test coverage and parity evidence for:
	- request order
	- destination selection rules
	- map-fit triggers
	- nearby preview bounds
	- inspect-first trail details
7. A native XCTest target that consumes the shared browse-contract fixtures before broader iPhone UI assertions are added.
7. Documentation updates produced during implementation if the shipped native behavior forces a justified simplification relative to this refinement.

## 4. Detailed workstreams

### 4.1 App bootstrap and loading-order orchestration

Phase 3 needs an explicit bootstrap state model rather than ad hoc view-driven requests.

Required bootstrap sequence:

1. Launch into a map shell with no trail overlays shown yet.
2. Request active destinations from `/api/destinations`.
3. Do not request trails before destination resolution has completed.
4. Resolve the active destination using this precedence:
	- explicit manual destination already chosen in the current session, if any
	- automatic trail-proximity destination resolution from foreground geolocation when no manual choice exists
	- no automatic selection if foreground geolocation is unavailable, denied, times out, or produces no trail match
5. Once one active destination is resolved, request trails only for that destination.
6. Only after primary trails are loaded should nearby preview logic become eligible to run.

Implementation constraints for the coding phase:

1. Treat destination loading, destination resolution, primary trail loading, and nearby preview loading as separate state transitions.
2. New destination selections must invalidate stale trail responses from prior selections.
3. A failed trail request must not silently fall back to unbounded trail loading.
4. A failed nearby preview request may degrade by omitting the preview, but the primary selected-destination flow must remain intact.

### 4.2 Destination selection rules and manual-selection stabilization

The native app must preserve the web product rule that manual destination choice stabilizes context.

Selection rules:

1. Automatic selection is allowed only while the user has not made an explicit manual destination choice in the current session.
2. A manual choice can come from either a destination list control or a destination annotation tap.
3. After a manual choice, subsequent foreground geolocation updates must not auto-switch the selected destination.
4. Automatic re-selection may continue before manual choice if foreground location updates indicate a nearer matching destination, consistent with the web app's follow-style behavior.
5. Changing the destination, whether automatic or manual, must clear the currently inspected trail and any preview-only state tied to the prior destination.

Parity expectation versus the web app:

1. If the same destination fixture set and the same location input are used, the native selection result must match the web destination-selection result.
2. If the same user flow includes a manual destination override, later location updates that would otherwise switch destinations on the web must be suppressed natively as well.

### 4.3 Trail fetch scoping and data-source boundaries

This phase must preserve the existing backend boundary and request discipline.

Required trail-loading behavior:

1. Primary trail requests must use `GET /api/trails?destinationid=<selectedId>`.
2. The intended browse flow must never use the backend's bounded unfiltered fallback request path.
3. Only one primary destination is active at a time.
4. The user-visible primary network must always correspond to the current selected destination.
5. Nearby preview trails, if loaded, must remain secondary overlays and must not replace the selected destination's primary trail set.

Performance guardrails for the coding phase:

1. No unbounded startup trail loading.
2. No fan-out across all destinations.
3. Ignore or cancel stale responses when the selected destination changes quickly.
4. Keep Sporet access behind the existing Next.js API routes; do not introduce direct native Sporet calls in this phase.

### 4.4 `MapKit` rendering and map-fit behavior

The map layer must feel native while preserving product semantics.

Required rendering expectations:

1. Destination annotations must be visible once destinations load.
2. The selected destination's trails must render as the primary, most legible network.
3. Nearby preview trails must render in a visually subordinate style that clearly distinguishes them from the selected destination's primary trails.
4. The selected trail or selected interval should have a stronger inspection highlight than the surrounding network.
5. The app must avoid unnecessary overlay churn when destination, preview, or selected-trail state changes.

Required map-fit behavior:

1. After the selected destination's primary trails load successfully, the map should fit to that trail extent.
2. The primary trail fit should occur on initial automatic destination resolution and on explicit manual destination changes.
3. Nearby preview loading must not trigger a second broad map fit.
4. Tapping a trail for inspection must not re-fit the full map.
5. A controlled implementation path may skip the default fit only when intentionally preserving a user-driven or restored region; that exception must be explicit rather than accidental.

Allowed native simplifications:

1. Visual styling may differ because `MapKit` replaces Mapbox.
2. Map callouts, sheets, and selection affordances may be idiomatic Apple patterns so long as the behavior remains inspect-first and destination-first.

### 4.5 Trail inspection and detail expectations

Trail inspection is the core user-facing proof that the clone is real and not just a destination marker demo.

Required interaction model:

1. Tapping a loaded trail must open a dedicated native trail-details surface.
2. Tapping the same trail again may close the selection if that interaction is the cleanest native equivalent, but the inspect surface must remain explicit and predictable.
3. Trail tapping in this phase must never enter planning behavior or mutate route state.

Required detail content for Phase 3 parity:

1. Trail type.
2. Classic and skating availability where present.
3. Grooming freshness or equivalent mapped freshness label.
4. Optional warning text when present.
5. Computed section length for the selected interval when interval selection is available.
6. Crossing count and interval metadata when those can be derived from the loaded trail set.

Selection-resolution expectations:

1. The app should select the exact interval between crossings or endpoints that contains the tap location when that interval can be derived from the currently loaded trail geometry.
2. If interval derivation cannot be performed reliably, the native app may fall back to whole-feature selection rather than failing silently.
3. Any fallback behavior must be documented in implementation notes and validated explicitly.

Out-of-scope detail content for this phase:

1. Route-aware trail details tied to an active planned route.
2. Live route-progress metrics.
3. Planning-mode route section controls.

### 4.6 Bounded nearby destination suggestions and preview behavior

Nearby previews are in scope only as a bounded browse enhancement, not as an excuse to reopen broad trail loading.

Required preview rules for Phase 3:

1. Nearby suggestions must be computed relative to the active map-view center or the selected destination center when no map-view center is available.
2. The selected destination itself must be excluded from the nearby-suggestion set.
3. The default browse parity target should match the current web behavior:
	- 20 km suggestion radius
	- nearest 3 preview destinations at most
	- debounced re-evaluation rather than recalculating on every transient map movement
4. Preview trail loads must occur only for the bounded preview-destination list.
5. Preview trails must be visually lighter than the selected destination's primary trails.
6. Preview trails must never cause the app to switch the primary selected destination automatically.
7. Preview behavior must remain optional at runtime if preview fetches fail; primary browse behavior must still succeed.

Objective parity check:

1. Given the same destination fixture set and map-view reference point, the native nearby preview destination IDs must match the web app's bounded preview selection outcome.

### 4.7 Parity evidence and implementation packaging

This phase should stay small enough to be implemented as one tightly scoped coding issue or one pull request unless concrete ownership boundaries appear later.

Required evidence package:

1. A parity checklist that maps each shipped native browse behavior to the corresponding current web behavior reference.
2. Test scenarios that prove request order, selection stability, bounded preview loading, and trail inspection.
3. Device or simulator evidence on an iPhone-sized form factor.
4. A short implementation note describing any justified native simplifications.

## 5. Acceptance criteria

1. The app launches into the destination-first model, with destinations requested before any trail request.
2. Destinations load before trails.
3. Trail requests remain destination-scoped in the intended flow.
4. The initial active destination is resolved from foreground geolocation when no explicit manual destination has been chosen in the current session, using current-location trail proximity rather than destination-center proximity.
5. Manual destination choice remains explicit.
6. Manual destination selection stabilizes the current context.
7. Once a destination is selected, the app loads only that destination's trails in the normal flow.
8. The selected destination's trail network is rendered as the primary network in `MapKit` and the map fits to that network unless the implementation is intentionally preserving the current region.
9. Nearby destination suggestions, if included in the build, remain bounded and secondary:
	- they exclude the selected destination
	- they are limited to a nearby radius and a small preview cap
	- they do not trigger a primary destination switch
10. Trail inspection exposes the same core detail categories already present on the web.
11. Trail inspection is available and usable on iPhone.
12. Tapping a trail opens a dedicated native detail surface and does not enter planning behavior.
13. The app does not fan out into unbounded trail loading.
14. The clone is recognizably the same product flow as the web app even though the UI is native.
15. Objective parity checks exist for request order, destination selection rules, nearby preview bounds, trail inspection, and map-fit triggers.

## 6. Definition of Done

1. The iPhone app can browse destinations and inspect trails.
2. The MapKit-based map experience is functional enough to support later planning work.
3. The app behaves like a native clone of the web flow rather than an unrelated Apple prototype.
4. Added DoD nuance: bootstrap, destination resolution, primary trail loading, and nearby preview loading are implemented as distinct, testable state transitions.
5. Added DoD nuance: manual destination stabilization is proven with automated or fixture-backed validation and not left as an inferred behavior.
6. Added DoD nuance: the normal browse path contains no unbounded `/api/trails` call and no all-destination trail fan-out.
7. Added DoD nuance: `MapKit` overlay updates are bounded enough that destination changes, preview refreshes, and trail inspection do not re-register or redraw the entire map state unnecessarily.
8. Added DoD nuance: trail details on iPhone remain inspect-first and decoupled from future planning controls.
9. Added DoD nuance: coding evidence includes at least one iPhone-sized simulator or device validation pass plus objective parity notes against the current web app.

## 7. Validation plan

### 7.1 Bootstrap and request-order validation

1. Verify the request order: destinations first, trails second.
2. Verify that no primary trail request is issued before the active destination is resolved.
3. Verify that the normal browse flow never calls `/api/trails` without `destinationid`.
4. Verify that rapid destination changes do not allow stale trail responses to overwrite the latest selected destination.

### 7.2 Destination-selection parity validation

1. Verify nearest-destination auto-selection against shared location fixtures and the current web selection behavior.
2. Verify that unavailable or denied geolocation does not fall back to destination-center proximity.
3. Verify that a manual destination choice from the native picker suppresses later automatic destination switching.
4. Verify that a manual destination choice from a map destination annotation behaves the same way.
5. Keep the early fixture-backed browse contract under `tests/fixtures/browse-contract/` and validate it with `tests/browse-contract.test.js` so native parity work starts from the shipped web outcomes rather than reinterpreting them ad hoc.

### 7.3 Primary trail-scope validation

1. Verify the selected-destination trail scope.
2. Verify that only the selected destination's primary trails are rendered as the main network.
3. Verify that changing destinations clears stale inspected-trail state.

### 7.4 Map and nearby-preview validation

1. Verify the map fits to the selected destination's primary trail extent after a successful primary trail load.
2. Verify that nearby preview loading does not trigger a second broad map fit.
3. Verify bounded nearby-sector preview behavior if included in this track.
4. Verify that preview suggestions exclude the selected destination, stay within the agreed radius, and stay within the agreed preview cap.
5. Verify that preview fetch failure degrades gracefully without breaking primary selected-destination browsing.

### 7.5 Trail-inspection validation

1. Verify trail inspection on a phone-sized screen.
2. Verify that tapping a trail opens the details surface instead of entering any planning path.
3. Verify that the details surface shows trail type, classic and skating availability when present, grooming freshness, optional warning text, and computed length for interval selection when available.
4. Verify interval selection against fixture cases where crossing-based interval resolution should be deterministic.
5. Verify the documented fallback path when interval derivation is unavailable.
6. Use fixture-backed contract cases for trail-detail categories and whole-feature fallback before adding native-specific UI assertions.

### 7.6 End-to-end parity review

1. Compare the resulting behavior directly against the web app for parity.
2. Capture a short parity checklist covering:
	- launch order
	- destination resolution
	- manual-selection stabilization
	- selected-destination trail loading
	- nearby preview bounding
	- inspect-first trail details
	- map-fit behavior

## 8. Closeout evidence

Validation completed for the implemented Phase 3 scope:

1. Shared browse-contract fixtures pass in `tests/browse-contract.test.js`.
2. Native browse parity tests pass in `apps/ios/CrossCountryMapsTests/BrowseContractTests.swift`.
3. Native closeout coverage now explicitly proves request order, manual-selection stabilization, stale primary-response invalidation, and the rule that nearby preview loading does not trigger a second primary fit request.
4. Repeated iPhone simulator build, install, launch, and manual UX review were completed against the checked-in `CrossCountryMaps.xcodeproj`.

Known Phase 3 simplifications retained intentionally:

1. Trail inspection remains whole-feature based in the current native MapKit implementation; deterministic interval selection and route-aware trail details remain future work.
2. Elevation summary is not part of Phase 3 browse parity and remains in Phase 4 route-summary and route-aware detail scope.
3. The app still depends on the existing Next.js API routes for runtime data rather than direct native Sporet access.

## 9. Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| `MapKit` limitations or native interaction differences tempt a product redesign too early. | Phase 3 stops being a clone proof and becomes a prototype drift point. | Optimize for behavioral parity, not visual sameness. Treat interaction redesign as out of scope unless a native platform constraint makes parity impossible. |
| Automatic destination logic drifts from the intended trail-proximity model. | The iPhone client stops feeling like the same product and becomes harder to reason about. | Use fixture-backed parity checks for trail-proximity selection, no center-based fallback, and manual-selection lockout. |
| Trail loading broadens beyond the selected destination. | Performance boundaries and backend assumptions break immediately. | Treat destination-first loading as a release blocker. Assert that the normal path never issues an unbounded `/api/trails` request. |
| Nearby previews accidentally become primary behavior. | The browse MVP regresses into multi-destination trail fan-out. | Keep preview radius, preview count, and preview styling explicitly bounded. Do not allow preview loads to auto-promote selection. |
| `MapKit` overlay updates become expensive or unstable. | Native browsing becomes sluggish and creates the wrong baseline for planning work. | Separate primary, preview, and selected-trail overlay concerns. Update only the overlay sets that changed. |
| Trail-tap inspection is under-specified and degrades to whole-feature ambiguity. | The iPhone surface becomes materially weaker than the web app's inspect behavior. | Validate deterministic interval-selection fixtures first, then allow a documented whole-feature fallback only where interval resolution is not reliable. |

## 10. Non-goals / out of scope

1. Full route planning parity.
2. GPX export.
3. Watch route transfer.
4. Route-aware trail details tied to an active planned route.
5. Apple Watch UI or synchronization behavior.
6. Direct native calls to Sporet or backend-contract expansion beyond the existing Next.js API routes.
7. Offline-first behavior, background bulk trail sync, or service-worker-equivalent caching behavior.
8. POIs, transport stops, or warning polling beyond warning text already present on trail features.
9. Pixel-identical visual replication of the web basemap, terrain presentation, or Mapbox-specific styling.
10. General cross-destination planning or multi-destination primary trail browsing.

## 11. Handoff notes for coding agent

1. Preserve the destination-first model as the core runtime boundary. If a design choice pressures the app toward loading many destinations' trails up front, reject that approach.
2. Keep Sporet access behind the existing `/api/destinations` and `/api/trails` routes. Do not bypass the Next.js proxy in this phase.
3. Model destination selection source explicitly, for example as automatic versus manual, so manual-selection stabilization is enforceable instead of implicit.
4. Keep bootstrap orchestration explicit. A simple state machine or equivalent coordinator is preferred over view lifecycle side effects scattered across multiple SwiftUI views.
5. Separate overlay concerns in `MapKit`: destination annotations, primary selected-destination trails, nearby preview trails, and selected-trail highlight should not all be regenerated together by default.
6. Keep nearby-preview derivation bounded and debounced. The web parity target is a 20 km radius with a maximum of 3 previews.
7. Trail tap handling should aim for the same inspect-first behavior as the web app: select the clicked interval when possible, otherwise fall back predictably.
8. Do not add planning abstractions yet unless they are strictly required to avoid repainting the browse architecture in Phase 4.
9. Treat simulator or device evidence as part of the phase output, not an optional afterthought.
10. If a native platform constraint forces a simplification, record it in implementation notes and compare it directly against the corresponding web behavior instead of silently drifting.

## 12. AC/DoD/Non-goal coverage table

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| Load destinations first. | AC | Met | Sections 2, 4.1, 5, 7.1 | Preserved as explicit bootstrap order. |
| Load only the selected destination's trails in the normal flow. | AC | Met | Sections 2, 4.3, 5, 7.3 | Expanded with explicit prohibition on unbounded fallback usage. |
| Render trail geometry and destination context with `MapKit`. | AC | Met | Sections 2, 3, 4.4, 6 | Refined into primary, preview, and selected-trail rendering expectations. |
| Support trail inspection and detail display. | AC | Met | Sections 2, 3, 4.5, 5, 7.5 | Expanded into inspect-first interaction and detail requirements. |
| Preserve manual destination selection as the stabilizer for planning context. | AC | Met | Sections 2, 4.2, 5, 6, 7.2 | Stabilization is specified even though planning itself is out of scope here. |
| The app launches into the destination-first model. | AC | Met | Sections 4.1, 5, 7.1 | Kept as a required bootstrap behavior. |
| Manual destination choice remains explicit. | AC | Met | Sections 2, 4.2, 5, 7.2 | Covers native picker and destination-annotation selection. |
| Trail inspection exposes the same core detail categories already present on the web. | AC | Met | Sections 4.5, 5, 7.5 | Objective content list added for parity. |
| The app does not fan out into unbounded trail loading. | AC | Met | Sections 4.3, 4.6, 5, 6, 8 | Treated as a performance release blocker. |
| Destinations load before trails. | AC | Met | Sections 4.1, 5, 7.1 | Uses exact current acceptance wording. |
| Trail requests remain destination-scoped in the intended flow. | AC | Met | Sections 4.3, 5, 7.1, 7.3 | Uses exact current acceptance wording. |
| Manual destination selection stabilizes the current context. | AC | Met | Sections 4.2, 5, 6, 7.2 | Uses exact current acceptance wording. |
| Trail inspection is available and usable on iPhone. | AC | Met | Sections 3, 4.5, 5, 7.5 | Uses exact current acceptance wording. |
| The clone is recognizably the same product flow as the web app even though the UI is native. | AC | Met | Sections 1, 4.7, 5, 7.6 | Parity checklist makes this testable. |
| The iPhone app can browse destinations and inspect trails. | DoD | Met | Sections 3, 5, 6, 7 | Uses exact current DoD wording. |
| The MapKit-based map experience is functional enough to support later planning work. | DoD | Met | Sections 4.4, 6, 7.4 | Uses exact current DoD wording. |
| The app behaves like a native clone of the web flow rather than an unrelated Apple prototype. | DoD | Met | Sections 1, 4.7, 6, 7.6 | Uses exact current DoD wording. |
| Added DoD nuance: bootstrap, destination resolution, primary trail loading, and nearby preview loading are implemented as distinct, testable state transitions. | DoD | Met | Sections 4.1, 6, 7.1-7.4 | Added to remove orchestration ambiguity. |
| Added DoD nuance: manual destination stabilization is proven with automated or fixture-backed validation and not left as an inferred behavior. | DoD | Met | Sections 4.2, 6, 7.2 | Added because this behavior is easy to regress silently. |
| Added DoD nuance: the normal browse path contains no unbounded `/api/trails` call and no all-destination trail fan-out. | DoD | Met | Sections 4.3, 6, 7.1, 8 | Added to make the performance boundary explicit. |
| Added DoD nuance: `MapKit` overlay updates are bounded enough that destination changes, preview refreshes, and trail inspection do not re-register or redraw the entire map state unnecessarily. | DoD | Met | Sections 4.4, 6, 8 | Added to preserve future planning headroom. |
| Added DoD nuance: trail details on iPhone remain inspect-first and decoupled from future planning controls. | DoD | Met | Sections 4.5, 6, 7.5 | Added to prevent Phase 4 concerns leaking into Phase 3. |
| Added DoD nuance: coding evidence includes at least one iPhone-sized simulator or device validation pass plus objective parity notes against the current web app. | DoD | Met | Sections 4.7, 6, 7.6 | Added to require completion evidence, not just feature presence. |
| Full route planning parity. | Non-goal | Met | Section 9 | Uses exact current out-of-scope wording. |
| GPX export. | Non-goal | Met | Section 9 | Uses exact current out-of-scope wording. |
| Watch route transfer. | Non-goal | Met | Section 9 | Uses exact current out-of-scope wording. |

## 12. Decision log

| Topic | Decision | Rationale |
| --- | --- | --- |
| Product model | Phase 3 is a native clone of the current web browse-and-inspect flow, not a redesign. | This phase exists to prove the clone strategy before planning or watch scope expands. |
| Platform stack | Use `SwiftUI` and `MapKit` for the iPhone browse MVP. | Matches the accepted Apple stack and keeps the platform substitution explicit. |
| Backend boundary | Keep all destination and trail access behind the existing Next.js API routes. | Preserves request validation, cache behavior, and contract ownership. |
| Bootstrap order | The app must request destinations before it requests any trails. | This preserves the destination-first performance boundary. |
| Initial destination resolution | Use foreground geolocation and trail proximity when no manual destination exists; do not fall back to destination-center proximity. | Keeps runtime selection tied to the actual trail network and avoids contradictory auto-selection rules. |
| Manual-selection stabilization | A manual destination choice suppresses later automatic destination switching for the current session. | This is core product behavior and must remain stable before planning is added. |
| Trail request scope | The normal browse path uses only destination-scoped trail requests. | Prevents regression into broad trail fan-out. |
| Nearby previews | Nearby preview behavior is in scope only as a bounded secondary enhancement. | It is shipped web behavior, but it must stay radius-limited, capped, and visually subordinate. |
| Preview bounds | Use the current web parity target of a 20 km radius and a maximum of 3 preview destinations, with debounced recalculation. | This is concrete, current, and performance-safe. |
| Map-fit behavior | Fit to the selected destination's primary trail extent after successful primary trail load; do not re-fit for preview loads or trail taps. | Preserves the web product feel without adding map churn. |
| Trail inspection fidelity | Select the tapped interval between crossings or endpoints when possible; otherwise allow a documented whole-feature fallback. | Keeps parity ambition high while acknowledging native implementation realities. |
| Phase split | Keep planning, GPX, and watch transfer out of Phase 3. | These belong to later phases and would dilute the proof value of the browse MVP. |
| Tracking structure | Keep Phase 3 implementation as one tightly scoped coding issue or one pull request unless concrete ownership splits emerge. | The browse MVP is coupled enough that over-splitting would add coordination overhead without improving clarity. |