# Phase 0: Repo Bootstrap And Parity Inventory

## Refined problem statement

Bootstrap the native Apple work inside this repository before heavy native implementation begins, and produce the planning artifacts needed to keep the iPhone app a simple clone of the current web app rather than a redesign.

This phase is repo-centric and documentation-heavy by design. It exists to remove ambiguity before Phase 1 and Phase 2 start, not to create Apple targets or write Swift. The output of this phase must tell later coding agents:

1. Where Apple work belongs in the monorepo.
2. Which shipped web behaviors are mandatory for native v1, which may simplify, and which remain deferred.
3. Where the cross-platform route-contract and fixture work will live.
4. Which later phase owns each major behavior.
5. Which decisions are already closed so later phases do not reopen product shape or architecture unnecessarily.

KISS execution rule for this phase: keep it as a single documentation issue. The work is tightly coupled, produces one refinement package, and should not be split into child issues unless a later reviewer explicitly re-scopes the docs package itself.

## Scope

1. Define the monorepo structure for Apple work without creating Apple targets yet.
2. Define the native clone strategy and parity target list using the shipped web behavior as the reference.
3. Reserve the route-contract work area and fixture locations for Phase 2.
4. Define phase sequencing, downstream dependencies, and ownership boundaries.
5. Update the documentation tree so the Apple work is navigable and assignment-ready.
6. Define the parity inventory methodology so later phases classify behavior consistently instead of informally.

## Explicit deliverables

1. `docs/iOS/README.md` as the Apple package entry point.
2. `docs/iOS/spec.md` as the full cross-phase specification.
3. `docs/iOS/PLAN.md` as the top-level Apple phase summary.
4. `docs/iOS/plan/` phase documents with Phase 0 refined enough to assign Phase 1 and Phase 2 without reopening architecture.
5. A documented monorepo layout decision with these reserved paths:
	- `apps/ios/` for the future Xcode project, iPhone target, and watch target.
	- `docs/iOS/` for Apple product and engineering docs.
	- `contracts/route-plan/` for route schema notes, contract examples, and platform-neutral payload definitions.
	- `tests/fixtures/route-plan/` for fixture payloads consumed by later validation.
6. A parity inventory artifact in this phase doc or a linked Apple spec section that classifies shipped web behavior into required, simplifiable, and deferred buckets.
7. A phase ownership map that assigns the first responsible phase for each major Apple work area.

The canonical parity inventory and phase ownership map for this phase live in `docs/iOS/spec.md`.

## Detailed workstreams

### 1. Repo structure decision and boundaries

1. Decide and document that the current Next.js app stays at repository root for now.
2. Decide and document that Apple implementation work will live under `apps/ios/` once Phase 1 starts.
3. Decide and document that cross-platform sharing is limited to contracts, fixtures, and specs rather than shared UI code.
4. State explicitly that native Apple code must not be added under `pages/`, `components/`, `hooks/`, or `lib/` unless a later RFC changes repository structure.
5. Record that Phase 0 reserves paths and ownership only; actual Apple target creation is Phase 1 work.

Creates downstream dependencies:

1. Phase 1 depends on the `apps/ios/` placement decision.
2. Phase 2 depends on the `contracts/route-plan/` and `tests/fixtures/route-plan/` placement decision.

### 2. Parity inventory methodology and behavior classification

Use these source references as the parity baseline:

1. `README.md`
2. `docs/spec.md`
3. `docs/plan/phase-7.md`

The parity inventory must classify each behavior with four fields:

1. Behavior name.
2. Native v1 bucket: required, allowed to simplify, or deferred.
3. Behavioral reference source.
4. First responsible Apple phase.

The phase field identifies the first responsible Apple phase, not the only later phase that may depend on contract, persistence, or transfer work defined earlier in the plan.

At minimum, the inventory must explicitly classify these shipped web behaviors:

1. Destination-first loading flow.
2. Destination selection and stable manual-selection behavior.
3. Destination-scoped trail loading.
4. Nearby destination suggestions and bounded preview-sector participation.
5. Trail inspection and trail detail summaries.
6. Inspect-first behavior outside planning mode.
7. Ordered-anchor route planning.
8. Route persistence across reload or relaunch.
9. Shareable route state or URL semantics.
10. GPX export.
11. Route-aware trail details outside planning mode.
12. Planned-route send-to-watch action.

The inventory must preserve these bucket decisions.

#### Required for native v1

1. Destination-first loading flow.
2. Destination selection and stable manual-selection behavior.
3. Destination-scoped trail loading.
4. Trail inspection and trail detail summaries.
5. Inspect-first behavior outside planning mode.
6. Ordered-anchor route planning.
7. Route persistence, share semantics, and GPX export.
8. Route-aware detail summaries for segments that belong to the active planned route.
9. Planned-route send-to-watch action.

#### Allowed to simplify for native v1

1. Visual styling differences caused by MapKit replacing Mapbox GL JS.
2. Small layout differences caused by SwiftUI control patterns.
3. Watch-specific reduction of route detail density.
4. Native adaptation of share surfaces so long as share, export, and send-to-watch remain distinct actions.

#### Deferred from native v1 unless later promoted

1. Any major new workflow not already present on the web.
2. Offline-first sync and offline route packages.
3. Turn-by-turn navigation or workout-engine features.
4. Public saved-route catalogs or user accounts.

Creates downstream dependencies:

1. Phase 3 depends on the browse-and-inspect parity rows.
2. Phase 4 depends on the planning, persistence, share, GPX, and route-aware details rows.
3. Phase 5 and Phase 6 depend on the send-to-watch and watch-scope rows.

### 3. Route-contract work area reservation

1. Reserve `contracts/route-plan/` for route contract notes, versioning rules, and payload examples.
2. Reserve `tests/fixtures/route-plan/` for canonical and derived route payload fixtures.
3. State that Phase 0 does not finalize payload fields beyond defining the work area and ownership boundary.
4. State that Phase 2 owns payload versioning, fixture scenarios, hydration rules, and stale-anchor handling.
5. State that GPX remains an export format and not the canonical sync format.

Creates downstream dependencies:

1. Phase 2 uses the reserved directories and ownership boundary.
2. Phase 4 and Phase 5 consume the Phase 2 contract rather than inventing local payload shapes.

### 4. Documentation alignment and phase sequencing

1. Align `docs/iOS/README.md`, `docs/iOS/spec.md`, `docs/iOS/PLAN.md`, and `docs/iOS/plan/` on the same monorepo decision, native stack, and clone strategy.
2. State consistently that the web app is the behavioral reference for native parity.
3. State consistently that the watch is a planned-route companion and not a route-authoring surface.
4. State consistently that destination-first loading remains the performance boundary and that unbounded trail loading is not part of the intended Apple flow.
5. Treat `docs/iOS/spec.md` as the canonical home of the parity inventory and phase ownership map.
6. Confirm the downstream phase order:
	- Phase 1 creates the Apple subtree and validates Xcode viability.
	- Phase 2 defines the shared route contract and fixtures.
	- Phase 3 delivers iPhone destination and trail parity.
	- Phase 4 delivers iPhone planning, sharing, and GPX parity.
	- Phase 5 delivers phone-to-watch route transfer.
	- Phase 6 delivers the watch route experience.

Creates downstream dependencies:

1. Phase 1 must not reopen stack or repo placement.
2. Phase 2 must not reopen whether contracts live in repo or how fixtures are shared.
3. Phases 3 through 6 must treat the documented parity inventory as the default product boundary.

## Acceptance criteria

1. The Apple work has a documented home in the repository, including explicit reserved paths for Apple code, Apple docs, route contracts, and route fixtures.
2. The native program has a defined phase sequence, and each later phase has a one-sentence ownership boundary that matches the Apple plan documents.
3. The native clone strategy is explicit and leaves little room for redesign drift by stating that the shipped web app is the behavioral reference and that Apple work shares contracts and fixtures, not UI code.
4. The parity inventory clearly identifies required, simplifiable, and deferred behaviors, and each listed behavior includes a source reference and first responsible Apple phase.
5. The route-contract work area is reserved for the next phase with concrete repo paths and a statement that Phase 2 owns the actual contract and fixture definitions.
6. Documentation alignment is complete across the Apple docs package: no conflicting statements remain about monorepo placement, native stack, behavioral reference, watch role, or destination-first loading constraints.

