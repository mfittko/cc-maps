# Phase 6: Apple Watch Route Experience And Release Alignment

## 1. Refined problem statement

Phase 5 establishes a real iPhone-to-watch transfer lane with persisted received-route data and explicit delivery outcomes. Phase 6 must turn that transferred route into a usable Apple Watch companion experience that is small, legible, and actually helpful during route use.

The watch experience is intentionally not planner parity. It exists so a skier can confirm whether a route is available, review the transferred route quickly, and keep lightweight route context visible during an outing without reaching for the phone. If Phase 6 turns into route editing, workout tracking, or navigation-engine work, the scope has already drifted.

This phase therefore has two equally important jobs:

1. Build a watch route experience that is glanceable, route-focused, and resilient across no-route, pending-route, ready-route, and degraded route conditions.
2. Close the loop on release readiness by aligning Apple-platform documentation and parity notes with the actual delivered watch scope, limits, and completion evidence.

The implementation target is a watch companion that renders from real transferred route data owned by the iPhone, not mocked route content and not watch-authored route state.

## 2. Scope

In scope for this phase:

1. Add the watch home state for no-route, pending-route, and route-available conditions.
2. Define explicit degraded-route handling for stale-route and partial-route conditions.
3. Add a route summary screen for the transferred plan.
4. Add a lightweight route visualization screen.
5. Define the active-use watch state for planned-route reference.
6. Finalize release-readiness documentation and parity notes.
7. Produce objective validation evidence that the watch remains useful without planner controls.

Clarifying scope constraints:

1. The watch app remains a companion for route receipt, route review, and active-use context.
2. The iPhone remains the source of truth for planned routes on Apple platforms.
3. The watch must render from the Phase 2 transfer contract and Phase 5 stored-route semantics rather than inventing local route ownership rules.
4. The watch experience must stay glanceable and route-focused on the smallest supported watch layout.
5. Release alignment includes Apple-platform docs and any higher-level product docs that describe delivered Apple scope or known limits.

## 3. Explicit deliverables

1. A watch home-state model that distinguishes and displays at minimum:
	- `no-route`
	- `pending-route`
	- `ready-route`
	- `stale-route`
	- `partial-route`
2. A default watch landing surface that makes route availability understandable without opening the iPhone app.
3. A route summary surface that shows at minimum:
	- route name or generated default label
	- total distance
	- enough additional summary context for route review, such as section count, destination label, last-updated timestamp, and elevation when available from the transferred payload
4. A lightweight route visualization surface that:
	- renders from transferred lightweight geometry or equivalent derived watch-display data
	- fits the received route into the visible watch map or visual frame
	- remains non-authoring and lightweight rather than behaving like a planner map
5. One active-use reference state optimized for quick during-outing route review rather than route editing.
6. A documented degraded-state policy covering:
	- what makes a stored route stale
	- what makes a stored route partial
	- what the watch may still show in each degraded state
	- which affordances must be disabled when a route is not fully ready
7. A release-alignment update set that identifies which docs must reflect delivered watch behavior and known limits, at minimum:
	- `docs/iOS/README.md`
	- `docs/iOS/spec.md`
	- `docs/iOS/PLAN.md`
	- `docs/iOS/plan/README.md`
	- `docs/iOS/plan/phase-6.md`
	- any root-level product doc that claims shipped Apple-platform scope
8. Completion evidence covering watch state handling, route summary, lightweight visualization, active-use reference behavior, and documentation parity.

## 4. Detailed workstreams

### 4.1 Watch home-state model and degraded-state semantics

Phase 6 is not complete if the watch only has a vague "route received" versus "no route" distinction. The user needs state handling that matches real transfer and persistence outcomes from Phase 5.

Required primary states:

1. `no-route`
	- No accepted usable route envelope exists on watch.
	- No pending replacement metadata currently indicates that a new route is in flight.
	- The watch must explain that no route is available and direct the user back to the iPhone app for route transfer.
	- The watch must not show fabricated summary values or a blank map pretending a route exists.
