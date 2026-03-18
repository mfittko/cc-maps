# Phase 5: Apple Watch Route Transfer And Synchronization

## 1. Refined problem statement

Phase 5 is the delivery-reliability gate between iPhone route ownership and Apple Watch route use. Phase 4 establishes that the iPhone app can create, persist, rehydrate, share, and export the bounded route model defined by the authoritative Phase 2 contract. Phase 5 must now move that already-owned route from iPhone to Apple Watch through a real transfer path that remains reliable when the two apps are not foregrounded at the same time.

The critical product constraint is strict: the iPhone app remains the source of truth for planned routes on Apple platforms. The watch is a receiving companion, not a route-authoring peer and not an alternate contract owner. The transfer payload must therefore consume the authoritative Phase 2 transfer envelope as defined there, with canonical route identity remaining authoritative and any watch-display convenience data remaining derived and subordinate.

This phase is not about rich watch UI. It is about dependable route delivery, prerequisite clarity, persisted watch receipt, acknowledgement back to the phone, and failure handling that is explicit enough for users and later coding agents to reason about. The implementation target is background-capable `WatchConnectivity` delivery as the default mechanism. Reachability-only live messaging may exist as an optimization or supplementary signal if implementation later proves it useful, but it must not be the only path that makes route delivery work.

The result of this phase should be a real synchronization lane that Phase 6 can build on without inventing local route semantics, without relying on mocked watch data, and without guessing what happened when a send attempt succeeds, stalls, or fails.

## 2. Scope

In scope for this phase:

1. Implement phone-to-watch route delivery using background-capable `WatchConnectivity` transfer as the primary transport.
2. Consume the authoritative Phase 2 route-transfer envelope without redefining canonical route ownership.
3. Gate send-to-watch availability based on pairing state, watch-app installation state, and transfer-session readiness.
4. Expose explicit iPhone delivery states for unavailable, ready, pending, acknowledged, and failed outcomes.
5. Persist the most recently received valid route envelope on watch for continuity across app restarts and delayed phone availability.
6. Send receipt acknowledgement or failure outcome from watch back to iPhone so the iPhone UI can surface final delivery status.
7. Define retry, replacement, and duplicate-transfer handling for repeated sends of the active route.
8. Validate delayed delivery, background delivery, missing-prerequisite scenarios, and contract-validation failures objectively.
9. Produce implementation guidance precise enough that Phase 6 can build watch route states on top of stored real route data.

Clarifying scope constraints:

1. The iPhone app remains the source of truth for active planned routes on Apple platforms.
2. The watch may store the received route envelope for local continuity, but it must not become a route-authoring source.
3. The default transport path must be background-capable rather than foreground reachability dependent.
4. This phase focuses on transfer reliability and state handling, not on rich watch route presentation.
5. This phase must not redefine the Phase 2 route contract, invent a watch-only route schema, or turn `GPX` into the watch-transfer format.

## 3. Explicit deliverables

1. A transfer orchestration layer on iPhone that:
	- reads the active Phase 2 route-transfer envelope from Phase 4 route ownership
	- evaluates send prerequisites before offering transfer
	- starts background-capable watch delivery for the active route
	- records transfer lifecycle state for the UI
2. A clear send-to-watch availability model that distinguishes at minimum:
	- no paired watch
	- paired watch but companion app not installed
	- transfer temporarily unavailable because session activation is not ready yet
	- ready to send
3. A defined transfer identity and replacement policy so repeated sends of the same or updated route do not leave ambiguous watch state.
4. A watch-side receipt pipeline that:
	- validates the received transfer envelope against the authoritative contract version
	- rejects unsupported or malformed payloads
	- persists the most recent valid route envelope locally on watch
	- stores enough metadata to identify when the route was last updated and whether it is usable
5. A watch-to-phone acknowledgement path that reports at minimum:
	- receipt accepted and persisted
	- receipt rejected because the payload is invalid or unsupported
	- receipt could not be persisted locally
6. An iPhone delivery-state model that can surface at minimum:
	- unavailable with prerequisite reason
	- ready
	- send initiated
	- pending watch receipt acknowledgement
	- acknowledged success
	- failed with actionable reason when known
7. Retry rules and replacement semantics covering:
	- resend of the same active route after failure or timeout
	- resend of an updated active route that should replace the previous watch route
	- duplicate or out-of-order acknowledgements
