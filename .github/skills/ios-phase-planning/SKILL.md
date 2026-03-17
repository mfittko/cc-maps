---
name: ios-phase-planning
description: 'Use when planning or reviewing work against docs/iOS/spec.md, docs/iOS/PLAN.md, or docs/iOS/plan/*. Keep scope aligned to the current Apple phase and prevent cross-phase drift.'
---

# iOS Phase Planning

## Purpose

Keep Apple work scoped to the current refined phase docs instead of letting implementation or planning drift across phases.

## Instructions

1. Read `docs/iOS/spec.md`, `docs/iOS/PLAN.md`, and the matching phase doc under `docs/iOS/plan/`.
2. Identify what is explicitly in scope, out of scope, and blocked by earlier phases.
3. Preserve the current monorepo decision: Apple code belongs under `apps/ios/` and shared contract artifacts belong under `contracts/route-plan/` and `tests/fixtures/route-plan/`.
4. Treat phase acceptance criteria and DoD as the default implementation boundary.
5. Call out when a request crosses from browse, to planning, to watch transfer, to watch UI scope.

## Guardrails

1. Do not let Phase 3 widen into unbounded trail loading.
2. Do not let Phase 4 redefine route identity.
3. Do not let Phase 5 expand into rich watch UI.
4. Do not let Phase 6 become planner parity or workout-engine scope.