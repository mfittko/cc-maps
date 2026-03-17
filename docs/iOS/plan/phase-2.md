# Phase 2: Shared Route Contract And Fixtures

## 1. Refined problem statement

The web app already ships a bounded, compact route-plan identity and deterministic route-graph edge identifiers, but that behavior currently lives as implementation detail in web helpers rather than as a cross-platform contract package. Phase 2 exists to turn the shipped web semantics into an explicit, versioned, platform-neutral contract that later iPhone and Apple Watch phases can consume without guessing.

The core refinement constraint is strict: the canonical route payload must remain the authoritative source of truth and must match the current web route-plan identity rather than expanding into a coordinate-heavy or summary-heavy alternative model. The canonical payload is currently the minimal persisted and shared route identity used by the web app:

1. `version`
2. `destinationId`
3. `destinationIds`
4. `anchorEdgeIds`

Everything else needed for review or watch rendering remains derived. That includes traversal geometry, route summary metrics, section summaries, direction features, and any watch-facing convenience payload. Phase 2 must document that separation clearly enough that Phase 4 does not over-persist derived state on iPhone and Phase 5 does not promote watch convenience data into a second source of truth.

This phase is documentation, schema, and fixture work only. It does not implement iPhone planning UI, watch UI, transfer plumbing, or backend expansion. Its purpose is to let later coding agents implement those phases against one stable contract and one stable fixture set while preserving bounded route semantics, deterministic anchor ordering, nearby preview-sector participation, and stale-anchor handling already present in the web app.

KISS execution rule for this phase: keep it as one tightly scoped contract-and-fixtures issue or one pull request if practical. The contract, fixture set, migration notes, and parity evidence are tightly coupled and should not be split unless separate ownership appears later.

## 2. Scope

1. Define the canonical route payload from the current web behavior without expanding its authority beyond the shipped compact identity.
2. Define the derived route payload used for watch display convenience while keeping it explicitly subordinate to the canonical payload.
3. Define one versioned route-transfer envelope that can carry canonical data and optional derived watch data together.
4. Define payload versioning, migration expectations, hydration rules, and stale-anchor behavior.
5. Define storage-format expectations for web parity, iPhone local persistence, and watch persistence.
6. Create fixture payloads for required route scenarios and additional contract-safety scenarios.
7. Document deterministic parity expectations against the current web helpers under `lib/route-plan.js`, `lib/route-graph.js`, `lib/planning-mode.js`, and `lib/route-export.js`.
8. Specify where contract docs, schemas, JSON fixtures, and parity evidence must live in the repository.
9. Update or supersede any Apple-route wording that incorrectly implies that names, summaries, or polylines are canonical.

## 3. Explicit deliverables

1. A platform-neutral contract overview document under `contracts/route-plan/` that defines the route-transfer envelope, canonical payload, derived payload, and contract rules.
2. Versioned schema artifacts under `contracts/route-plan/schema/` for:
	- canonical route payload
	- derived watch payload
	- route-transfer envelope
3. A migration and hydration note under `contracts/route-plan/` that documents:
	- current web URL encoding parity
	- current web local-storage parity
	- legacy version migration expectations
	- stale-anchor semantics
4. JSON fixtures under `tests/fixtures/route-plan/` for every required scenario plus malformed and migration cases needed for contract validation.
5. A parity evidence artifact under `contracts/route-plan/parity.md` or an equivalent route-contract evidence document in the same contract area that maps fixture expectations to current web behavior.
6. A clear statement in the contract docs that `GPX` is export only and is not the canonical sync or storage format.
7. A clear statement in the contract docs that the watch may persist the received transfer envelope for display continuity, but the watch is not an authoritative route owner.
8. Documentation alignment notes for downstream phases so that:
	- Phase 4 consumes the canonical payload for iPhone planning persistence and share parity
	- Phase 5 consumes the transfer envelope for watch delivery
	- Phase 6 consumes the derived watch payload only as a display convenience

Recommended file layout for this phase:

1. `contracts/route-plan/README.md` for the narrative contract definition.
2. `contracts/route-plan/schema/route-plan-canonical.v2.schema.json` for the authoritative canonical shape if the current web route version remains `2`.
3. `contracts/route-plan/schema/route-plan-derived-watch.v2.schema.json` for the derived watch shape tied to the same contract generation.
4. `contracts/route-plan/schema/route-plan-transfer-envelope.v2.schema.json` for the full transfer document.
5. `contracts/route-plan/migrations.md` for legacy version and hydration rules.
6. `contracts/route-plan/parity.md` for evidence that the contract matches current web behavior.
7. `tests/fixtures/route-plan/` for fixture JSON files and invalid-payload cases.