8. Objective validation scenarios and documented completion evidence covering prerequisite gating, delayed delivery, watch persistence, acknowledgement, timeout, and failure paths.

## 4. Detailed workstreams

### 4.1 Send-to-watch prerequisites and availability gating

The iPhone app must not expose send-to-watch as a vague best-effort action. It must determine whether transfer is possible and explain when it is not.

Required availability checks:

1. Confirm whether a compatible Apple Watch is paired to the iPhone.
2. Confirm whether the watch companion app is installed on the paired watch.
3. Confirm whether the local `WatchConnectivity` session is activated enough to queue a background-capable transfer.
4. Confirm whether there is an active route on iPhone that is eligible for transfer.
5. Confirm whether the active route can be serialized as the authoritative Phase 2 transfer envelope without contract-validation failure.

Required iPhone UI availability states:

1. `unavailable-no-paired-watch`: no paired watch is available.
2. `unavailable-watch-app-missing`: a watch is paired, but the companion app is not installed.
3. `unavailable-no-active-route`: no valid active route exists to send.
4. `temporarily-unavailable-session-not-ready`: the watch session is not yet activated enough to queue transfer.
5. `ready`: prerequisites are satisfied and the active route can be sent.

Availability rules:

1. The iPhone app should only offer send-to-watch when prerequisites are satisfied or clearly explain why it is unavailable.
2. Availability messaging must distinguish pairing problems from watch-app-install problems.
3. Availability messaging must distinguish prerequisite absence from a transient transport-readiness delay.
4. The send action must be disabled when the active route is structurally empty or fails contract validation.
5. If the active route is partially hydrated on iPhone, Phase 4 rules still apply: the route may only be sent if the iPhone surface treats that partial state as the current accepted route and the payload reflects exactly that accepted state.

### 4.2 Transfer mechanism, payload authority, and send lifecycle

This phase must treat background-capable `WatchConnectivity` transfer as the default delivery mechanism.

Transport rules:

1. Core route delivery must not depend solely on both apps being foregrounded at the same time.
2. Background-capable queued transfer is the default path for route delivery.
3. Reachability-only interactive messaging must not be the sole transport path.
4. If live messaging is later added, it may supplement status freshness but must not replace queued transfer for correctness.

Payload rules:

1. The transfer payload must use the authoritative Phase 2 route-transfer envelope.
2. Canonical route identity remains authoritative within that envelope.
3. Derived watch-display data remains optional and non-authoritative.
4. Unsupported future contract versions must be rejected rather than guessed.
5. `GPX` is export-only and must not be used as the transfer payload.

Required send lifecycle on iPhone:

1. The send action reads the current active route owned by iPhone.
2. The app serializes one transfer envelope from that active route.
3. The app generates or records a transfer instance identifier and created-at timestamp for lifecycle tracking.
4. The app queues the transfer through the background-capable watch delivery path.
5. The app records the route-transfer lifecycle state as `send-initiated` and then `pending-acknowledgement` once queued successfully.
6. The app keeps the pending state until a watch acknowledgement or a terminal failure or timeout is observed.

Replacement rules:

1. The iPhone is the source of truth, so a newly sent active route replaces the prior watch route once the watch accepts and persists it.
2. The transfer identity must let the phone and watch distinguish a resend of the same route from a newer route revision.
3. The watch must treat the most recently accepted transfer from iPhone as the active watch route.
4. This phase does not require multi-route history on watch unless later approved separately.

### 4.3 Watch receipt, validation, and persistence expectations

The watch must be able to receive the route, validate it, store it, and expose whether the stored route is usable even when the phone app is no longer open.

Required watch receipt behavior:

1. The watch app can receive and store the route.
2. The watch validates the incoming envelope version and required fields before marking receipt as successful.
3. The watch rejects malformed payloads, unsupported versions, and payloads that fail local persistence.
4. The watch must not mutate canonical route identity locally.
5. The watch must not attempt to author or repair canonical route state.

Required watch persistence behavior:

1. The watch must persist the most recently accepted route envelope locally.
2. The persisted record must survive app restart and delayed iPhone availability.
3. The watch must persist receipt metadata sufficient to identify:
	- the transfer instance or route revision it accepted
	- when the route was last updated
	- whether the last receipt was valid and usable
4. The watch must only expose a route as available after the envelope has been persisted successfully.
5. If persistence fails after receipt, the watch must report failure rather than pretend the route is ready.
6. The watch may discard older superseded route payloads once the newest accepted route is stored.

