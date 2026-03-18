# Native iPhone And Apple Watch Monorepo Specification

## Status

Proposed refinement package.

This document is intended to be implementation-ready once approved. It defines the product scope, architecture, work breakdown, validation expectations, and decision log for adding a native iPhone app and Apple Watch companion app to this repository.

The phase-oriented execution breakdown for this specification lives in `docs/iOS/PLAN.md` and `docs/iOS/plan/`.

## Source Inputs

This refinement is based on the current shipped web behavior and the explicit user requests captured in this workspace.

Source-of-truth behavior references:

1. `README.md`
2. `docs/spec.md`
3. `docs/PLAN.md`
4. `docs/plan/phase-7.md`
5. Current planning helpers under `lib/route-plan.js`, `lib/route-graph.js`, `lib/planning-mode.js`, and `lib/route-export.js`

Explicit request inputs:

1. "create an iOS app from this project"
2. "allow sending planned routes to an apple watch companion app"
3. "keep the code for the ios + apple watch app in this repo as mono repo setup"
4. "full specification (no code but full detailed refinement)"
5. "keep it in the monorepo, use native apple frameworks, but still keep it simple, use the web app as full example"
6. "we build a clone, just that we will use mapkit and also allow using the planned routes on the watch"

## RFC Gate

No blocking architecture RFCs remain for this refinement package.

This document resolves the foundational decisions that would otherwise block downstream implementation planning:

1. Repository strategy: monorepo, same repository as the existing web app.
2. Apple stack: native Swift, SwiftUI, MapKit, and WatchConnectivity.
3. Product model: the iPhone app is a simple native clone of the current web app behavior unless a platform-specific simplification is explicitly required.
4. Route ownership: the iPhone app is the source of truth for watch route transfer.
5. Scope boundary: the Apple Watch app is a companion for route receipt, review, and active-use context, not a full route planner.
6. Migration model: the existing web app is the full reference implementation for native parity work.

Open questions remain, but none block engineering refinement at this stage.

## Refined Problem Statement

Cross-Country maps already supports destination-first trail browsing, shareable route planning, and GPX export on the web. The product now needs a native Apple-platform extension that keeps those strengths while adding a reliable route handoff path to Apple Watch.

The work is not a thin wrapper around the current Next.js client. The web implementation is built around React, browser persistence, and Mapbox GL JS, while the target Apple experience requires native map rendering, native location handling, native watch communication, and watch-specific interaction constraints.

The intended implementation model is deliberately simple: clone the current shipped web app behavior as closely as practical, replace the web map layer with `MapKit`, use native Apple frameworks for client integration, and add planned-route use on Apple Watch.

The goal is to deliver a coherent Apple product line without fragmenting the repository, inventing a second product model, or drifting the route data contract across platforms.

## Decision Summary

### Accepted decisions

1. The Apple implementation lives in this repository.
2. The Apple implementation uses Xcode, Swift, SwiftUI, and MapKit.
3. The Apple Watch companion uses watchOS and WatchConnectivity.
4. The iPhone app should clone the current web product behavior wherever practical instead of redesigning the product for native.
5. `MapKit` replaces Mapbox GL JS as the map-rendering layer in the Apple clients.
6. The iPhone app owns route creation, persistence, and synchronization to the watch.
7. The watch app focuses on route receipt, route review, and active outing support.
8. The current web app remains the full reference implementation for native parity work during rollout.
9. Shared behavior should be expressed through specs, fixtures, and route contracts, not by trying to share UI or platform code directly between Next.js and SwiftUI.

### Rejected decisions

1. Do not treat a `WKWebView` shell as the long-term architecture for the Apple app.
2. Do not choose Flutter as the primary stack for this Apple-specific scope.
3. Do not make the watch app the primary route-planning surface.
4. Do not introduce offline-first guarantees as part of the initial Apple scope.

## Goals