## 4. Detailed workstreams

### 4.1 Canonical payload definition

The canonical payload must preserve the shipped web route identity and nothing more.

Required canonical fields:

1. `version`: integer contract version.
2. `destinationId`: stringified numeric primary destination id.
3. `destinationIds`: ordered array of unique stringified numeric destination ids with the primary destination first.
4. `anchorEdgeIds`: ordered array of stable graph edge ids.

Canonical rules:

1. The canonical payload is authoritative for route identity.
2. The canonical payload must remain compact and identifier-based.
3. The canonical payload must not embed route polyline coordinates, GPX content, traversal segments, direction features, or route summary fields as authoritative state.
4. `destinationIds` must include the primary destination first and may include nearby preview-sector destinations only when the active route actually touches them.
5. `destinationIds` must be normalized to unique numeric-string ids.
6. `anchorEdgeIds` must preserve user-visible order exactly as restored or edited.
7. Empty `anchorEdgeIds` is a valid structural payload but hydrates to an empty route.

Parity baseline from current web helpers:

1. The canonical shape must match the current `RoutePlan` behavior in `lib/route-plan.js`.
2. The current web version is `2`; Phase 2 should preserve that version as the baseline shared canonical contract unless a later explicit migration is approved.
3. The canonical edge-id format derives from `lib/route-graph.js` and remains deterministic coordinate-pair identity, including suffix handling for duplicate endpoint pairs.

### 4.2 Derived watch payload definition

The derived payload exists only to reduce watch-side reconstruction work and support route display before any heavy graph rebuild would be possible or desirable.

Required derived payload capabilities:

1. Carry display-ready route geometry suitable for watch rendering.
2. Carry route summary fields needed for route review.
3. Carry ordered section summaries that match canonical anchor order.
4. Carry enough descriptive data for a watch route summary screen and lightweight map without requiring the watch to rebuild the full route graph.

Required derived payload contents:

1. Display polyline coordinates or equivalent lightweight route geometry for the resolved route.
2. Total distance.
3. Elevation summary when available from the phone-side computation path.
4. Ordered section summaries aligned to canonical anchor order.
5. Optional route label for display convenience.

Derived-payload rules:

1. Derived data must always be traceable to the canonical payload that generated it.
2. Derived data must not become a fallback authoritative route identity.
3. The watch may render from derived data immediately after receipt.
4. The watch must not be required to reconstruct graph traversal before showing a route summary or a lightweight route view.
5. If derived data and canonical data disagree, canonical identity wins and the payload is invalid.
6. Derived geometry must be treated as disposable and regenerable on the phone.

### 4.3 Transfer-envelope and versioning rules

To avoid canonical and derived versions drifting independently, this phase should define one route-transfer envelope with one explicit contract version.

Recommended envelope shape:

1. `version`: contract version for the entire document.
2. `canonical`: authoritative canonical route payload.
3. `derived`: optional derived watch payload generated from that canonical route.

Versioning rules:

1. Every payload must carry an explicit version.
2. The first shared contract generation should map to the current web canonical route-plan version rather than inventing a disconnected Apple-only version.
3. Future incompatible canonical-field changes require a new version and explicit migration notes.
4. Future derived-only additions should remain backward-compatible when possible and must not silently change canonical meaning.
5. Unsupported future versions must be rejected rather than guessed.
6. Legacy web version-1 route-plan payloads remain migration inputs for documentation and fixture purposes because current web helpers already migrate them.

Required versioned parity notes:

1. Current web URL format version 2: `version|destinationId|destinationIds joined by ';'|anchorEdgeIds joined by ','`.
2. Current web legacy URL format version 1: `version|destinationId|anchorEdgeIds joined by ','`.
3. Current web local-storage payload is canonical JSON keyed per destination.
4. Phase 2 does not redefine public GPX format as a route-contract version.

### 4.4 Hydration and stale-anchor behavior

Hydration rules must be documented directly from current web behavior instead of being inferred by future native clients.

Hydration process:

1. Hydrate only canonical `anchorEdgeIds` against a rebuilt route graph.
2. Do not persist or hydrate traversal, connector, or direction data as canonical state.
3. Preserve canonical anchor order in the hydrated valid-anchor list.
4. Separate valid anchors from stale anchors explicitly.
5. Report one of three statuses: `ok`, `partial`, or `empty`.

Hydration status meanings:

1. `ok`: all anchor ids are found in the graph.
2. `partial`: at least one anchor id is valid and at least one is stale.
3. `empty`: no anchors are valid, or the route is structurally empty.

Stale-anchor rules:

1. Partial hydration must preserve valid anchors in original order.
2. Partial hydration must surface stale anchor ids explicitly; it must not silently drop them without warning.
3. Empty hydration caused by all-stale anchors must be distinguishable from a fully valid route.
4. If the route graph is unavailable, anchor ids must be treated as stale for hydration purposes rather than guessed.
5. Hydration output must remain canonical-state-oriented and must not contain derived traversal or connector data.

Caller expectations to document for later phases:

1. iPhone planning persistence may reopen a partial route, but the UI must be able to warn that some sections no longer hydrate.
2. Watch transfer should originate from a phone-side route that has already resolved or intentionally accepted any partial state.
3. Phase 2 should not require the watch to perform stale-anchor recovery logic beyond displaying the received derived route state.

### 4.5 Storage-format expectations

This phase must document storage expectations separately for canonical state, transfer state, and export state.

Web parity baseline:

1. Local persistence stores canonical route JSON only.
2. The storage key format is destination-scoped: `cc-maps:settings:plan:<destinationId>`.
3. Shared URL state stores only the compact canonical encoding.
4. Derived route data is recomputed after hydration and is not persisted as canonical web state.

iPhone expectations:

1. iPhone local persistence must store the canonical payload or a semantically identical native representation of the same four canonical fields.
2. iPhone may cache derived route data for performance, but that cache must be invalidatable and non-authoritative.
3. iPhone sharing parity must continue to support the compact canonical URL model rather than switching to coordinate-heavy sharing.

Watch expectations:

1. The watch may persist the received transfer envelope for display continuity.
2. The watch must treat the `canonical` section as informational identity inherited from the phone, not as a route-authoring source.
3. The watch must not promote `GPX` export data into persistence or sync authority.

### 4.6 Fixture set and parity evidence

The fixture set must do more than provide happy-path examples. It must also protect migration and stale-anchor behavior from drifting.

Required fixture scenarios from the current phase wording:

1. A simple single-destination route with multiple anchors.
2. A route that spans the primary destination and at least one nearby preview sector.
3. A partially stale route plan where some anchor IDs no longer hydrate.
4. A route with derived summary data and polyline coordinates suitable for watch display.

Additional fixture scenarios required for assignment readiness:

1. A legacy version-1 canonical payload that migrates into the current version.
2. An empty-anchor canonical payload that is structurally valid but hydrates to `empty`.
3. An invalid future-version payload that must be rejected.
4. A malformed payload with bad destination ids.
5. A malformed payload with empty anchor entries.
6. A duplicate-destination input case that normalizes to primary-first unique ids.

Parity evidence requirements:

1. Every happy-path fixture must map to the current web route helpers and note which behaviors it exercises.
2. The parity artifact must record the specific current web rules being matched:
	- canonical field set
	- anchor ordering
	- destination-id normalization
	- legacy v1 migration
	- `ok` / `partial` / `empty` hydration semantics
3. The parity artifact must state explicitly that `GPX` is generated from resolved route features and is not the canonical route contract.

## 5. Acceptance criteria

1. The route contract is documented in a platform-neutral format.
2. Fixtures cover the required route scenarios.
3. Partial hydration and stale-anchor handling are explicitly defined.
4. The Apple watch flow has a payload shape that does not require full graph reconstruction before showing a route.
5. The canonical payload is documented as the exact current web route identity: `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds` only.
6. The derived watch payload is documented as non-authoritative and is tied explicitly to the canonical payload it was generated from.
7. Payload versioning, legacy-version migration, and unsupported-version rejection are documented objectively enough for both web and Apple implementations.
8. Storage expectations are documented clearly enough that later phases know what belongs in canonical persistence, transfer persistence, and GPX export only.
9. Contract docs, schemas, JSON fixtures, and parity evidence each have an explicit home in the repository.
10. The parity relationship between current web behavior and the shared contract is specific enough that later phases can detect drift rather than rely on interpretation.

## 6. Definition of Done

1. The route contract is versioned.
2. Fixture coverage is sufficient for iPhone planning and watch transfer work.
3. The parity relationship between current web behavior and the new contract is documented.
4. Added DoD nuance: canonical versus derived ownership is explicit enough that Phase 4 cannot persist watch-convenience fields as canonical route state.
5. Added DoD nuance: hydration and stale-anchor semantics are precise enough that Phase 4 and Phase 5 can implement partial-route behavior without redefining `ok`, `partial`, and `empty` locally.
6. Added DoD nuance: repository placement is explicit enough that future coding agents know where to put contract docs, schemas, fixtures, and parity evidence without inventing parallel artifacts elsewhere.
7. Added DoD nuance: the shared contract remains bounded to existing product behavior and does not introduce backend expansion, offline sync, or coordinate-only route authority.