Contract-boundary rules:

1. The watch may persist the received route envelope for display continuity, but the watch is not an authoritative route owner.
2. The watch must treat canonical data as inherited identity from iPhone.
3. Any display-oriented derived payload on watch remains subordinate to the canonical route identity that came from iPhone.

### 4.4 Acknowledgement and iPhone delivery-state feedback

This phase is not complete if the phone can only fire-and-forget a transfer. The user needs feedback that distinguishes queued delivery from actual watch acceptance.

Required acknowledgement behavior:

1. The watch must send an acknowledgement outcome back to the iPhone after attempting receipt processing.
2. A successful acknowledgement must mean the watch accepted the payload and persisted it locally.
3. A failed acknowledgement must include a reason category when available.
4. The acknowledgement must identify which transfer instance or route revision it refers to.
5. The iPhone must ignore stale acknowledgements for older superseded transfers.

Required acknowledgement result categories:

1. `acknowledged-success`: route accepted and persisted on watch.
2. `acknowledged-rejected-invalid-payload`: payload rejected because it is malformed or unsupported.
3. `acknowledged-persistence-failure`: payload was received but could not be stored locally on watch.
4. `acknowledged-replaced-by-newer-transfer`: optional internal category if needed to explain superseded pending work without showing false failure.

Required iPhone UI delivery states:

1. `success`: watch accepted and persisted the route.
2. `pending`: transfer was queued or initiated but final watch acknowledgement has not yet been observed.
3. `failure`: transfer could not be queued, was rejected on watch, timed out waiting for acknowledgement, or otherwise ended without a confirmed watch-stored route.

Expanded iPhone state expectations:

1. The iPhone UI can surface success, pending, and failure states.
2. Pending must be used for queued background delivery and delayed acknowledgement scenarios rather than shown as immediate failure.
3. Failure messaging should distinguish as much as possible between prerequisite failure, queue or send failure, watch rejection, persistence failure, and acknowledgement timeout.
4. Success must only be shown after confirmed watch acceptance and persistence, not immediately after enqueueing the transfer.

### 4.5 Retry, timeout, and failure-handling rules

The transfer model must be resilient without inventing hidden sync loops or pretending that every queued transfer will resolve instantly.

Required retry behavior:

1. Users must be able to retry a failed or timed-out send from iPhone without rebuilding the route.
2. Retrying the same active route should create a new transfer attempt that supersedes the previous unresolved attempt for UI purposes.
3. Retrying an updated active route should treat the newer route revision as authoritative and supersede any older pending transfer.
4. Automatic blind retry loops are out of scope unless they are narrowly bounded and explicitly documented.

Required timeout behavior:

1. The iPhone must not remain in indefinite pending state without user-visible explanation.
2. If watch acknowledgement is not received within the defined product timeout window, the send attempt must move to a timeout failure state while still allowing later stale acknowledgement handling.
3. A late acknowledgement for a still-relevant transfer may update state to success if the attempt has not been superseded; otherwise it must be ignored or logged as stale.

Required failure categories to handle explicitly:

1. Missing paired watch.
2. Missing installed watch companion app.
3. No active route to send.
4. Local contract-serialization or validation failure on iPhone.
5. Failure to queue the background transfer.
6. Watch-side payload rejection.
7. Watch-side persistence failure.
8. Acknowledgement timeout.

Failure-handling rules:

1. Delivery behavior is robust to non-reachable but valid paired-device scenarios.
2. Non-reachability alone must not be treated as a send blocker when background-capable transfer prerequisites are otherwise satisfied.
3. The user must be told whether the route is still pending on watch or whether the app considers the attempt failed.
4. The watch must not expose partially processed route data as ready if validation or persistence fails.

### 4.6 Phase boundary with watch UX and downstream work

Phase 5 must leave the system ready for Phase 6 without dragging rich watch UI into this phase.

Required Phase 5 output for Phase 6:

1. The watch has a persisted real route envelope when transfer succeeds.
2. The watch has enough persisted metadata to determine whether a route is absent, pending replacement, or available.
3. The iPhone has explicit delivery-state records suitable for user feedback and troubleshooting.
4. Route ownership and transfer semantics are specific enough that Phase 6 can build display states without redefining sync rules.

Explicit Phase 5 limits:

1. This phase does not require a rich watch summary screen beyond what is necessary to prove receipt and stored-route availability.
2. This phase does not require planner controls on watch.
3. This phase does not require turn-by-turn navigation, workout integration, or offline-first sync guarantees.

## 5. Acceptance criteria

1. The iPhone app can send the active planned route to an installed companion watch app using background-capable `WatchConnectivity` delivery as the default transport path.
2. The iPhone app should only offer send-to-watch when prerequisites are satisfied or clearly explain why it is unavailable.
3. Transfer availability distinguishes at minimum no paired watch, missing watch-app install, no active route, temporary session-not-ready state, and ready-to-send state.
4. The transfer payload uses the authoritative Phase 2 route-transfer envelope without redefining canonical route ownership.
5. Core route delivery must not depend solely on both apps being foregrounded at the same time.
6. The watch app can receive and store the route.
7. The watch persists the most recently accepted valid route envelope so it remains available after app restart or delayed phone availability.
8. The watch reports acknowledgement success only after the received route has been validated and persisted locally.
9. The iPhone UI can surface success, pending, and failure states.
10. Pending state covers queued background delivery and delayed acknowledgement scenarios rather than collapsing immediately into failure.
11. Failure handling covers prerequisite failures, queue or send failures, watch-side rejection, watch persistence failure, and acknowledgement timeout.
12. Delivery behavior is robust to non-reachable but valid paired-device scenarios.
13. A newly accepted transfer replaces the prior active watch route rather than creating a competing source of truth.
14. Phase 6 can build watch route presentation on top of stored real transferred data without inventing local route ownership rules.

## 6. Definition of Done

1. The transfer path is real and validated, not mocked.
2. Error states for pairing and install readiness are implemented.
3. The watch experience phase can now render against real transferred data.
4. Added DoD nuance: background-capable transfer is the default path for correctness, and any live-messaging path is supplementary only.
5. Added DoD nuance: the iPhone delivery model distinguishes prerequisite unavailability, pending acknowledgement, confirmed success, and terminal failure.
6. Added DoD nuance: watch receipt is only considered successful after contract validation and local persistence both succeed.
7. Added DoD nuance: resend, timeout, stale-acknowledgement, and supersession behavior are defined well enough that coding agents do not have to invent transfer lifecycle rules during implementation.
8. Added DoD nuance: the authoritative Phase 2 route contract remains unchanged and is referenced directly for payload shape and version handling.
9. Added DoD nuance: Phase 5 remains narrowly focused on transfer reliability and state handling rather than expanding into rich watch UI.

## 7. Validation plan

### 7.1 Prerequisite and availability validation

1. Validate missing-pairing behavior.
2. Validate missing-watch-app behavior.
3. Validate no-active-route behavior.
4. Validate temporary session-not-ready behavior.
5. Validate that the send affordance is enabled only in the ready state and otherwise explains why transfer is unavailable.

### 7.2 Happy-path and delayed-delivery validation

1. Validate the happy path on simulator or paired hardware as available.
2. Validate that a route can be queued from iPhone when the watch app is not simultaneously foregrounded.
3. Validate delayed or background receipt behavior.
4. Validate that the iPhone enters pending state after transfer initiation and only transitions to success after watch acknowledgement.
5. Validate that a successfully acknowledged route becomes the active persisted route on watch.

### 7.3 Watch receipt, persistence, and replacement validation

1. Validate that the watch app can receive and store the route.
2. Validate that the watch still exposes the stored route after watch app restart.
3. Validate that sending an updated route replaces the previously stored active route on watch.
4. Validate that duplicate or stale acknowledgements do not overwrite the state of newer transfers on iPhone.

### 7.4 Failure and timeout validation

1. Validate local iPhone failure when the transfer envelope cannot be produced from the active route.
2. Validate watch-side rejection for malformed or unsupported payload versions.
3. Validate watch-side persistence failure handling if local storage fails.
4. Validate acknowledgement-timeout behavior and retry affordance.
5. Validate that a non-reachable but otherwise valid paired-device scenario remains pending-capable rather than failing immediately for lack of foreground reachability.

### 7.5 Contract and evidence validation