1. Add a native iPhone app that clones the current web app's destination-first browsing, trail inspection, and planning behavior as closely as practical.
2. Preserve the existing route-planning concepts already shipped on the web: ordered anchor sections, shareable route state, and GPX export semantics.
3. Allow a user to send the current planned route from iPhone to Apple Watch.
4. Keep the iPhone, Apple Watch, and web clients aligned through one repository and one documented route contract.
5. Keep performance boundaries intact by preserving destination-first trail loading and bounded nearby-sector support.
6. Keep the native rollout simple by treating the web app as the detailed reference rather than redesigning product behavior during migration.

## Non-goals

1. Inventing a new product model for iPhone instead of cloning the current web app behavior.
2. Full feature parity on day one across web, iPhone, and watch.
3. Offline-first trail sync, offline routing, or a service-worker-equivalent watch sync model.
4. Turn-by-turn navigation, rerouting, or a full workout engine in the first watch release.
5. Cross-platform Android support as part of this Apple-specific workstream.
6. Shared UI implementation between the web and Apple clients.

## Product Scope

### In scope for the native Apple program

1. Monorepo project structure for Apple targets.
2. Native iPhone browse and inspect experience cloned from the current destination-first web flow.
3. Native iPhone route planning cloned from the same bounded route model already used on the web.
4. Native iPhone route sharing and GPX export compatibility.
5. Route transfer from iPhone to Apple Watch.
6. Apple Watch route overview and active-route companion experience.
7. Shared documentation, fixtures, and validation expectations across platforms.

### Out of scope for the initial Apple release train

1. Full replacement of the web app.
2. User accounts, cloud-synced saved plans, or multi-device server-side route storage.
3. Fully autonomous watch-side route planning.
4. General cross-destination route discovery beyond the bounded nearby-sector behavior already supported by the product.
5. Offline route download catalogs or background bulk trail synchronization.

## Target Product Model

### Client roles

#### Web app

1. Remains the currently shipped product.
2. Continues to act as the behavioral and UX reference for destination browsing and route planning.
3. Continues to define the current compact route-plan semantics and GPX expectations until replaced by an explicitly versioned shared contract.

#### iPhone app

1. Becomes the primary native Apple client.
2. Clones the current web product behavior natively rather than embedding the web UI.
3. Owns route planning, route editing, route persistence, and route transfer to the watch.

#### Apple Watch app

1. Acts as a companion to the iPhone app.
2. Receives the selected planned route.
3. Surfaces route summary, current route context, and lightweight active-use views.
4. Does not own route authoring in the first release.

### Source-of-truth model

1. The iPhone app is the source of truth for active planned routes on Apple platforms.
2. The route contract stores canonical route identifiers only.
3. Derived display data and summaries may be sent to the watch for reliability and latency reasons.
4. The watch should not be required to rebuild the entire route graph before it can show a received route.

## Simplicity Rules

The native Apple work should follow these explicit simplification rules:

1. Start by cloning what already exists on the web instead of inventing new Apple-specific product behavior.
2. Replace only the platform layer that must change: browser UI becomes SwiftUI, Mapbox GL JS becomes `MapKit`, browser persistence becomes native persistence, and watch route transfer uses `WatchConnectivity`.
3. Do not add major new user-facing capabilities during the initial native build.
4. When a choice exists between a clever Apple-specific redesign and a straightforward clone of existing behavior, prefer the straightforward clone.
5. Keep the watch scope intentionally small: use planned routes on watch rather than full route authoring.

## Native V1 Parity Inventory

This inventory is the canonical Phase 0 parity artifact. Later Apple phases should consume this table instead of reclassifying shipped web behavior ad hoc.

The phase column identifies the first responsible Apple phase for a behavior, not the only phase that may depend on earlier contract, hydration, or transfer work.

For parity review, bounded nearby preview behavior means a 20 km suggestion radius, at most 3 preview destinations, and debounced recalculation in browse mode. Route-planning participation may only extend beyond the primary destination when the active route requires nearby sectors already allowed by the bounded planner model.

### Required shipped behavior