2. `pending-route`
	- No usable route is currently ready on watch, but transfer state indicates that a route is being received, validated, or finalized.
	- The watch must communicate that route availability is pending rather than silently looking empty.
	- The watch must not present a ready summary or ready visualization until the received route is actually usable.
3. `ready-route`
	- A valid route envelope has been accepted and persisted.
	- Required summary fields for the glanceable review experience are present.
	- Enough derived display data exists for the route summary and at least one lightweight visual representation.
	- This is the only state that may be presented as fully ready for normal watch route use.

Required degraded states:

1. `stale-route`
	- A previously accepted route still exists on watch, but metadata indicates it is older than the latest route known by the iPhone or has been superseded by a newer pending or completed transfer.
	- The watch may still present the older route as fallback reference only if the state is labeled clearly as older or outdated.
	- The stale state must not masquerade as the current active route.
	- If a newer route is pending while an older one remains viewable, the stale state should say both facts clearly: an older route is still available and a newer route is not ready yet.
2. `partial-route`
	- A route envelope is stored, but one or more fields required for the full ready experience are unavailable, unsupported, or incomplete.
	- Partial must be reserved for a real degraded-data case such as missing visualization geometry, missing section-summary payload, or an upgrade edge where the watch can show limited summary but not the full ready experience.
	- The watch must show the route in a reduced form only if the remaining data is truthful and useful.
	- Any unavailable summary or visualization element must be labeled as unavailable rather than shown as zero, blank, or inferred.

State precedence rules:

1. `ready-route` takes precedence only when the stored route is fully usable for both summary and lightweight review.
2. `partial-route` takes precedence over `ready-route` when summary or visualization requirements for the full ready experience are not met.
3. `stale-route` takes precedence over `ready-route` when a stored route is known to be outdated relative to newer phone-owned route state.
4. `pending-route` takes precedence over `no-route` when incoming transfer metadata exists, even if nothing usable is stored yet.
5. The state model must not collapse `no-route`, `pending-route`, `stale-route`, and `partial-route` into one generic error presentation.

### 4.2 Route summary surface expectations

The route summary screen is the primary review surface on watch. It must remain glanceable first and complete second.

Required summary fields:

1. Route name or generated default route label.
2. Total distance.
3. Destination label when available from the transferred payload.
4. Section count when available from the transferred payload.
5. Last-updated or received timestamp so the user can judge freshness.
6. Elevation summary only when the transferred payload already provides it or it is otherwise available without watch-side route reconstruction.

Summary rules:

1. The summary screen must not require the watch to rebuild the route graph before it can render.
2. Route name and total distance are mandatory for the full ready experience.
3. Optional summary fields must either render truthfully or be omitted or labeled unavailable; they must not be guessed.
4. Summary layout must remain readable on smaller watch screens without horizontal scrolling.
5. The summary screen must not expose route-authoring or route-editing actions.
6. If the route is stale or partial, the summary screen must display the degraded reason in a compact but explicit way.

Glanceability guardrails:

1. The first visible summary state should communicate route identity and readiness without requiring deep navigation.
2. Secondary metrics should not crowd out route name and total distance.
3. A section-by-section review list is optional and should only exist if it remains clearly subordinate to the top-level route summary.

### 4.3 Lightweight route visualization expectations

The visualization screen is a route-reference surface, not a planner canvas.

Required visualization behavior:

1. The watch should show a lightweight route view using Apple-native map or visualization primitives when practical.
2. The visualization must render from transferred lightweight geometry or equivalent derived display data prepared on iPhone.
3. The watch must not be required to reconstruct the full route graph before showing the route.
4. The visualization should fit the full route or the most relevant overview extent into the visible frame by default.
5. Start and finish markers may be shown if the transferred payload supports them, but they are not required if they add complexity without meaningful watch value.
6. The visualization may be minimally interactive only if that does not turn it into a planner surface.

Required exclusions:

1. No trail editing handles.
2. No add, remove, reverse, clear, or share controls.
3. No arbitrary planner-layer toggles or dense trail-inspection affordances.
4. No requirement for live rerouting, turn-by-turn guidance, or off-route alerting.