## 7. Validation plan

### 7.1 Contract and schema review

1. Verify that the canonical schema contains only the four authoritative fields used by current web route persistence and sharing.
2. Verify that the transfer envelope does not redefine canonical authority.
3. Verify that the derived schema can support watch summary and route rendering needs without requiring graph rebuild on watch.
4. Verify that unsupported future versions are documented as reject-only.

### 7.2 Fixture parity review against current web behavior

1. Compare canonical fixture JSON against the current web `createRoutePlan`, URL encode/decode, and hydration behavior in `lib/route-plan.js`.
2. Compare edge-id examples against deterministic edge-id rules in `lib/route-graph.js`.
3. Compare multi-destination fixture behavior against current planning-mode destination participation rules in `lib/planning-mode.js`.
4. Confirm that the canonical fixture order preserves user-visible anchor order exactly.
5. Confirm that the stale-anchor fixture maps cleanly to `partial` hydration rather than implicit dropping.
6. Confirm that the all-stale or empty-anchor fixture maps to `empty` hydration.

### 7.3 Storage and export boundary review

1. Verify that canonical persistence examples never embed derived summary or geometry fields.
2. Verify that watch-persistence examples use the transfer envelope, not GPX.
3. Verify that GPX is documented only as export output generated from resolved route features.

### 7.4 Completion evidence expected from this phase

1. Contract overview document committed under `contracts/route-plan/`.
2. Versioned schemas committed under `contracts/route-plan/schema/`.
3. Fixture JSON committed under `tests/fixtures/route-plan/`.
4. Parity evidence committed under `contracts/route-plan/parity.md` or an equivalent contract-evidence document.
5. Short implementation note or checklist showing which current web behaviors each fixture validates.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The web and Apple clients silently diverge on route identity. | Shared links, persistence, and watch transfer stop meaning the same route. | Use one canonical payload that mirrors current web behavior, plus fixture-backed parity evidence. |
| Derived watch data becomes a second source of truth. | Watch-oriented summaries or geometry start driving route identity and later conflict with canonical state. | Keep derived payload explicitly subordinate to canonical payload and document invalid-state rules when they disagree. |
| A future native implementation stores coordinate-heavy data as canonical state. | Route persistence becomes larger, harder to migrate, and inconsistent with the web share model. | Lock canonical persistence to compact identifiers only and treat geometry as derived. |
| Hydration semantics drift across clients. | Partial or stale routes reopen differently on web, iPhone, and watch. | Document `ok`, `partial`, and `empty` precisely and back them with fixtures. |
| Contract artifacts end up scattered across the repo. | Later teams create duplicate schemas, fixtures, or evidence files. | Specify exact homes under `contracts/route-plan/` and `tests/fixtures/route-plan/` in this phase. |
| Phase 2 expands into backend or offline scope. | The contract phase starts redesigning the product instead of stabilizing current behavior. | Keep Sporet access, product API ownership, and offline exclusions explicit in this phase doc. |

## 9. Non-goals / out of scope

1. iPhone UI implementation.
2. Watch UI implementation.
3. Real device transfer validation.
4. Backend expansion beyond the current app-owned product routes.
5. Offline route sync, offline-first watch behavior, or GPX-based synchronization.
6. Replacing the canonical compact route identity with a coordinate-heavy canonical format.

## 10. Handoff notes for coding agent

1. Treat the current web helpers as the behavioral reference for the contract, not as optional inspiration.
2. Preserve the bounded route model: ordered anchors, primary destination plus only required nearby preview sectors, and no unbounded graph or trail expansion.
3. Keep canonical authority limited to `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds` unless a later RFC explicitly changes route identity.
4. Do not store route summaries, traversal segments, route polylines, or watch convenience fields as canonical persistence.
5. Keep `GPX` separate from route transfer and route persistence. It is export only.
6. Document version migration exactly, including the current legacy web version-1 compatibility path and the current version-2 compact URL form.
7. Document hydration behavior with explicit `ok`, `partial`, and `empty` outcomes, and require stale-anchor visibility instead of silent dropping.
8. Put route-contract narrative docs, schemas, migration notes, and parity evidence under `contracts/route-plan/`.
9. Put route fixture JSON under `tests/fixtures/route-plan/`.
10. If another Apple doc currently implies that route name, route summary, or polyline coordinates are canonical, align it to this phase during implementation rather than preserving the inconsistency.
11. Do not introduce direct Sporet access, new backend surfaces, or offline sync behavior as part of the contract work.
12. Keep the watch payload intentionally sufficient for rendering and review, not for watch-side planning.