| Behavior | Native v1 bucket | Behavioral reference source | First responsible Apple phase |
| --- | --- | --- | --- |
| Destination-first loading flow | Required | `README.md`; `docs/spec.md` Destination-first flow | Phase 3 |
| Destination selection and stable manual-selection behavior | Required | `README.md`; `docs/spec.md` Destination-first flow | Phase 3 |
| Destination-scoped trail loading | Required | `README.md`; `docs/spec.md` Trail loading and rendering | Phase 3 |
| Nearby destination suggestions and bounded preview trail rendering in browse mode | Required | `README.md`; `docs/spec.md` Trail loading and rendering | Phase 3 |
| Trail inspection and trail detail summaries | Required | `README.md`; `docs/spec.md` Trail details panel | Phase 3 |
| Inspect-first behavior outside planning mode | Required | `README.md`; `docs/spec.md` Planning mode and route sharing | Phase 4 |
| Route-required nearby preview-sector participation in planning and hydration | Required | `docs/spec.md` Planning mode and route sharing; `docs/plan/phase-7.md` | Phase 4 |
| Ordered-anchor route planning | Required | `README.md`; `docs/spec.md` Planning mode and route sharing; `docs/plan/phase-7.md` | Phase 4 |
| Route persistence across reload or relaunch | Required | `README.md`; `docs/spec.md` Persistence and shareability; `docs/plan/phase-7.md` | Phase 4 |
| Shareable route state or URL semantics | Required | `README.md`; `docs/spec.md` Persistence and shareability; `docs/plan/phase-7.md` | Phase 4 |
| GPX export | Required | `README.md`; `docs/spec.md` Planning mode and route sharing | Phase 4 |
| Route-aware trail details outside planning mode | Required | `README.md`; `docs/spec.md` Trail details panel | Phase 4 |
| Planned-route send-to-watch action | Required | Explicit Apple request inputs in this spec; `docs/iOS/plan/phase-0.md` | Phase 5 |

### Allowed simplifications for native v1

| Simplification | Native v1 bucket | Behavioral reference source | First responsible Apple phase |
| --- | --- | --- | --- |
| Visual styling differences caused by MapKit replacing Mapbox GL JS | Allowed to simplify | `docs/iOS/spec.md` Decision Summary; Simplicity Rules | Phase 3 |
| Small layout differences caused by SwiftUI control patterns | Allowed to simplify | `docs/iOS/spec.md` Simplicity Rules | Phase 3 |
| Watch-specific reduction of route detail density | Allowed to simplify | `docs/iOS/spec.md` Apple Watch app; UX Requirements | Phase 6 |
| Native adaptation of share surfaces so long as share, export, and send-to-watch remain distinct actions | Allowed to simplify | `docs/iOS/spec.md` UX Requirements | Phase 4 |

### Deferred from native v1 unless later promoted

| Deferred behavior | Native v1 bucket | Behavioral reference source | First responsible Apple phase |
| --- | --- | --- | --- |
| Any major new workflow not already present on the web | Deferred | `docs/iOS/spec.md` Non-goals | None; requires scope change |
| Offline-first sync and offline route packages | Deferred | `docs/iOS/spec.md` Non-goals | None; requires scope change |
| Turn-by-turn navigation or workout-engine features | Deferred | `docs/iOS/spec.md` Non-goals | None; requires scope change |
| Public saved-route catalogs or user accounts | Deferred | `docs/iOS/spec.md` Non-goals | None; requires scope change |

## Phase Ownership Map

This table assigns the first responsible Apple phase for each major work area so later phases do not reopen earlier structural decisions.