Degraded visualization rules:

1. If visualization geometry is unavailable but summary data is still usable, the watch must remain usable as a summary-first companion and show a clear visualization-unavailable state instead of a broken map.
2. If the stored route is partial because lightweight geometry is missing, the summary surface may remain available while the visualization entry point is disabled or labeled unavailable.
3. If the route is stale, the visualization may still render the older route only if the stale condition is identified clearly.

### 4.4 Active-use watch state for planned-route reference

The active-use state is the watch surface for on-wrist reference during an outing. It must prioritize quick route context over feature depth.

Required active-use behavior:

1. The active-use state must be reachable directly from a ready route without traversing planner-style controls.
2. The active-use state must keep route identity, readiness, and lightweight route context visible with minimal interaction.
3. The active-use state may reuse the route summary and visualization data, but it should favor larger, quicker-to-read route context over dense detail.
4. The active-use state must still be meaningful even if the watch offers no route-authoring controls at all.
5. The active-use state must not require a workout session, a navigation session, or turn-by-turn progression logic to be useful.

Objective usefulness checks for this state:

1. A user can tell whether the intended route is available from the watch without opening the phone.
2. A user can identify which route they are using by name and total distance.
3. A user can open a lightweight overall route reference without any route-editing controls.
4. A user can stay within watch-only route review during an outing without encountering missing planner actions that block the primary use case.

Scope guardrails:

1. This state is for reference, not guidance.
2. This state is for route use, not route planning.
3. If implementation adds optional current-location context, it must remain clearly secondary and must not expand the phase into workout or navigation-engine scope.

### 4.5 Release-readiness alignment and documentation parity

This phase closes only when the delivered Apple Watch scope is documented honestly.

Required documentation alignment:

1. Document what the watch app does in the first scoped release.
2. Document what the watch app does not do in the first scoped release.
3. Document the watch-state model at a product level, including empty or no-route, pending, ready, stale, and partial behaviors.
4. Document the route summary and lightweight visualization scope without implying planner parity.
5. Document the active-use watch state as route reference rather than workout tracking or navigation guidance.
6. Record any parity gap between the watch companion and the iPhone planner as an intentional scope boundary, not an accidental omission.
7. Record any platform constraint that forced a simplification relative to the original plan.

Required release evidence artifacts:

1. A short parity note that explains how the watch experience differs from the iPhone planner by design.
2. A concise known-limits note covering missing planner controls, missing workout engine, and missing offline-first guarantees.
3. Validation notes for at least one successful ready-route flow and one degraded-route flow.

### 4.6 Assignment packaging and completion evidence

This phase is still small enough to default to one implementation issue or one pull request unless ownership splits force a narrower breakdown.

Recommended implementation slices inside one coding issue:

1. Watch state model and home surfaces.
2. Route summary and degraded-summary handling.
3. Lightweight visualization and degraded-visualization handling.
4. Active-use reference state.
5. Documentation and release-readiness alignment.

Required completion evidence for the coding phase:

1. Paired-simulator or real-device evidence for no-route, pending-route, and ready-route handling.
2. At least one degraded-route validation case covering stale-route or partial-route behavior.
3. Evidence that the watch remains useful without any planner controls.
4. Updated Apple docs that match the delivered watch behavior and known limits.

## 5. Acceptance criteria

1. The watch app has clear empty, pending, and ready states.
2. The watch app can present a route summary for the transferred plan.
3. The watch app can present a simple route visualization.
4. The experience remains route-focused and glanceable rather than turning into a planner.
5. The documentation reflects the actual delivered Apple scope and known limits.
6. The watch clearly indicates when a route is available.
7. The watch can show route name and total distance.
8. The watch can display the received route in a lightweight visual form.
9. The watch can handle stale or missing route data without crashing or confusing the user.
10. Degraded route handling distinguishes no-route, pending-route, stale-route, partial-route, and ready-route conditions with different user-visible behavior.
11. A ready route is useful on watch without planner controls: the user can identify the route, review summary context, and open a lightweight route reference from the watch alone.
12. The active-use watch state prioritizes quick route context over planner controls, workout features, or turn-by-turn behavior.

