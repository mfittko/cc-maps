# Phase 4: Native iPhone Planning, Sharing, And GPX Parity

## 1. Refined problem statement

Phase 4 is the parity gate for planned-route ownership on Apple platforms. Phase 3 proves that the iPhone app can clone the destination-first browse-and-inspect flow. Phase 4 must prove that the same native app can now create, edit, persist, rehydrate, share, and export the same bounded route concept that already ships on the web.

This phase is not a route-planner redesign. The implementation target is the current shipped web planner behavior:

1. planning mode is explicit
2. inspect-first trail details remain the default when planning mode is off
3. the route model is an ordered list of anchor sections rather than an unbounded routing engine
4. route editing is limited to clear, reverse, and per-section removal plus re-addition in a new order
5. persistence is canonical and compact
6. shared links reopen the same destination, route anchors, and only the nearby preview sectors actually required by the route
7. GPX export remains an export surface, not canonical persistence and not watch transfer
8. route-aware detail context remains available outside planning mode for planned segments

This phase is also the precondition for serious watch work. If the iPhone app cannot own the same ordered-anchor route semantics as the web app, the Apple Watch transfer phase would be forced to invent local rules for route identity, hydration, or stale-anchor recovery. That is explicitly out of bounds.

## 2. Scope

In scope for this phase:

1. Add explicit planning-mode entry and exit on iPhone.
2. Preserve inspect-first behavior whenever planning mode is off.
3. Let users build an ordered route by adding multiple trail sections from the selected destination and, when explicitly required, nearby preview sectors.
4. Preserve the current ordered-anchor route model defined in the web planner and route-contract fixtures.
5. Support clear, reverse, and per-section removal actions without introducing drag-reorder or automatic connector routing.
6. Persist the active canonical route locally on iPhone in a destination-scoped form or a semantically identical native representation.
7. Rehydrate the active route on app relaunch and on shared-link open using the Phase 2 canonical contract and hydration semantics.
8. Surface `ok`, `partial`, and `empty` hydration outcomes explicitly, including stale-anchor visibility.
9. Preserve generic share behavior using the compact canonical route encoding already established by the web product.
10. Preserve GPX export parity for the active route as a separate action from generic share.
11. Add route-summary presentation in the planning surface and route-aware details outside planning mode for planned segments.
12. Preserve bounded nearby preview-sector participation and destination-first performance boundaries.
13. Produce objective parity evidence against shipped web behavior before Phase 5 begins.

Clarifying scope constraints:

1. This phase is iPhone only.
2. This phase does not implement phone-to-watch transfer, watch delivery state, or watch route review UI.
3. This phase must not expand the planner into general cross-destination routing beyond the selected destination plus explicitly required nearby preview sectors.
4. This phase must not promote GPX export or generic share payloads into Apple Watch transfer semantics.

## 3. Explicit deliverables

1. A native iPhone planning surface that includes:
	- an explicit planning-mode entry point
	- an explicit planning-mode exit action
	- ordered planned-section presentation
	- clear, reverse, remove, share, and GPX export actions
	- route summary content suitable for review before sharing or export
2. A planning-state orchestration layer that documents and enforces:
	- planning-mode on versus off behavior
	- ordered-anchor add and remove semantics
	- reverse behavior
	- destination and preview-sector participation rules
	- persistence and hydration triggers
	- stale-anchor outcome handling
3. A native persistence and hydration layer that consumes the Phase 2 route contract and preserves:
	- canonical route identity
	- destination-scoped persistence
	- explicit `ok`, `partial`, and `empty` hydration outcomes
	- explicit stale-anchor reporting
4. A generic route-share flow that emits a canonical route artifact compatible with the shipped web planner semantics.
5. A GPX export flow for the active route that remains distinct from generic share and from future watch transfer.
6. Route-summary presentation for:
	- planning mode review
	- non-planning route-aware trail details when the selected segment belongs to the active route
7. Parity evidence and validation scenarios covering:
	- planning-mode entry and exit
	- ordered-anchor creation and editing
	- persistence and relaunch hydration
	- shared-link hydration
	- stale-anchor handling
	- route summary expectations
	- preview-sector participation bounds
	- generic share versus GPX separation

## 4. Detailed workstreams

### 4.1 Planning-mode entry, exit, and inspect-first behavior

Planning mode must be an explicit state, not an inferred side effect of tapping trails.

Required behavior:

1. The app must expose a clear planning-mode entry action from the iPhone browse surface.
2. Entering planning mode changes trail-tap behavior from inspect to route-edit for the duration of that mode only.
3. Exiting planning mode restores inspect-first trail tapping immediately.
4. Exiting planning mode must not discard the active route unless the user explicitly clears it.
5. The route may remain visible after exit, but route editing actions must not remain active while planning mode is off.
6. If the user selects a planned segment while planning mode is off, the app must show route-aware detail context rather than reopening editing controls.

Implementation constraints for the coding phase:

1. Model planning mode as explicit state with well-defined transitions rather than as view-local gesture branching.
2. Preserve the Phase 3 inspect flow as the default behavior and treat any regression here as a release blocker.
3. Do not require hidden gestures, long-press hacks, or modifier-key metaphors on iPhone.

Objective parity checks:

1. When planning mode is off, the same trail tap that opens route editing on the web only when planning mode is on must open inspect details natively.
2. When planning mode is on, tapping loaded route-eligible trail sections must add or remove anchors according to the same ordered-anchor rules used on the web.

### 4.2 Ordered-anchor route model and editing actions

This phase must preserve the current route model rather than inventing a smarter planner.

Required route-model behavior:

1. The active route is an ordered list of canonical anchor section ids.
2. Route composition must preserve insertion order unless the user invokes reverse or removes and re-adds sections.
3. This phase does not introduce drag-reorder or connector auto-routing.
4. Reversing the route inverts anchor order without mutating anchor identity.
5. Per-section removal removes only the chosen anchor and leaves the remaining anchor order stable.
6. Clearing the route removes all anchors and resets derived route summary state.
7. Duplicate anchor handling must match the current web semantics; the native implementation must not create a different canonical route for the same tap sequence.

Editing expectations:

1. The route list must show anchor order clearly enough that reverse and remove actions are reviewable before sharing or export.
2. Reverse must be explicit and reversible through a second reverse action.
3. Remove must be explicit per section and must not silently collapse unrelated anchors.
4. Clear must be explicit and must not trigger accidentally on planning-mode exit.

Objective parity checks:

1. Given the same ordered tap sequence on the same route fixture, the iPhone planner must produce the same canonical `anchorEdgeIds` as the shipped web planner.
2. Given the same route, one reverse action on iPhone must produce the same reversed anchor order as one reverse action on the web.
3. Given the same route, removing the second anchor on iPhone must produce the same remaining canonical route as the equivalent web action.

### 4.3 Local persistence, hydration, and stale-anchor handling

Persistence and hydration must use the shared contract already defined in Phase 2. Phase 4 is where that contract becomes exercised by real planner behavior.

Required persistence behavior:

1. The iPhone app must persist the canonical route payload or a semantically identical native representation of the same canonical fields.
2. Persistence must remain destination-scoped so route ownership is tied to the primary destination context instead of a global unbounded planner cache.
3. Derived summary data may be cached for performance, but it must remain non-authoritative and invalidatable.
4. Updating the route through add, remove, reverse, or clear must update local persistence deterministically.

Required hydration behavior:

1. App relaunch must attempt to restore the active route for the current destination context.
2. Shared-link open must hydrate the canonical route using the same `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds` semantics already documented in Phase 2.
3. Hydration must validate only canonical anchor ids against the rebuilt route graph.
4. Hydration must report exactly one of `ok`, `partial`, or `empty`.
5. Partial hydration must preserve valid anchors in original order and surface stale anchors explicitly.
6. Empty hydration caused by all-stale anchors must be distinguishable from a valid empty plan created by the user.
7. If the route graph needed for hydration is unavailable, anchors must be treated as stale rather than guessed.

Required UI outcome rules:

1. `ok` hydration restores the full active route without warning state.
2. `partial` hydration restores only valid anchors in original order and shows an explicit stale-route warning before the user shares, exports, or otherwise treats the route as fully valid.
3. `empty` hydration caused by stale anchors must surface an explicit restore-failed message and must not present a fabricated route summary.
4. The stale-anchor warning must identify that route sections could not be restored; silent dropping is not acceptable.
5. A user who accepts a partial route may continue editing from the valid-anchor remainder.

Objective parity checks:

1. The same canonical fixture must hydrate to the same `ok`, `partial`, or `empty` outcome on iPhone and on the current web helpers.
2. A partial stale-anchor fixture must preserve the same surviving anchor order on iPhone as on the web.
3. A shared-link route created on iPhone must reopen the same canonical route on the web when passed through the current web route decoder.