| Work area | First responsible phase | Ownership boundary |
| --- | --- | --- |
| Monorepo placement, Apple docs package, and parity governance | Phase 0 | Decide repo shape, parity boundaries, and phase sequencing only |
| Apple subtree, Xcode project, targets, schemes, and buildability | Phase 1 | Create `apps/ios/` and validate native shells without feature scope |
| Shared route contract, migrations, schemas, and fixtures | Phase 2 | Define canonical versus derived payload rules and fixture set |
| iPhone destination browsing, destination selection, trail loading, nearby suggestions, and inspection | Phase 3 | Deliver browse-and-inspect parity without planner scope |
| iPhone planning, persistence, share semantics, GPX export, and route-aware details | Phase 4 | Deliver planning parity without watch transfer ownership |
| Phone-owned watch delivery, acknowledgements, retries, and persistence handoff | Phase 5 | Deliver reliable send-to-watch behavior using the Phase 2 envelope |
| Watch route review, lightweight map, active-use context, and release alignment | Phase 6 | Deliver the watch companion experience without route authoring |

## Monorepo Structure

The Apple work should be added as a clearly bounded product subtree.

Recommended structure:

1. The current web app may remain at repository root until a later repo-wide reorganization is justified.
2. `apps/ios/` for the Xcode project, iPhone target, and watchOS target.
3. `docs/iOS/` for product and architecture documents.
4. `contracts/route-plan/` for route schema notes, migration rules, parity evidence, and cross-platform examples.
5. `tests/fixtures/route-plan/` for stable sample route payloads that match web behavior.

Repository rules:

1. Native Apple code must not be mixed into the existing Next.js directories.
2. Cross-platform contracts must be documented in neutral formats such as JSON fixtures and markdown specs.
3. Client-specific logic stays client-specific.

## Native Technology Stack

### Required Apple stack

1. `Xcode` for project management, simulators, signing, and distribution.
2. `Swift` for implementation.
3. `SwiftUI` for iPhone and watch UI.
4. `MapKit` for native map rendering.
5. `WatchConnectivity` for iPhone-to-watch route transfer.

### Supporting expectations

1. `URLSession` for API calls to the same backend contract already proxied by the Next.js app, unless a later decision introduces a mobile-specific API surface.
2. Native persistence for route state on iPhone.
3. Shared route fixtures to keep native and web plan semantics aligned.

## API And Data Contract Strategy

### Backend strategy

The Apple clients should initially reuse the existing product contract rather than inventing a new backend.

Requirements:

1. Preserve the destination-first loading model.
2. Preserve the bounded trail-loading rules already documented for `/api/destinations` and `/api/trails`.
3. Keep Sporet access centralized through the existing web-owned proxy layer until a separate mobile backend is explicitly justified.
4. Keep the Apple implementation simple by reusing the web-facing product contract unless a concrete blocker appears.

Implication:

1. The native clients should call the same product-facing endpoints and expect the same bounded data scope.
2. If direct access to Sporet is later considered, it requires a separate RFC because it changes security, caching, and contract ownership.

### Route contract strategy

The current web app already uses a compact route-plan model based on:

1. `version`
2. `destinationId`
3. `destinationIds`
4. `anchorEdgeIds`

That compact model remains the canonical planning identity for the first native contract version.

The Apple route-transfer payload must include two layers:

#### Canonical payload

Required fields:

1. Contract version.
2. Primary destination id.
3. Supporting destination ids.
4. Ordered anchor edge ids.

#### Derived payload

Required fields:

1. Human-readable route name or generated default label.
2. Resolved polyline coordinates for route display.
3. Total distance.
4. Elevation summary when available.
5. Ordered section summaries for route review.

Contract rules:

1. The canonical payload is authoritative and remains limited to the compact route identity already used by the web app.
2. Derived payload is a rendering convenience for the watch and may be recomputed on phone when route data changes.
3. Route names, route summaries, and resolved geometry are derived data, not canonical route identity.
4. GPX export is an output format, not the canonical Apple watch transfer format.
5. Contract versioning must be explicit from the first native release.

## Functional Requirements

### iPhone app foundation

1. The iPhone app must launch independently of the web app.
2. The iPhone app must support destination selection, destination-scoped trail loading, and trail inspection in ways that mirror the current web app.
3. The iPhone app must preserve the current product rule that manual destination selection stabilizes planning and disables automatic switching.
4. The iPhone app must support route planning using the current ordered-anchor model.
5. The iPhone app must support route clearing, route reversal, per-section removal, route sharing, and GPX export.