## 11. AC/DoD/Non-goal coverage table using exact current phase wording where possible

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| The route contract is documented in a platform-neutral format. | AC | Met | Refined problem statement, Scope, Explicit deliverables, Acceptance criteria, Validation plan | Expanded into contract overview, schemas, migration notes, and parity evidence. |
| Fixtures cover the required route scenarios. | AC | Met | Explicit deliverables, Detailed workstreams: Fixture set and parity evidence, Acceptance criteria | Required fixtures preserved and supplemented with migration and invalid-input cases. |
| Partial hydration and stale-anchor handling are explicitly defined. | AC | Met | Detailed workstreams: Hydration and stale-anchor behavior, Acceptance criteria, Validation plan | Now specifies `ok`, `partial`, and `empty` plus caller expectations. |
| The Apple watch flow has a payload shape that does not require full graph reconstruction before showing a route. | AC | Met | Detailed workstreams: Derived watch payload definition, Transfer-envelope and versioning rules, Acceptance criteria | Keeps watch rendering dependent on derived payload, not watch-side graph rebuild. |
| The route contract is versioned. | DoD | Met | Refined problem statement, Detailed workstreams: Transfer-envelope and versioning rules, Definition of Done | Tied to current web route-plan version baseline and explicit migration notes. |
| Fixture coverage is sufficient for iPhone planning and watch transfer work. | DoD | Met | Explicit deliverables, Detailed workstreams: Fixture set and parity evidence, Validation plan | Covers happy path, multi-destination, partial hydration, migration, and invalid payloads. |
| The parity relationship between current web behavior and the new contract is documented. | DoD | Met | Scope, Explicit deliverables, Detailed workstreams, Validation plan | Requires parity evidence artifact tied to current web helpers. |
| iPhone UI implementation. | Non-goal | Met | Non-goals / out of scope, Handoff notes for coding agent | Still deferred to Phase 4. |
| Watch UI implementation. | Non-goal | Met | Non-goals / out of scope, Handoff notes for coding agent | Still deferred to Phase 5 and Phase 6. |
| Real device transfer validation. | Non-goal | Met | Non-goals / out of scope, Validation plan | Still deferred to later watch-transfer validation work. |

## 12. Decision log

| Assumption or open point | Resolution | Rationale | Downstream effect |
| --- | --- | --- | --- |
| What is authoritative route identity? | Keep the canonical payload identical to the current web route-plan identity: `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds`. | The shipped web app already persists and shares this compact model, and expanding it now would create drift rather than reduce it. | Phase 4 must persist only canonical identifiers; Phase 5 transfers canonical identity plus optional derived watch data. |
| Should route name, summary, or polyline coordinates be canonical? | No. They remain derived. | Current web helpers explicitly recompute derived traversal and summary data after hydration. | Watch convenience data stays subordinate and regenerable. |
| How should versioning work? | Use one explicit version on the route-transfer envelope and preserve the current web canonical version baseline unless a later migration is approved. | Separate canonical and derived versions would create avoidable drift in the first shared contract generation. | Later schema changes stay easier to reason about and validate. |
| How should legacy web payloads be handled? | Document and fixture the existing legacy version-1 migration path into the current canonical shape. | The web app already supports that migration path, so the shared contract should not ignore it. | Later native implementations can reject, migrate, or import old shared links intentionally rather than inconsistently. |
| What should hydration validate? | Validate only canonical `anchorEdgeIds` against the rebuilt graph and return `ok`, `partial`, or `empty`. | This matches current web behavior and avoids persisting traversal or connector state. | Phase 4 and Phase 5 can share stale-anchor semantics without inventing local rules. |
| What is the watch allowed to persist? | The watch may persist the transfer envelope for display continuity, but it is not the source of truth. | The phone owns route planning and transfer, while the watch is a companion surface. | Phase 5 and Phase 6 can implement reliable watch review without promoting watch storage into route ownership. |
| Where should contract artifacts live? | Put narrative docs, schemas, migration notes, and parity evidence under `contracts/route-plan/`; put JSON fixtures under `tests/fixtures/route-plan/`. | Phase 0 already reserved these areas, and central placement prevents duplicate local contract artifacts. | Later coding agents have one obvious home for route-contract work. |
| Does Phase 2 change backend ownership or add offline sync? | No. Keep Sporet access and primary product contract centralized through existing app routes, and do not introduce offline features. | The task is to stabilize route semantics, not redesign transport or persistence scope. | Phases 3 through 6 inherit the existing backend boundary and bounded-product model. |