### 4.4 Generic sharing and GPX export parity

Share behavior must preserve product compatibility while remaining clearly separated from export and watch transfer.

Required generic share behavior:

1. Generic share must operate on the canonical compact route representation rather than on derived coordinate-heavy state.
2. The shared route artifact must reopen the same destination, route anchors, and required nearby preview sectors.
3. If the native app wraps the canonical route in an iOS-native deep link or share sheet payload, the embedded route semantics must still remain compatible with the current web planner model.
4. Generic share must be offered as a distinct action from GPX export.

Required GPX behavior:

1. GPX export must remain a separate user action from generic share.
2. GPX export must represent the active planned route in route order.
3. GPX export must be generated from the resolved route geometry, not from a separate alternate route model.
4. GPX export must not become canonical persistence, watch payload, or generic share fallback.

Separation rules:

1. Send-to-watch is not implemented in this phase.
2. No Phase 4 UI should imply that generic share or GPX export is equivalent to watch transfer.
3. If future watch-send affordances are referenced in implementation notes, they must remain separate from the generic share and GPX actions.

Objective parity checks:

1. A route shared from iPhone must recreate the same canonical route on the shipped web planner.
2. A route exported as GPX from iPhone must preserve route order and route geometry consistently with the same web-planner fixture route.
3. The iPhone UI must expose share and GPX as distinct actions, and neither action may trigger watch-specific transfer behavior.

### 4.5 Route summary expectations and route-aware details outside planning mode

Phase 4 is not complete if the planner only stores anchors invisibly. Users need reviewable route context in planning mode and inspect surfaces outside it.

Required planning-summary behavior:

1. The planning surface must show total route distance.
2. The planning surface must show the number of planned sections.
3. The planning surface must identify when the route spans nearby preview sectors rather than the primary destination only.
4. The planning surface must show route elevation summary when that data is available from the same derived route state used by the web planner.
5. If elevation summary is unavailable for a valid route, the UI must communicate unavailability explicitly rather than displaying a misleading zero value.
6. Summary values must refresh deterministically after add, remove, reverse, clear, and successful hydration.

Required non-planning route-aware detail behavior:

1. When planning mode is off and the user selects a segment that belongs to the active route, the normal trail-details surface must remain the entry point.
2. That details surface must additionally show route-aware context for the selected planned segment.
3. At minimum, the non-planning route-aware context must include selected route section index, overall route distance, and total route elevation metrics when available.
4. The route-aware detail view must not expose editing controls while planning mode is off.

Objective parity checks:

1. The same planned route fixture must produce the same total distance and section count on iPhone as on the web.
2. A planned segment selected outside planning mode must expose the same route-context categories on iPhone that the web app already ships: route section index, overall route distance, and total route elevation metrics when available.

### 4.6 Nearby preview-sector participation and bounded route semantics

The planner may span nearby preview sectors only when the current product already allows it. This remains a bounded exception, not a new routing model.

Required participation rules:

1. The primary selected destination remains the main planning context.
2. Nearby preview sectors may participate only when they are already part of the bounded preview set or explicitly required to rehydrate a shared or persisted route.
3. The route must not widen into arbitrary destination discovery beyond the selected destination plus required preview sectors.
4. Hydration of a shared or persisted route may request only the additional destination sectors named by canonical route state.
5. A preview-sector route must remain representable through canonical `destinationIds` and ordered `anchorEdgeIds`; no alternate cross-destination planner model is allowed.

Performance guardrails:

1. The normal planning flow must preserve destination-first request ordering.
2. The planner must not trigger all-destination graph construction or all-destination trail loading.
3. Preview participation must remain bounded to the same web parity target used in browse mode unless canonical route hydration requires fewer or specific sectors.
4. Derived route recomputation must remain dependency-driven; avoid rebuilding the whole graph or whole route summary on unrelated UI changes.

Objective parity checks:

1. A route that spans the selected destination and one nearby preview sector on the web must hydrate to the same `destinationIds` and anchor order on iPhone.
2. The iPhone planner must not load or persist extra destination sectors beyond those required by the active canonical route.

### 4.7 Assignment packaging and execution shape

This phase is tightly coupled enough that it should default to one implementation issue or one pull request unless team ownership splits force a narrower breakdown.

Recommended coding-track structure:

1. Planning-state and route-edit orchestration.
2. Persistence, hydration, and stale-anchor UI outcomes.
3. Share, GPX, route-summary, and non-planning route-aware details.

Required completion evidence:

1. Fixture-backed parity results against the current web planner helpers.
2. iPhone-sized simulator or device validation for the planning surface.
3. A short parity note documenting any justified native simplifications.

## 5. Acceptance criteria

1. Users can enter and exit planning mode.
2. Users can add multiple trail sections to an ordered route.
3. Users can reverse the route and remove individual sections.
4. Route persistence and hydration work reliably, including partial-hydration handling.
5. Route-share and GPX-export behaviors are implemented.
6. The route plan remains a native clone of the current bounded web planner.
7. Planning mode must be explicit.
8. Inspect-first behavior must remain intact outside planning mode.
9. Route plans must be stable across app relaunch.
10. Route-share and GPX-export actions must be distinct from send-to-watch.
11. Route hydration uses the shared Phase 2 contract and surfaces `ok`, `partial`, and `empty` outcomes explicitly.
12. Stale anchors are visible to the user and are never silently discarded.
13. Shared-link hydration recreates the same canonical route state as the shipped web planner.
14. GPX export preserves active-route order and remains separate from canonical persistence and future watch transfer.
15. Route summaries show total distance and section count, and show elevation summary when available.
16. Outside planning mode, selecting a planned segment shows route-aware detail context without re-entering editing mode.
17. Nearby preview-sector participation remains bounded to the primary destination plus explicitly required nearby sectors.
18. The planner does not trigger unbounded trail loading, unbounded route graph construction, or all-destination preview expansion.

## 6. Definition of Done

1. The iPhone app can create and own planned routes.
2. The route contract is exercised by real iPhone planner behavior.
3. The watch-transfer phase can begin without redefining route identity.
4. Added DoD nuance: planning mode on iPhone is modeled as explicit state with objective entry, exit, and off-mode inspect behavior validation.
5. Added DoD nuance: canonical route identity remains limited to the current shared contract fields and is not replaced by derived geometry, summary, or GPX data.
6. Added DoD nuance: hydration outcomes and stale-anchor handling are implemented exactly as `ok`, `partial`, and `empty`, with visible partial-route warning behavior.
7. Added DoD nuance: generic share, GPX export, and future send-to-watch concerns are represented as distinct product actions and payload types.
8. Added DoD nuance: route-summary values are stable after edit, relaunch, and shared-link hydration paths and are parity-checked against current web fixtures.
9. Added DoD nuance: route-aware trail details outside planning mode remain inspect-first and do not leak editing controls back into browse mode.
10. Added DoD nuance: preview-sector participation and route hydration remain bounded to the primary destination plus only the nearby sectors explicitly required by the active route.
11. Added DoD nuance: completion evidence includes iPhone-sized validation plus fixture-backed parity checks against the current web planning helpers and route contract.

## 7. Validation plan

### 7.1 Planning-mode state validation

1. Verify explicit entry into planning mode from the native iPhone browse surface.
2. Verify explicit exit from planning mode.
3. Verify that planning-mode exit does not clear the route unless the user explicitly clears it.
4. Verify that trail tapping opens inspect details when planning mode is off.
5. Verify that trail tapping edits the route only while planning mode is on.

### 7.2 Ordered-anchor and editing validation

1. Verify multi-section route creation from a deterministic fixture route.
2. Verify that anchor insertion order matches the current web planner for the same tap sequence.
3. Verify reverse behavior against the same fixture route on the web.
4. Verify per-section removal without collapsing unrelated anchors.
5. Verify clear behavior resets canonical route state and derived summary state.

### 7.3 Persistence and hydration validation

1. Verify local route persistence across app relaunch.
2. Verify shared-link hydration into the same canonical route state as the current web planner.
3. Verify `ok` hydration behavior.
4. Verify `partial` hydration behavior with visible stale-anchor warning and preserved valid-anchor order.
5. Verify `empty` hydration behavior when all anchors are stale.
6. Verify that graph-unavailable hydration does not guess route recovery.

### 7.4 Share and GPX validation

1. Verify that generic share emits the canonical route representation needed to recreate the same route.
2. Verify that a route shared from iPhone reopens the same canonical route on the web planner.
3. Verify that GPX export preserves route order and resolved geometry.
4. Verify that generic share and GPX export are distinct actions in the UI and in payload semantics.
5. Verify that no Phase 4 flow implies generic share or GPX export is watch transfer.