### iPhone route planning

1. Native route planning must preserve the current bounded route model.
2. Nearby preview sectors may participate only when they are explicitly required by the route plan.
3. The iPhone app must not reintroduce unbounded trail loading.
4. The iPhone app must preserve the current inspect-first behavior outside planning mode.
5. The iPhone app must keep route plan persistence versioned and resilient to stale anchors.

### Apple Watch companion

1. The watch app must be able to receive the active route from the iPhone app.
2. The watch app must be able to display the route summary even if live map interaction is limited.
3. The watch app should be able to display the received route on a lightweight map surface using native Apple mapping.
4. The watch app must degrade gracefully when route transfer is delayed or unavailable.
5. The watch app must not be required to edit anchors or build routes in the first release.

### Synchronization

1. The iPhone app must initiate route transfer only when watch pairing and app-install conditions are satisfied.
2. Background transfer must be supported for normal route handoff.
3. Live messaging may be used for status refreshes when both apps are active, but the system must not depend on reachability-only communication for core route delivery.
4. The watch app must acknowledge receipt in a way that the iPhone UI can surface to the user.

## UX Requirements

### iPhone UX

1. The initial iPhone browsing flow should mirror the current product sequence: load destinations first, then selected-destination trails.
2. Route planning should feel native but should behave like the current web planner rather than introducing a different product model.
3. Route-send actions must be explicit and separate from generic sharing.
4. The UI must clearly distinguish:
Share route link.
Export GPX.
Send to Apple Watch.

### Watch UX

1. The watch app must optimize for glanceability.
2. The watch home state should clearly indicate whether a route is available.
3. The primary received-route screen should show route name, distance, and route status.
4. The map view should be secondary to route summary if screen or performance constraints make simultaneous detail difficult.
5. The watch experience should prioritize clarity over parity with the iPhone planner.

## Assignment-Ready Work Breakdown

The native Apple program should be treated as a simple clone-and-adapt effort, split into six implementation tracks only to keep ownership and sequencing clear.

### Track 1: Monorepo And Apple Project Bootstrap

Problem statement:

The repository currently contains only the web product. Apple targets need a clean home, build strategy, and ownership boundary that do not pollute the Next.js app.

Technical approach:

1. Add `apps/ios/` with an Xcode project containing iPhone and watch targets.
2. Add repo-level documentation that explains the Apple subtree, ownership, and build entry points.
3. Add CI boundaries so Node and Xcode validation can run independently.

Dependencies:

1. None.

Acceptance criteria:

1. The repository contains a dedicated Apple project subtree.
2. Apple build instructions are documented.
3. CI strategy is defined for separate web and Apple validations.

Definition of Done:

1. Project layout is documented.
2. Apple targets build in local development.
3. Repo docs explain how the web and Apple products coexist.

Validation plan:

1. Create a local clean-clone bootstrap checklist.
2. Validate that web build steps and Apple build steps do not depend on each other.

Risks and mitigations:

1. Risk: repo sprawl and unclear ownership.
2. Mitigation: isolate Apple code under `apps/ios/` and document build boundaries immediately.

Handoff notes:

1. Keep repo reorganization minimal unless a separate approved task expands the web app into `apps/web/`.

### Track 2: Shared Route Contract And Fixtures

Problem statement:

The web app already has stable route-plan semantics, but there is no platform-neutral contract package for Apple clients.

Technical approach:

1. Define a versioned native route payload spec derived from the current web route-plan model.
2. Add shared fixtures for canonical and derived route payloads.
3. Document stale-anchor and version-migration behavior.

Dependencies:

1. Track 1 for repo placement.

Acceptance criteria:

1. The route-transfer contract is versioned and documented.
2. Fixtures cover at least one single-destination route and one multi-destination preview-sector route.
3. Migration rules are defined for stale or partially valid anchors.

Definition of Done:

1. Contract docs exist.
2. Fixtures exist.
3. Both web and Apple teams can validate payload examples against the documented shape.

