---
name: Review Route Contract
description: "Review route-plan changes for canonical authority drift, stale-anchor regressions, and GPX/share/watch-transfer boundary mistakes."
agent: route-contract-reviewer
---
Review the selected files or current route-plan changes.

Focus on:

1. Canonical versus derived authority.
2. `ok`, `partial`, and `empty` hydration behavior.
3. Stale-anchor visibility.
4. GPX versus share versus watch-transfer separation.
5. Compatibility with `docs/iOS/plan/phase-2.md`, `phase-4.md`, `phase-5.md`, and `phase-6.md`.

Output findings first, ordered by severity.