## Definition of Done

1. The documentation package is complete enough that implementation can be assigned without revisiting high-level architecture questions.
2. The repo structure for future Apple work is specified.
3. The next phase can begin with minimal ambiguity.
4. Proposed DoD nuance: the parity inventory and repo layout decisions are specific enough that Phase 1 and Phase 2 can start without asking where code, contracts, or fixtures belong, or which shipped web behaviors are required for native v1.

## Validation plan

1. Review the phase docs for internal consistency.
2. Confirm that the same-repo monorepo decision is reflected everywhere.
3. Confirm that the spec consistently treats the web app as the behavioral reference.
4. Confirm that the watch is described as a planned-route companion rather than a primary planner.
5. Confirm that `docs/iOS/README.md`, `docs/iOS/spec.md`, `docs/iOS/PLAN.md`, and `docs/iOS/plan/README.md` all agree on:
	- `apps/ios/` as the future Apple subtree.
	- `contracts/route-plan/` as the future route-contract area.
	- `tests/fixtures/route-plan/` as the future fixture area.
	- Swift, SwiftUI, MapKit, and WatchConnectivity as the Apple stack.
6. Verify that the parity inventory covers the shipped web behaviors called out in `README.md`, `docs/spec.md`, and `docs/plan/phase-7.md`, including nearby preview-sector participation, inspect-first behavior, route persistence, sharing semantics, GPX export, and route-aware detail summaries.
7. Verify that no Phase 0 deliverable requires Xcode, simulator execution, or Swift code to consider the phase complete.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Too much room for product redesign before native work starts. | Later phases drift away from shipped web behavior and become harder to review for parity. | Make the clone strategy, parity inventory, and behavior ownership explicit in Phase 0. |
| Repo placement remains vague. | Phase 1 and Phase 2 create ad hoc directories or duplicate contract artifacts. | Reserve exact repo paths in Phase 0 and state which later phase creates them physically. |
| Route contract ownership is unclear. | iPhone and watch work invent incompatible payload assumptions. | Reserve one contract area and one fixture area, then assign Phase 2 as the owner. |
| Watch scope expands too early. | Native effort turns into a second planner instead of a companion. | Keep watch language constrained to route receipt, review, and active-use context. |
| Platform substitution is mistaken for product redesign. | MapKit or SwiftUI differences are used to justify unnecessary behavior drift. | Allow visual and layout simplifications only where the product intent remains intact. |

## Non-goals / out of scope

1. Creating Apple targets.
2. Writing Swift code.
3. Validating MapKit or WatchConnectivity behavior in Xcode.
4. Defining the full route payload schema or fixture set; that belongs to Phase 2.
5. Moving the existing web app out of repository root as part of this phase.

## Handoff notes for coding agent

1. Treat the current web docs as the behavior source of truth for parity decisions: `README.md`, `docs/spec.md`, and `docs/plan/phase-7.md`.
2. Preserve the destination-first loading model as a hard product and performance boundary. Do not let native planning or watch work reopen unbounded trail loading.
3. Keep Sporet access centralized through the existing Next.js API routes unless a later RFC changes backend ownership.
4. Share contracts and fixtures across platforms, not UI code.
5. Keep the watch app constrained to route receipt and route use. Do not introduce watch-side route authoring in later phases unless scope changes explicitly.
6. If a later implementation task encounters a behavior that is not classified in the parity inventory, default to deferred until the Apple docs are updated.
7. Phase 1 should create `apps/ios/` and Xcode targets. Phase 2 should create `contracts/route-plan/` and `tests/fixtures/route-plan/` artifacts if they do not already exist.

