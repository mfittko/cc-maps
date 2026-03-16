# Cross-Country maps MVP Phase Plan

This directory breaks the top-level MVP plan into implementation phases that can be assigned independently while preserving execution order.

## Phases

1. [Phase 0](./phase-0.md) - Bootstrap the repository, working title, CI, and GitHub remote.
2. [Phase 1](./phase-1.md) - Stabilize the API contract and add shared data definitions.
3. [Phase 2](./phase-2.md) - Build the destination-first map experience and core user interactions.
4. [Phase 3](./phase-3.md) - Add mobile shell support and minimal PWA metadata.
5. [Phase 4](./phase-4.md) - Finalize repository documentation for MVP handoff.

## Execution Notes

- Phase 0 should land first so all subsequent work happens in a tracked repository with CI.
- Phase 1 should land before most of the UI work because it defines the backend contract the map relies on.
- Phase 2 delivers the functional MVP.
- Phase 3 improves installability and mobile readiness but should not block the core ski-area flow.
- Phase 4 should happen after implementation so the docs match reality.