Validation plan:

1. Compare fixture payloads against current web route behavior.
2. Validate that canonical anchor ordering remains deterministic and that derived names and summaries stay traceable to canonical route identity.

Risks and mitigations:

1. Risk: contract drift between web and Apple.
2. Mitigation: shared fixtures and explicit versioning.

Handoff notes:

1. Preserve the current compact route-plan identity instead of inventing coordinate-only route persistence.

### Track 3: Native iPhone Destination And Trail MVP

Problem statement:

The Apple product needs a native browse-and-inspect flow before planning or watch transfer becomes valuable.

Technical approach:

1. Clone the web app's destination-first flow in SwiftUI and MapKit.
2. Consume the same product-facing destination and trail endpoints.
3. Implement native destination selection, trail rendering, and section inspection.

Dependencies:

1. Track 1.
2. Track 2 for fixture-backed expectations.

Acceptance criteria:

1. The app loads destinations before trails.
2. The app loads only the selected destination's trails in the normal flow.
3. Manual destination selection stabilizes planning context.
4. Trail inspection exposes the same core metadata the web app already surfaces.

Definition of Done:

1. Native browse flow works on device and simulator.
2. Destination-first loading behavior is preserved.
3. The app remains usable on phone-sized screens.

Validation plan:

1. Verify destination-first requests.
2. Verify destination switching behavior.
3. Verify bounded nearby-sector preview behavior if included in this track.

Risks and mitigations:

1. Risk: accidental regression into broader trail fetching.
2. Mitigation: treat destination-first loading as a release blocker.

Handoff notes:

1. Do not implement route planning in this track unless it is required for basic browse architecture.

### Track 4: Native iPhone Route Planning And Sharing Parity

Problem statement:

The watch companion has limited value unless the iPhone app can build and own the same planned route concept already shipped on the web.

Technical approach:

1. Clone the web app's ordered-anchor planner natively.
2. Preserve route clear, reverse, remove, share, and GPX export behaviors.
3. Preserve bounded nearby-sector participation and partial hydration behavior.

Dependencies:

1. Track 2.
2. Track 3.

Acceptance criteria:

1. Users can enter and exit planning mode without breaking inspect behavior.
2. Users can add multiple trail sections to an ordered route draft.
3. Users can remove sections and reverse route order.
4. Route state persists locally and can be rehydrated.
5. Route sharing semantics remain compatible with the product model already used on the web.

Definition of Done:

1. Native planning behavior exists.
2. Planner persistence is versioned.
3. Route summaries are visible and stable.
4. GPX export and generic share flow are implemented.

Validation plan:

1. Validate route persistence across app relaunch.
2. Validate stale-anchor handling.
3. Validate that route summaries match fixture expectations.

Risks and mitigations:

1. Risk: planning semantics drift from the web model.
2. Mitigation: route fixtures and parity checks against current behavior.

Handoff notes:

1. Keep "send to watch" as a separate action from generic route share.

### Track 5: WatchConnectivity Route Transfer

Problem statement:

The system needs a reliable route handoff from phone to watch that does not depend solely on both apps being foregrounded.

Technical approach:

1. Activate and manage `WCSession` on iPhone and watch.
2. Use background-capable transfer for core route delivery.
3. Use live messaging only for opportunistic refresh and acknowledgement.
4. Persist received route payloads on the watch side.

Dependencies:

1. Track 2.
2. Track 4.

Acceptance criteria:

1. The phone can send the active route to a paired watch with the watch app installed.
2. The watch can receive and store the route.
3. The phone can show success, pending, and failure states.
4. Transfer remains reliable when the counterpart is not immediately reachable.

Definition of Done:

1. Transfer session lifecycle is implemented on both sides.
2. Error handling exists for pairing, install, and delivery failures.
3. Route acknowledgements are surfaced in the phone UI.

Validation plan:

1. Test paired-watch happy path.
2. Test not-paired and not-installed states.
3. Test background delivery and delayed receipt behavior.