## AC/DoD/Non-goal coverage table

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| The Apple work has a documented home in the repository. | AC | Met | Refined problem statement, Explicit deliverables, Acceptance criteria | Expanded into exact reserved repo paths |
| The native program has a defined phase sequence. | AC | Met | Detailed workstreams, Acceptance criteria | Includes downstream ownership boundaries |
| The native clone strategy is explicit and leaves little room for redesign drift. | AC | Met | Refined problem statement, Detailed workstreams, Handoff notes for coding agent | Uses the web app as the behavioral reference |
| The parity inventory clearly identifies required, simplifiable, and deferred behaviors. | AC | Met | Detailed workstreams: Parity inventory methodology and behavior classification | Inventory method is now objective and phase-owned |
| The route-contract work area is reserved for the next phase. | AC | Met | Explicit deliverables, Detailed workstreams: Route-contract work area reservation | Concrete reserved paths added |
| The documentation package is complete enough that implementation can be assigned without revisiting high-level architecture questions. | DoD | Met | Refined problem statement, Acceptance criteria, Handoff notes for coding agent | Assignment-ready for Phase 1 and Phase 2 |
| The repo structure for future Apple work is specified. | DoD | Met | Explicit deliverables, Detailed workstreams: Repo structure decision and boundaries | Keeps current web app at repo root for now |
| The next phase can begin with minimal ambiguity. | DoD | Met | Detailed workstreams, Validation plan | Dependencies for Phase 1 and Phase 2 are explicit |
| The parity inventory and repo layout decisions are specific enough that Phase 1 and Phase 2 can start without asking where code, contracts, or fixtures belong, or which shipped web behaviors are required for native v1. | DoD | Met | Definition of Done, Detailed workstreams, Handoff notes for coding agent | Proposed DoD nuance added because the original DoD was too implicit |
| Creating Apple targets. | Non-goal | Met | Non-goals / out of scope | Still deferred to Phase 1 |
| Writing Swift code. | Non-goal | Met | Non-goals / out of scope | Still excluded from Phase 0 |
| Validating MapKit or WatchConnectivity behavior in Xcode. | Non-goal | Met | Non-goals / out of scope, Validation plan | Still excluded from Phase 0 validation |

## Decision log

| Assumption or open point | Resolution | Rationale | Downstream effect |
| --- | --- | --- | --- |
| Should the Apple expansion live in this repository or a separate repo? | Keep it in this repository as a monorepo addition. | Same product, same behavior source, and shared contracts are easier to govern in one repo. | Phase 1 creates `apps/ios/` here rather than standing up a second repository. |
| Should the current web app move under `apps/web/` now? | No. Keep the Next.js app at repository root for this phase. | Phase 0 should reduce ambiguity, not trigger a broader repo migration. | Later phases inherit a simpler starting point and avoid unrelated file movement. |
| How should cross-platform sharing work? | Share specs, contracts, and fixtures only; do not share UI code. | The required stacks are native SwiftUI on Apple and React on the web. | Phase 2 produces neutral contract artifacts rather than cross-platform UI abstractions. |
| What is the behavior source of truth for native parity? | Use `README.md`, `docs/spec.md`, and `docs/plan/phase-7.md` as the baseline. | Those docs define the currently shipped web behavior and route-planning limits. | Later phases must compare native behavior against those references. |
| What exact repo locations should be reserved now? | Reserve `apps/ios/`, `contracts/route-plan/`, and `tests/fixtures/route-plan/`. | Later phases need concrete homes before they start creating targets or fixtures. | Phase 1 owns `apps/ios/`; Phase 2 owns the contract and fixture artifacts. |
| Is the watch a planner or a companion? | The watch is a companion for route receipt and usage, not route authoring. | Keeps the Apple expansion simple and aligned with the requested product model. | Phase 5 and Phase 6 stay route-focused and glanceable. |
| Should Phase 0 be split into multiple sub-issues? | No. Keep it as one refinement issue. | The work is small, tightly coupled, and mostly documentation. | Implementation agents can start from one agreed package instead of stitching partial docs together. |