### 7.5 Route-summary and route-aware detail validation

1. Verify route summary values after add, remove, reverse, clear, relaunch, and shared-link hydration.
2. Verify total distance and section count parity against the current web planner fixtures.
3. Verify elevation summary parity when elevation data is available.
4. Verify that selecting a planned segment outside planning mode shows route-aware details without exposing editing controls.
5. Verify route section index, overall route distance, and total route elevation metrics for planned segments outside planning mode.

### 7.6 Preview-sector and performance-boundary validation

1. Verify that preview-sector participation is limited to the primary destination plus required nearby sectors.
2. Verify that hydration loads only route-required destination sectors.
3. Verify that the planner does not call unbounded trail-loading paths.
4. Verify that the planner does not fan out into all-destination graph construction.
5. Verify that preview-sector participation matches the bounded web planner behavior for the same fixture route.

### 7.7 End-to-end parity review

1. Compare native planning behavior directly against the shipped web planner using the same fixture routes.
2. Capture a parity checklist covering:
	- planning-mode entry and exit
	- inspect-first off-mode behavior
	- ordered-anchor creation
	- reverse and remove behavior
	- local persistence and relaunch hydration
	- shared-link hydration
	- stale-anchor visibility
	- route summary values
	- route-aware details outside planning mode
	- preview-sector participation limits
	- generic share versus GPX separation

## 8. Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Planning mode is not explicit enough on iPhone. | The inspect-first browse model regresses and route editing becomes unpredictable. | Treat planning mode as explicit state with dedicated entry and exit actions and separate validation for off-mode behavior. |
| Native route editing drifts from the ordered-anchor web model. | Shared links, persistence, and later watch transfer stop matching the shipped product. | Use fixture-backed parity checks against the current web helpers for add, reverse, remove, and clear semantics. |
| Hydration silently drops stale anchors. | Users reopen routes that no longer match what they planned, and route ownership becomes untrustworthy. | Enforce explicit `ok`, `partial`, and `empty` outcomes plus visible stale-anchor reporting. |
| Generic share, GPX export, and future watch transfer are conflated. | Later watch work inherits the wrong payload contract and the user-facing actions become misleading. | Keep generic share, GPX export, and send-to-watch as separate concepts in the spec, UI, and validation plan. |
| Route-summary logic drifts across edit and hydration paths. | The planner appears inconsistent and route review becomes unreliable. | Recompute summary from the same canonical route state after every edit and hydration path, then parity-check against current web fixtures. |
| Preview-sector support broadens into general cross-destination planning. | Performance boundaries break and the planner stops matching the bounded product model. | Limit participation to the primary destination plus only the nearby sectors explicitly required by the active route. |
| Route recomputation becomes too eager on iPhone. | Planning feels unstable and sets a bad baseline for later watch-transfer work. | Keep graph rebuilds and summary recomputation dependency-driven and bounded to the active route inputs only. |

## 9. Non-goals / out of scope

1. Reliable phone-to-watch transfer.
2. Watch UI for route review.
3. Send-to-watch delivery state, acknowledgement, or failure handling.
4. Planner controls on watch.
5. Turn-by-turn guidance, live rerouting, or workout-style navigation.
6. Drag-reorder or arbitrary reordering beyond reverse plus remove and re-add.
7. Automatic connector routing or expansion into a general routing engine.
8. Unbounded cross-destination route planning beyond the selected destination plus explicitly required nearby preview sectors.
9. Direct native access to Sporet or backend-contract expansion beyond the existing app-owned product routes.
10. Offline-first route sync, background bulk trail sync, or using GPX as canonical route persistence.

## 10. Handoff notes for coding agent

1. Treat the current web planner behavior and the Phase 2 route fixtures as the authoritative parity reference.
2. Preserve the destination-first runtime boundary. Planning is layered on top of selected-destination browsing; it must not reopen unbounded trail loading.
3. Keep planning mode explicit. Do not infer edit mode from selection state alone.
4. Keep canonical authority limited to `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds` or a semantically identical native representation.
5. Do not persist route summaries, GPX payloads, or watch convenience data as canonical route identity.
6. Treat reverse, remove, and clear as canonical route edits that must re-run persistence, summary recomputation, and parity checks.
7. Hydration must validate only canonical anchors against the rebuilt graph and must surface `ok`, `partial`, and `empty` exactly as defined in Phase 2.
8. Surface stale anchors to the user. Silent dropping is a product bug, not a simplification.
9. Keep generic share and GPX export separate in both UI structure and payload generation. Neither is a placeholder for watch transfer.
10. Add route-aware details outside planning mode without leaking edit controls into the Phase 3 inspect flow.
11. Keep preview-sector participation bounded to route-required sectors only. Do not widen the graph or trail set beyond what the active route needs.
12. If a native platform constraint forces any simplification, document it against the exact corresponding shipped web behavior instead of silently drifting.
13. Default to one implementation issue or one pull request unless concrete ownership boundaries require a split.