## 6. Definition of Done

1. The watch companion is meaningfully usable for planned-route reference.
2. The release documentation explains what the watch app does and does not do.
3. The native Apple work has a documented completion state for its first scoped release.
4. Route overview and review flows are implemented.
5. Empty, pending, stale, partial, and ready route states are implemented and objectively differentiated.
6. The watch summary and lightweight visualization render from real transferred data rather than mocked placeholder data.
7. The experience is optimized for glanceable use, not route editing.
8. Completion evidence includes at least one paired-simulator or real-device validation pass that covers normal and degraded route states.

## 7. Validation plan

### 7.1 State validation

1. Validate no-route, pending-route, and route-available states.
2. Validate stale-route behavior when an older accepted route remains visible but is known to be outdated.
3. Validate partial-route behavior when summary data exists but the full ready experience is not available.
4. Validate that state precedence does not collapse degraded states into one generic fallback screen.

### 7.2 Route summary validation

1. Validate route summary rendering.
2. Validate that route name and total distance appear for a ready route.
3. Validate that optional fields such as section count, destination label, elevation, and last-updated status either render truthfully or show as unavailable without fabricated values.
4. Validate that stale-route and partial-route reasons are visible from the summary surface.

### 7.3 Lightweight visualization validation

1. Validate lightweight route visualization.
2. Validate that the watch can render the transferred route in a lightweight visual form without rebuilding the route graph locally.
3. Validate that visualization failure or missing geometry degrades to a truthful summary-first experience instead of a broken map.
4. Validate that the visualization surface does not expose planner controls.

### 7.4 Active-use and usefulness validation

1. Validate basic active-use flow on real device when possible.
2. Validate that the watch does not require planner controls to be useful.
3. Validate that a user can identify the active route by name and distance and reach a lightweight route reference from the watch alone.
4. Validate that no add, remove, reverse, clear, share, or route-authoring controls are required for the primary watch use case.

### 7.5 Documentation and release-alignment validation

1. Update Apple docs so they match delivered behavior and limits.
2. Validate that `docs/iOS/README.md`, `docs/iOS/spec.md`, `docs/iOS/PLAN.md`, `docs/iOS/plan/README.md`, and this phase doc describe the same watch scope.
3. If any root-level product doc mentions shipped Apple-platform capabilities, validate that it does not overstate planner parity or watch capabilities.
4. Capture completion evidence and parity notes in the same change set as the delivered watch experience.

## 8. Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| The watch experience expands toward parity with the iPhone planner and becomes too dense. | The watch stops being glanceable and the phase loses its intended simplicity. | Keep the scope centered on route use, not route authoring. Treat planner controls on watch as release blockers, not nice-to-haves. |
| Degraded-route handling is vague or merged into one generic fallback. | Users cannot tell whether the route is missing, incoming, outdated, or only partially usable. | Define and validate `no-route`, `pending-route`, `stale-route`, `partial-route`, and `ready-route` separately. |
| Lightweight visualization grows into a dense map surface. | The watch UI becomes harder to read and more expensive to maintain. | Treat visualization as route reference only. Prefer a truthful simple overview over dense map interaction. |
| The active-use state quietly turns into navigation or workout scope. | Phase 6 becomes an unbounded product expansion instead of a watch companion release. | Keep active-use focused on quick route context. Defer workout, rerouting, off-route alerts, and turn-by-turn guidance. |
| Documentation drifts from delivered behavior. | Release readiness is unclear and future implementation phases inherit false assumptions. | Update the Apple docs and any product-facing scope notes in the same completion pass as the watch experience. |
| Partial-route behavior is not specified because it seems rare. | Coding agents invent inconsistent fallback behavior when derived display data is missing or incomplete. | Document partial-route conditions explicitly even if the expected frequency is low. |

## 9. Non-goals / out of scope

