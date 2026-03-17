---
name: route-contract-review
description: 'Use when working on route sharing, hydration, route persistence, stale-anchor handling, GPX export boundaries, or watch payload semantics.'
---

# Route Contract Review

## Purpose

Protect the compact canonical route identity and prevent drift between web, iPhone, and watch behavior.

## Canonical Authority

Canonical route identity is limited to:

1. `version`
2. `destinationId`
3. `destinationIds`
4. `anchorEdgeIds`

## Derived Data

Treat route names, summaries, geometry, and watch display data as derived and non-authoritative.

## Review Checklist

1. Does the change preserve compact canonical authority?
2. Does the change keep GPX separate from persistence and watch transfer?
3. Does hydration still use `ok`, `partial`, and `empty` semantics?
4. Are stale anchors surfaced instead of silently dropped?
5. Does any watch payload remain subordinate to canonical route identity?

## Read First

1. `docs/iOS/plan/phase-2.md`
2. `docs/iOS/plan/phase-4.md`
3. `docs/iOS/plan/phase-5.md`
4. `docs/iOS/plan/phase-6.md`
5. `lib/route-plan.js`
6. `lib/route-graph.js`