## 11. AC/DoD/Non-goal coverage table using exact current phase wording where possible

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| Planning mode must be explicit. | AC | Met | Sections 2, 4.1, 5, 6, 7.1 | Uses exact current required-behavior wording and converts it into objective mode-state validation. |
| Inspect-first behavior must remain intact outside planning mode. | AC | Met | Sections 1, 2, 4.1, 4.5, 5, 6, 7.1, 7.5 | Uses exact current required-behavior wording and adds route-aware off-mode detail expectations. |
| Route plans must be stable across app relaunch. | AC | Met | Sections 2, 3, 4.3, 5, 6, 7.3 | Uses exact current required-behavior wording and ties it to canonical persistence plus hydration. |
| Route-share and GPX-export actions must be distinct from send-to-watch. | AC | Met | Sections 1, 2, 4.4, 5, 6, 7.4 | Uses exact current required-behavior wording and preserves Phase 5 separation. |
| Users can enter and exit planning mode. | AC | Met | Sections 3, 4.1, 5, 7.1 | Uses exact current acceptance wording. |
| Users can add multiple trail sections to an ordered route. | AC | Met | Sections 2, 4.2, 5, 7.2 | Uses exact current acceptance wording and refines it into canonical ordered-anchor semantics. |
| Users can reverse the route and remove individual sections. | AC | Met | Sections 2, 4.2, 5, 7.2 | Uses exact current acceptance wording. |
| Route persistence and hydration work reliably, including partial-hydration handling. | AC | Met | Sections 2, 3, 4.3, 5, 7.3 | Uses exact current acceptance wording and adds explicit `ok`, `partial`, and `empty` rules. |
| Route-share and GPX-export behaviors are implemented. | AC | Met | Sections 3, 4.4, 5, 7.4 | Uses exact current acceptance wording and clarifies separation from watch transfer. |
| The route plan remains a native clone of the current bounded web planner. | AC | Met | Sections 1, 2, 4.2, 4.6, 5, 7.7 | Uses exact current acceptance wording and adds fixture-backed parity checks. |
| The iPhone app can create and own planned routes. | DoD | Met | Sections 1, 3, 5, 6, 7 | Uses exact current DoD wording. |
| The route contract is exercised by real iPhone planner behavior. | DoD | Met | Sections 3, 4.3, 4.4, 5, 6, 7.3, 7.4 | Uses exact current DoD wording. |
| The watch-transfer phase can begin without redefining route identity. | DoD | Met | Sections 1, 4.4, 6, 9, 10, 12 | Uses exact current DoD wording and keeps send-to-watch out of scope. |
| Added DoD nuance: planning mode on iPhone is modeled as explicit state with objective entry, exit, and off-mode inspect behavior validation. | DoD | Met | Sections 4.1, 6, 7.1 | Added to remove ambiguity around edit-mode transitions. |
| Added DoD nuance: canonical route identity remains limited to the current shared contract fields and is not replaced by derived geometry, summary, or GPX data. | DoD | Met | Sections 4.2, 4.3, 4.4, 6, 10 | Added to protect parity and later watch transfer. |
| Added DoD nuance: hydration outcomes and stale-anchor handling are implemented exactly as `ok`, `partial`, and `empty`, with visible partial-route warning behavior. | DoD | Met | Sections 4.3, 6, 7.3 | Added because stale-anchor handling is a release-critical parity rule. |
| Added DoD nuance: generic share, GPX export, and future send-to-watch concerns are represented as distinct product actions and payload types. | DoD | Met | Sections 4.4, 6, 7.4, 9, 10 | Added to prevent payload and UI drift ahead of Phase 5. |
| Added DoD nuance: route-summary values are stable after edit, relaunch, and shared-link hydration paths and are parity-checked against current web fixtures. | DoD | Met | Sections 4.5, 6, 7.5 | Added because summary drift would make parity claims too weak. |
| Added DoD nuance: route-aware trail details outside planning mode remain inspect-first and do not leak editing controls back into browse mode. | DoD | Met | Sections 4.1, 4.5, 6, 7.5 | Added because this behavior is shipped on the web and easy to regress in native UI. |
| Added DoD nuance: preview-sector participation and route hydration remain bounded to the primary destination plus only the nearby sectors explicitly required by the active route. | DoD | Met | Sections 4.6, 6, 7.6 | Added to preserve the bounded planner model. |
| Added DoD nuance: completion evidence includes iPhone-sized validation plus fixture-backed parity checks against the current web planning helpers and route contract. | DoD | Met | Sections 4.7, 6, 7.7 | Added to require objective completion evidence rather than feature-only claims. |
| Reliable phone-to-watch transfer. | Non-goal | Met | Section 9 | Uses exact current out-of-scope wording. |
| Watch UI for route review. | Non-goal | Met | Section 9 | Uses exact current out-of-scope wording. |
| Send-to-watch delivery state, acknowledgement, or failure handling. | Non-goal | Met | Sections 2, 4.4, 9 | Explicitly deferred to Phase 5. |
| Planner controls on watch. | Non-goal | Met | Section 9 | Keeps route authoring on iPhone only. |
| Automatic connector routing or expansion into a general routing engine. | Non-goal | Met | Sections 4.2, 4.6, 9 | Preserves shipped bounded manual planner semantics. |