1. Full planner parity on watch.
2. Workout-engine features.
3. Offline-first sync guarantees.
4. Route authoring, anchor editing, reverse, remove, clear, share, or GPX export on watch.
5. Turn-by-turn guidance, rerouting, off-route alerts, or a full navigation engine.
6. A watch-side saved-route library or multi-route history beyond the current active received route.
7. Making the watch the source of truth for route ownership or route revision.

## 10. Handoff notes for coding agent

1. Treat Phase 2 as authoritative for route-transfer payload shape and Phase 5 as authoritative for stored-route and acknowledgement semantics. Do not redefine route ownership in watch UI code.
2. Build the watch state model first. UI copy and navigation should sit on top of objective route states rather than encoding state logic ad hoc in views.
3. Preserve the distinction between `no-route`, `pending-route`, `stale-route`, `partial-route`, and `ready-route`. Do not collapse these into one fallback state just because the copy seems simpler.
4. Treat route name and total distance as mandatory ready-state summary fields. Any other metric should be optional unless already guaranteed by the transferred payload.
5. Keep the watch summary surface route-first. If layout pressure forces removal of a metric, remove secondary detail before route identity or readiness cues.
6. Keep lightweight visualization non-authoring. Do not add planner actions, route-edit controls, or dense trail-inspection affordances to the watch map.
7. The active-use watch state must remain useful even if it never gains live progress or workout data. Do not make future navigation ambitions a prerequisite for this phase.
8. If current-location context is added opportunistically, keep it explicitly secondary and do not let it change the product contract into guidance or workout tracking.
9. When implementation reveals a platform constraint, document the exact simplification in the Apple docs and parity notes rather than silently drifting the product description.
10. Treat documentation parity as part of the phase output, not as follow-up cleanup.

## 11. AC/DoD/Non-goal coverage table using exact current phase wording where possible

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| The watch must clearly show whether a route is available. | AC | Met | Sections 3, 4.1, 5, 7.1 | Preserved as the core home-state requirement. |
| The watch must show route name and distance. | AC | Met | Sections 3, 4.2, 5, 7.2 | Tightened to mandatory route name and total distance for the ready experience. |
| The watch should show a lightweight route view using Apple-native map or visualization primitives when practical. | AC | Met | Sections 3, 4.3, 5, 7.3 | Preserved with explicit derived-data and degraded-state rules. |
| The watch must degrade gracefully if the route is missing, stale, or only partially available. | AC | Met | Sections 3, 4.1, 4.3, 5, 7.1-7.3 | Expanded into explicit no-route, stale-route, and partial-route semantics. |
| The watch app has clear empty, pending, and ready states. | AC | Met | Sections 3, 4.1, 5, 7.1 | Preserved exactly and extended with stale and partial degraded states. |
| The watch app can present a route summary for the transferred plan. | AC | Met | Sections 3, 4.2, 5, 7.2 | Preserved as the primary review surface. |
| The watch app can present a simple route visualization. | AC | Met | Sections 3, 4.3, 5, 7.3 | Preserved with explicit non-planner constraints. |
| The experience remains route-focused and glanceable rather than turning into a planner. | AC | Met | Sections 1, 4.2, 4.3, 4.4, 5, 8 | Preserved as the core scope guardrail. |
| The documentation reflects the actual delivered Apple scope and known limits. | AC | Met | Sections 3, 4.5, 5, 7.5 | Preserved and expanded into explicit doc-update targets. |
| The watch clearly indicates when a route is available. | AC | Met | Sections 4.1, 5, 7.1 | Uses exact spec wording alongside the phase wording. |
| The watch can show route name and total distance. | AC | Met | Sections 4.2, 5, 7.2 | Uses exact spec wording alongside the phase wording. |
| The watch can display the received route in a lightweight visual form. | AC | Met | Sections 4.3, 5, 7.3 | Uses exact spec wording alongside the phase wording. |
| The watch can handle stale or missing route data without crashing or confusing the user. | AC | Met | Sections 4.1, 4.3, 5, 7.1-7.3 | Uses exact spec wording and adds explicit degraded-state checks. |
| The watch companion is meaningfully usable for planned-route reference. | DoD | Met | Sections 4.4, 6, 7.4 | Preserved as the top-level outcome. |
| The release documentation explains what the watch app does and does not do. | DoD | Met | Sections 4.5, 6, 7.5 | Preserved exactly. |
| The native Apple work has a documented completion state for its first scoped release. | DoD | Met | Sections 4.5, 4.6, 6, 7.5 | Preserved exactly. |
| Route overview and review flows are implemented. | DoD | Met | Sections 4.2, 4.4, 6, 7.2, 7.4 | Uses exact spec wording. |
| Empty, pending, and error states are implemented. | DoD | Met | Sections 4.1, 6, 7.1 | Tightened by replacing vague error handling with explicit degraded-route states. |
| The experience is optimized for glanceable use, not route editing. | DoD | Met | Sections 1, 4.2, 4.4, 6, 7.4 | Uses exact spec wording. |
| Added DoD nuance: stale-route and partial-route behavior are explicitly defined and validated rather than treated as generic error fallbacks. | DoD | Met | Sections 4.1, 4.3, 6, 7.1-7.3 | Added because the current phase wording already requires graceful degraded behavior. |
| Added DoD nuance: a ready route is useful from the watch alone without planner controls, route editing, or workout features. | DoD | Met | Sections 4.4, 5, 6, 7.4 | Added to make route-focused usefulness objectively testable. |
| Added DoD nuance: summary and visualization render from real transferred route data rather than mocked watch-local placeholders. | DoD | Met | Sections 1, 4.3, 6, 7.3 | Added to preserve the Phase 5 handoff boundary. |
| Added DoD nuance: release-readiness alignment includes Apple docs and any higher-level shipped-scope notes that mention Apple-platform behavior. | DoD | Met | Sections 3, 4.5, 6, 7.5 | Added to remove ambiguity about documentation parity. |
| Full planner parity on watch. | Non-goal | Met | Sections 1, 2, 9 | Uses exact current out-of-scope wording. |
| Workout-engine features. | Non-goal | Met | Sections 4.4, 9 | Uses exact current out-of-scope wording. |
| Offline-first sync guarantees. | Non-goal | Met | Sections 4.5, 9 | Uses exact current out-of-scope wording. |