Risks and mitigations:

1. Risk: depending on immediate reachability and producing flaky delivery.
2. Mitigation: make background transfer the default route-delivery path.

Handoff notes:

1. Avoid making the watch regenerate route geometry before it can display a received route.

### Track 6: Apple Watch Route Experience

Problem statement:

Receiving a route is insufficient if the watch experience does not clearly show what was received and how to use it during an outing.

Technical approach:

1. Build a route-available home state.
2. Build a route summary screen.
3. Build a lightweight map or route visualization screen.
4. Build an active-use state that prioritizes quick route context over full planner controls.

Dependencies:

1. Track 5.

Acceptance criteria:

1. The watch clearly indicates when a route is available.
2. The watch can show route name and total distance.
3. The watch can display the received route in a lightweight visual form.
4. The watch can handle stale or missing route data without crashing or confusing the user.

Definition of Done:

1. Route overview and review flows are implemented.
2. Empty, pending, and error states are implemented.
3. The experience is optimized for glanceable use, not route editing.

Validation plan:

1. Validate route receipt to rendered summary.
2. Validate no-route and transfer-pending states.
3. Validate basic active-use flow on real device when possible.

Risks and mitigations:

1. Risk: trying to match phone-level detail on the watch.
2. Mitigation: keep the watch experience intentionally smaller and more legible.

Handoff notes:

1. Do not expand this track into turn-by-turn guidance without a separate scoped decision.

## Suggested Execution Order

Recommended sequence:

1. Phase 0: Repo Bootstrap And Parity Inventory.
2. Phase 1: Apple Project Foundation And Early Xcode Validation.
3. Phase 2: Shared Route Contract And Fixtures.
4. Phase 3: Native iPhone Destination And Trail MVP.
5. Phase 4: Native iPhone Route Planning And Sharing Parity.
6. Phase 5: Apple Watch Route Transfer And Synchronization.
7. Phase 6: Apple Watch Route Experience And Release Alignment.

Parallelization notes:

1. Track 2 may begin once Track 1 establishes repo placement.
2. Track 3 and Track 2 can overlap after bootstrap.
3. Track 5 must not start before the route-transfer contract is defined.
4. Track 6 should not start before route transfer proves stable enough for device testing.

## Dependency Map

| Track | Depends on | Can run in parallel with | Blocking reason |
| --- | --- | --- | --- |
| 1. Monorepo bootstrap | None | None | Establishes structure and build boundaries |
| 2. Route contract and fixtures | 1 | 3, once the fixture strategy is stable | Prevents contract drift |
| 3. iPhone browse MVP | 1 | 2 | Creates the native client baseline |
| 4. iPhone planning parity | 2, 3 | None at first | Requires baseline client and stable route contract |
| 5. Watch route transfer | 2, 4 | Partial overlap with 6 only after contract stabilization | Requires sendable route payloads |
| 6. Watch route experience | 5 | Visual polish can overlap late in 5 | Requires reliable received-route flow |

## Validation Strategy

### Product validation

1. Confirm the native iPhone app preserves destination-first trail loading.
2. Confirm manual destination choice stabilizes route-planning context.
3. Confirm native route plans preserve ordered anchors, reversal, removal, sharing, and GPX export semantics.
4. Confirm sending to Apple Watch is explicit and understandable.
5. Confirm the watch app behaves predictably when no route exists, a route is pending, and a route is available.

### Engineering validation

1. Add fixture-backed route contract tests for canonical and derived payloads.
2. Add unit coverage for native route hydration and stale-anchor handling.
3. Add integration checks for iPhone-to-watch route delivery.
4. Add at least a minimal UI validation plan for the watch empty, received, and active-route states.
5. Keep web validation separate so Apple work does not accidentally weaken the current web quality gate.

### Completion evidence expected per track