## 12. Decision log

| Assumption or open point | Resolution | Rationale | Downstream effect |
| --- | --- | --- | --- |
| How should planning mode behave on iPhone? | Planning mode is explicit and reversible, and inspect-first remains the default when it is off. | This matches shipped web behavior and avoids ambiguous mobile editing gestures. | Coding work must model entry, exit, and off-mode inspection as separate validated states. |
| What is the canonical route model for Phase 4? | Keep the current shared ordered-anchor identity based on `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds`. | The web app already ships this model, and Phase 2 already documented it for cross-platform parity. | Phase 4 persists and shares the same route identity that Phase 5 will transfer. |
| Should Phase 4 add drag-reorder or connector auto-routing? | No. Keep editing bounded to add, reverse, remove, clear, and re-add. | The shipped planner is intentionally manual and bounded, and expanding it now would change product semantics. | Coding agents should not broaden the route engine during parity work. |
| What must hydration validate? | Validate only canonical anchors against the rebuilt route graph and return `ok`, `partial`, or `empty`. | This matches current web behavior and prevents invented traversal recovery rules. | Partial and stale routes reopen consistently across web and iPhone. |
| How should stale anchors be surfaced? | Show them explicitly; never silently drop them. | Silent loss would make route ownership and later watch transfer untrustworthy. | Native UI needs warning or status affordances before share or export on partial routes. |
| What is the minimum generic share parity bar? | A route shared from iPhone must recreate the same canonical route on the shipped web planner. | Web remains the behavioral reference and the current public share surface. | Native sharing can use an iOS wrapper, but canonical semantics must remain web-compatible. |
| How should GPX relate to persistence and sharing? | GPX stays export-only and separate from generic share and future watch transfer. | GPX is a user-facing export format, not route identity or Apple sync authority. | Phase 5 can define watch transfer without inheriting GPX constraints. |
| What summary parity is required in Phase 4? | Require total distance and section count, and require elevation summary when available. | Users need reviewable route context before sharing or export, and the web app already exposes route-level context. | Phase 4 must include route-summary validation, not just anchor persistence. |
| Are route-aware details outside planning mode in scope now? | Yes. Planned segments selected outside planning mode must show route context without exposing editing controls. | This behavior already ships on the web and closes the gap between planning and inspect flows. | The native trail-details surface must gain route context while preserving Phase 3 inspection semantics. |
| How far can preview-sector participation extend? | Limit it to the primary destination plus only the nearby sectors already bounded by preview logic or explicitly required by hydration. | This preserves destination-first performance boundaries and the bounded route model. | Route hydration and preview loading must stay narrow and dependency-driven. |
| Should Phase 4 be split into many issues? | Default to one tightly scoped implementation issue or one pull request. | Planning, persistence, summary, and share behavior are coupled enough that over-splitting adds coordination cost. | Only split later if concrete ownership or sequencing blockers appear. |