## 12. Decision log

| Topic | Decision | Rationale |
| --- | --- | --- |
| Is the Apple Watch app a planner or a companion? | The watch remains a companion for route review and active-use reference, not a planner. | This preserves the requested small watch scope and prevents parity creep. |
| What watch states must be implemented explicitly? | `no-route`, `pending-route`, `ready-route`, `stale-route`, and `partial-route` must all be defined explicitly. | The phase wording already requires graceful handling for missing, stale, and partially available routes, and coding agents should not invent that logic later. |
| What makes a route fully ready on watch? | A route is fully ready only when accepted stored data supports both truthful route summary and at least one lightweight visual route reference. | This keeps ready-state semantics objective and prevents partial data from being shown as complete. |
| What makes a route stale on watch? | A stored route is stale when it is known to be older than newer phone-owned route state or has been superseded by a newer transfer. | The watch may still be useful as fallback reference, but it must not misrepresent an older route as current. |
| What makes a route partial on watch? | A stored route is partial when some transferred data is still truthful and usable, but one or more fields required for the full ready experience are unavailable or incomplete. | This preserves graceful degradation without fabricating missing summary or visualization data. |
| What is the primary watch review surface? | The route summary surface is primary; the lightweight visualization is secondary. | The watch must stay glanceable and route-first, especially on smaller screens. |
| Does active-use imply workout or navigation scope? | No. Active-use means quick route reference during an outing, not turn-by-turn, rerouting, or workout tracking. | This keeps the phase small and useful without creating a new navigation product. |
| What proves the watch is useful without planner controls? | The user can confirm route availability, identify the route by name and distance, and open a lightweight route reference directly on watch. | This gives the phase an objective usefulness threshold instead of subjective design judgment. |
| Which docs must align before Phase 6 can be called release-ready? | The Apple doc set and any higher-level shipped-scope notes that mention Apple behavior must match the delivered watch scope and known limits. | Release readiness is incomplete if the product description overstates watch capability. |