---
name: watch-transfer
description: 'Use when working on WatchConnectivity, send-to-watch availability, acknowledgement states, watch persistence, or stale and partial route behavior on Apple Watch.'
---

# Watch Transfer

## Purpose

Keep Apple Watch route delivery reliable, phone-owned, and bounded to the refined Phase 5 and Phase 6 model.

## Rules

1. The iPhone is the source of truth for planned routes on Apple platforms.
2. Background-capable transfer is the default correctness path.
3. Reachability-only live messaging is supplementary only.
4. The watch may persist the received route envelope for continuity, but it is not a route-authoring source.
5. Success means accepted and persisted on watch, not just queued or received.

## Review Checklist

1. Are prerequisite states explicit: no watch, missing app, no route, session not ready, ready?
2. Is pending distinct from success and failure?
3. Are retries, timeouts, and stale acknowledgements handled explicitly?
4. Does the watch render from transferred real data rather than a locally invented route model?
5. Is rich watch UI still deferred to Phase 6?

## Read First

1. `docs/iOS/plan/phase-5.md`
2. `docs/iOS/plan/phase-6.md`
3. `docs/iOS/spec.md`