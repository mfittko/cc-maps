---
description: "Use when changing or reviewing route sharing, hydration, route persistence, stale-anchor handling, GPX export boundaries, or watch payload semantics. Protects canonical versus derived route authority."
applyTo: "contracts/route-plan/**, tests/fixtures/route-plan/**"
---
# Route Contract Guidance

- Canonical route identity is limited to `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds`.
- Treat route names, summaries, geometry, and watch display data as derived and non-authoritative.
- Keep GPX separate from route persistence and watch transfer.
- Hydration must preserve `ok`, `partial`, and `empty` semantics.
- Surface stale anchors explicitly instead of silently dropping them.

Read first:

- `docs/iOS/plan/phase-2.md`
- `docs/iOS/plan/phase-4.md`
- `docs/iOS/plan/phase-5.md`
- `docs/iOS/plan/phase-6.md`
- `lib/route-plan.js`
- `lib/route-graph.js`