1. Buildable Apple targets.
2. Route fixture set checked into the repository.
3. Device or simulator evidence for iPhone browse and planning flows.
4. Device evidence for at least one successful route transfer to Apple Watch.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Treating the Apple app as a thin wrapper over the web UI | Long-term architecture debt and weak watch integration | Commit to native client implementation from the start |
| Contract drift between web and Apple planning behavior | Shared links and route semantics diverge | Versioned contract plus shared fixtures |
| Reintroducing unbounded trail loading in native clients | Performance regression | Treat destination-first scope as a hard constraint |
| Over-scoping the watch app | Delivery slows and UX degrades | Keep watch scope to receipt, review, and active-use context |
| CI complexity in a mixed Node and Xcode repo | Slow or flaky validation | Split validation jobs and keep toolchains isolated |

## Open Questions

These questions are not blockers for starting the work, but they should be answered before implementation reaches release readiness.

1. What minimum iOS and watchOS versions should the first native release support?
2. Should the native iPhone app call the existing deployed Next.js API routes directly in production, or should a mobile-specific domain be introduced for cleaner separation?
3. Should the first watch release include route progress metrics beyond a static route overview, or should that wait for a later phase?
4. Should the web route-share format remain the long-term canonical public format, or should it be wrapped in a more explicit cross-platform contract version later?

## Proposed Definition Of Done For The Native Apple Program

The native Apple program is complete for its first scoped release only when:

1. The repo contains a documented Apple subtree with repeatable local setup.
2. The iPhone app can browse destinations and destination-scoped trails as a native clone of the current web behavior.
3. The iPhone app can build, persist, share, and export a planned route as a native clone of the current bounded route concept.
4. The iPhone app can send the active planned route to an installed Apple Watch companion.
5. The watch app can receive and display that route with clear empty, pending, and success states.
6. Route contract fixtures exist and are used to prevent cross-platform drift.
7. Validation evidence exists for iPhone browse, iPhone planning, and watch receipt flows.

## AC, DoD, And Non-goal Coverage Matrix

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| create an iOS app from this project | AC | Met | This document: Refined Problem Statement, Goals, Product Scope, Assignment-Ready Work Breakdown | Covered as a native iPhone client program |
| allow sending planned routes to an apple watch companion app | AC | Met | This document: Goals, Functional Requirements, Track 5, Track 6 | Covered as explicit phone-to-watch route transfer |
| keep the code for the ios + apple watch app in this repo as mono repo setup | AC | Met | This document: Decision Summary, Monorepo Structure, Track 1 | Resolved as same-repo monorepo architecture |
| full specification (no code but full detailed refinement) | DoD | Met | This document in full, plus docs/iOS/README.md | Satisfied by this refinement package rather than implementation |
| keep it in the monorepo, use native apple frameworks, but still keep it simple, use the web app as full example | AC | Met | This document: RFC Gate, Decision Summary, Simplicity Rules, Product Scope | Explicitly resolved as a simple native clone strategy |
| we build a clone, just that we will use mapkit and also allow using the planned routes on the watch | AC | Met | This document: Refined Problem Statement, Decision Summary, Track 3, Track 4, Track 5, Track 6 | Captured as clone-plus-MapKit-plus-watch-route-use |
| Rebuilding the existing web app in SwiftUI before native value is proven. | Non-goal | Met | This document: Non-goals, Decision Summary | Explicitly excluded |
| Full feature parity on day one across web, iPhone, and watch. | Non-goal | Met | This document: Non-goals, Product Scope | Explicitly excluded |
| Offline-first trail sync, offline routing, or a service-worker-equivalent watch sync model. | Non-goal | Met | This document: Non-goals, Out of scope | Explicitly excluded |
| Turn-by-turn navigation, rerouting, or a full workout engine in the first watch release. | Non-goal | Met | This document: Non-goals, Track 6 handoff notes | Explicitly excluded |

## Immediate Next Step Checklist

1. Approve or adjust the monorepo and native-stack decisions in this document.
2. Create the Apple subtree under `apps/ios/` as Track 1.
3. Author the first route contract fixtures before any watch transfer work begins.
4. Treat iPhone planning parity as the gate before investing heavily in the watch UI.