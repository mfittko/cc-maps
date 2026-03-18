---
description: "Use when working on WatchConnectivity, send-to-watch availability, acknowledgement states, watch persistence, or stale and partial route behavior on Apple Watch. Keeps phone-owned route delivery reliable and bounded."
---
# Watch Transfer Guidance

- The iPhone is the source of truth for planned routes on Apple platforms.
- Background-capable transfer is the default correctness path.
- Reachability-only live messaging is supplementary only.
- The watch may persist the received route envelope for continuity, but it is not a route-authoring source.
- Success means accepted and persisted on watch, not just queued or received.

Review checklist:

- Are prerequisite states explicit: no watch, missing app, no route, session not ready, ready?
- Is pending distinct from success and failure?
- Are retries, timeouts, and stale acknowledgements handled explicitly?
- Does the watch render from transferred real data rather than a locally invented route model?
- Is rich watch UI still deferred to Phase 6?

Read first:

- `docs/iOS/plan/phase-5.md`
- `docs/iOS/plan/phase-6.md`
- `docs/iOS/spec.md`