1. Validate that received route payloads match the documented contract.
2. Validate that the Phase 2 route-transfer envelope is referenced without local schema drift.
3. Validate that completion evidence includes:
	- prerequisite-state coverage
	- happy-path transfer coverage
	- delayed or background delivery coverage
	- watch persistence coverage
	- acknowledgement and timeout coverage
	- replacement and retry coverage

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Relying on reachability-only live messaging creates a fragile experience. | Route delivery works only when both apps are foregrounded and connected at the same moment. | Treat background-capable transfer as the default mechanism. |
| Send availability is vague or misleading. | Users cannot tell whether they need to pair a watch, install the app, or simply wait for readiness. | Model prerequisite states explicitly and surface distinct unavailability reasons in the iPhone UI. |
| The watch accepts a payload before it is actually stored. | The iPhone may show false success while the watch has no durable route available. | Require acknowledgement success only after watch validation and local persistence succeed. |
| Retry and replacement semantics are undefined. | Repeated sends can leave ambiguous active-route state or stale acknowledgements that overwrite newer results. | Track transfer identity or route revision explicitly and define supersession rules. |
| The watch becomes an alternate route authority. | Route ownership drifts between phone and watch, breaking parity and later sync behavior. | Keep the iPhone as source of truth and treat watch persistence as cached received state only. |
| Phase 5 expands into watch UI design. | Delivery reliability work gets diluted and Phase 6 loses a clean handoff boundary. | Keep this phase centered on transport, persistence, acknowledgement, and error handling only. |

## 9. Non-goals / out of scope

1. Rich watch route UI.
2. Turn-by-turn guidance.
3. Planner controls on watch.
4. Making the watch a route-authoring source.
5. Replacing the Phase 2 transfer envelope with a watch-only payload contract.
6. Using `GPX` export as the watch-transfer mechanism.
7. Offline-first sync guarantees or multi-device cloud route sync.

## 10. Handoff notes for coding agent

1. Treat Phase 2 as authoritative for payload shape, versioning, and canonical-versus-derived ownership. Do not redefine the route contract inside the Apple targets.
2. Treat Phase 4 as the route-ownership prerequisite. The iPhone-side sender should read the current active planned route from the Phase 4 ownership and hydration layer rather than reconstructing route state ad hoc inside watch-transfer code.
3. Implement background-capable `WatchConnectivity` transfer as the correctness path first. Do not start with reachability-only live messaging and attempt to patch reliability later.
4. Build a transfer-state model before wiring UI text so state transitions remain objective: unavailable reason, ready, send initiated, pending acknowledgement, success, failure.
5. Ensure acknowledgement semantics are strict: success means the watch validated and persisted the route, not merely that a message arrived.
6. Persist enough metadata on both sides to correlate retries, superseded transfers, and stale acknowledgements.
7. Keep the watch-side persistence intentionally small: one active accepted route envelope plus the metadata required for receipt status and replacement logic is sufficient unless later scope expands.
8. If implementation reveals `WatchConnectivity` platform limits that materially change transport guarantees, document the exact limit and update this phase doc rather than silently weakening the acceptance criteria.
9. Keep user-facing copy specific. Pairing problems, install problems, pending background delivery, and watch-side failure should not all collapse into one generic error string.
10. Do not pull Phase 6 UI scope into this work except for the minimum proof that the watch can identify whether a stored route is available.

