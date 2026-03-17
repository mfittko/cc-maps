---
description: "Use when planning, reviewing, or implementing Apple work in docs/iOS, apps/ios, contracts/route-plan, or tests/fixtures/route-plan. Keeps work aligned to the current iOS phase docs and prevents cross-phase drift."
applyTo: "docs/iOS/**, apps/ios/**, contracts/route-plan/**, tests/fixtures/route-plan/**"
---
# iOS Phase Guidance

- Read `docs/iOS/spec.md`, `docs/iOS/PLAN.md`, and the matching phase doc under `docs/iOS/plan/` before changing Apple-facing scope.
- Keep Apple implementation isolated under `apps/ios/`.
- Keep shared route-contract artifacts under `contracts/route-plan/` and `tests/fixtures/route-plan/`.
- Treat the current phase acceptance criteria and Definition of Done as the default implementation boundary.
- Call out when a request crosses from browse, to planning, to watch transfer, to watch UI scope.

Guardrails:

- Do not let Phase 3 widen into unbounded trail loading.
- Do not let Phase 4 redefine route identity.
- Do not let Phase 5 expand into rich watch UI.
- Do not let Phase 6 become planner parity or workout-engine scope.