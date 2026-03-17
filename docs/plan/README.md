# Cross-Country maps MVP Phase Plan

This directory breaks the top-level MVP plan into implementation phases that can be assigned independently while preserving execution order.

## Status

- Phase 0 through Phase 6 are complete.
- Phase 5 exists retroactively to capture the post-MVP enhancements that shipped after the original documentation handoff.
- Phase 6 completed the cleanup split, test harness, and coverage gate and should be treated as the final greenfield phase in the current roadmap.
- Phase 7 is planned feature work for route planning and sharing.
- The current implementation reference still lives in `/README.md` and `/docs/spec.md`.

## Phases

1. [Phase 0](./phase-0.md) - Bootstrap the repository, working title, CI, and GitHub remote.
2. [Phase 1](./phase-1.md) - Stabilize the API contract and add shared data definitions.
3. [Phase 2](./phase-2.md) - Build the destination-first map experience and core user interactions.
4. [Phase 3](./phase-3.md) - Add mobile shell support and minimal PWA metadata.
5. [Phase 4](./phase-4.md) - Finalize repository documentation for MVP handoff.
6. [Phase 5](./phase-5.md) - Record the shipped post-MVP map enhancements retroactively.
7. [Phase 6](./phase-6.md) - Clean up architecture and split responsibilities into maintainable components.
8. [Phase 7](./phase-7.md) - Add planning mode for multi-section route composition, manual route ordering, and sharing.

## Execution Notes

- Phase 0 should land first so all subsequent work happens in a tracked repository with CI.
- Phase 1 should land before most of the UI work because it defines the backend contract the map relies on.
- Phase 2 delivers the functional MVP.
- Phase 3 improves installability and mobile readiness but should not block the core ski-area flow.
- Phase 4 closes the loop by making the docs match the delivered behavior, including the off-plan enhancements that shipped during implementation.
- Phase 5 documents the work that landed after the original MVP-alignment pass so the repo history stays legible.
- Phase 6 was intentionally a cleanup phase rather than a feature phase: it reduced complexity, separated concerns, added a test safety net, and made future changes cheaper.
- Phase 7 reintroduces scoped feature work after the cleanup phase and should preserve the destination-first loading model and bounded trail-graph computation per destination.