## 11. AC/DoD/Non-goal coverage table using exact current phase wording where possible

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| The iPhone app can send the active planned route to an installed companion watch app. | AC | Met | Sections 3, 4.2, 5, 7.2 | Retained and tightened to background-capable delivery. |
| The watch app can receive and store the route. | AC | Met | Sections 3, 4.3, 5, 7.3 | Now includes validation and persistence expectations. |
| The iPhone UI can surface success, pending, and failure states. | AC | Met | Sections 3, 4.4, 5, 7.2, 7.4 | Pending is defined as queued or awaiting acknowledgement. |
| Delivery behavior is robust to non-reachable but valid paired-device scenarios. | AC | Met | Sections 4.2, 4.5, 5, 7.4 | Reachability-only delivery is explicitly rejected. |
| The transfer path is real and validated, not mocked. | DoD | Met | Sections 6, 7.2, 7.5 | Completion evidence requires real transfer validation. |
| Error states for pairing and install readiness are implemented. | DoD | Met | Sections 3, 4.1, 6, 7.1 | Pairing and install are separated explicitly. |
| The watch experience phase can now render against real transferred data. | DoD | Met | Sections 4.6, 6, 7.2, 7.3 | Phase 6 dependency is explicit. |
| Rich watch route UI. | Non-goal | Met | Sections 1, 4.6, 9 | Phase remains transfer-focused. |
| Turn-by-turn guidance. | Non-goal | Met | Sections 4.6, 9 | Still out of scope. |
| Planner controls on watch. | Non-goal | Met | Sections 4.6, 9 | Still out of scope. |
| The iPhone app should only offer send-to-watch when prerequisites are satisfied or clearly explain why it is unavailable. | AC | Met | Sections 4.1, 5, 7.1 | Promoted from required synchronization behavior into explicit AC. |
| Core route delivery must not depend solely on both apps being foregrounded at the same time. | AC | Met | Sections 1, 4.2, 5, 7.2 | Background-capable transfer is the default path. |
| The watch must be able to show that a route has been received, even if the iPhone app is no longer open. | AC | Met | Sections 4.3, 4.6, 5, 7.3 | Satisfied via persisted watch route envelope. |
| Added DoD nuance: background-capable transfer is the default path for correctness, and any live-messaging path is supplementary only. | DoD | Met | Sections 1, 4.2, 6 | Added to remove ambiguity. |
| Added DoD nuance: the iPhone delivery model distinguishes prerequisite unavailability, pending acknowledgement, confirmed success, and terminal failure. | DoD | Met | Sections 3, 4.1, 4.4, 6 | Added to make UI-state implementation objective. |
| Added DoD nuance: watch receipt is only considered successful after contract validation and local persistence both succeed. | DoD | Met | Sections 4.3, 4.4, 6 | Added to prevent false success. |
| Added DoD nuance: resend, timeout, stale-acknowledgement, and supersession behavior are defined well enough that coding agents do not have to invent transfer lifecycle rules during implementation. | DoD | Met | Sections 4.5, 6, 7.4 | Added for implementation readiness. |
| Added DoD nuance: the authoritative Phase 2 route contract remains unchanged and is referenced directly for payload shape and version handling. | DoD | Met | Sections 1, 4.2, 6, 10 | Added to preserve contract authority. |
| Added DoD nuance: Phase 5 remains narrowly focused on transfer reliability and state handling rather than expanding into rich watch UI. | DoD | Met | Sections 1, 4.6, 6, 9 | Added to keep scope clean. |
| Making the watch a route-authoring source. | Non-goal | Met | Sections 1, 2, 4.3, 9 | Added from the stated source-of-truth model. |
| Replacing the Phase 2 transfer envelope with a watch-only payload contract. | Non-goal | Met | Sections 1, 2, 4.2, 9 | Added from the authoritative-contract requirement. |
| Using `GPX` export as the watch-transfer mechanism. | Non-goal | Met | Sections 2, 4.2, 9 | Added to preserve export-versus-transfer boundary. |
| Offline-first sync guarantees or multi-device cloud route sync. | Non-goal | Met | Sections 4.6, 9 | Added to keep reliability scope bounded. |

## 12. Decision log

| Assumption or question | Resolution | Rationale |
| --- | --- | --- |
| Should Phase 5 use reachability-only live messaging as the main phone-to-watch path? | No. Background-capable `WatchConnectivity` transfer is the default transport. | The phase must support delayed receipt and non-simultaneous foreground use. |
| Is the watch allowed to become a source of truth for planned routes? | No. The iPhone remains the source of truth for active planned routes on Apple platforms. | This preserves contract ownership, editing authority, and parity with the Phase 4 planner. |
| What route payload is authoritative for watch transfer? | The authoritative Phase 2 route-transfer envelope. | The task explicitly requires Phase 2 to be treated as authoritative. |
| Does a queued transfer count as success? | No. Success requires watch acknowledgement after validation and persistence. | Users need confirmation that the route is actually available on watch. |
| What must the watch persist? | The most recently accepted valid route envelope plus minimal receipt metadata. | Phase 6 needs durable real route data without introducing watch-side route authorship. |
| How should the product behave when the watch is paired but not currently reachable? | Keep transfer eligible if other prerequisites are satisfied and move through pending background delivery. | Non-reachability alone is not a valid reason to block background-capable transfer. |
| How should repeated sends behave? | Newer sends supersede older pending attempts and the newest accepted route replaces the previous active watch route. | This avoids ambiguous state and keeps the phone authoritative. |
| Does Phase 5 include a rich watch review experience? | No. Phase 5 proves transfer reliability and stored-route availability only; richer watch experience belongs to Phase 6. | The task explicitly says to keep this phase focused on delivery reliability. |