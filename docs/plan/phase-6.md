# Phase 6: Code Cleanup And Responsibility Split

## Goal

Reduce structural complexity in the current implementation by splitting the large map page into coherent components, hooks, and helper modules while preserving the shipped behavior, and add unit-test coverage around the extracted logic so the cleanup has a safety net.

## Status

Complete.

This phase should be treated as the final planned greenfield phase for the current roadmap. The remaining work after this phase should primarily be maintenance, targeted fixes, or newly scoped product work rather than broad foundational restructuring.

Implemented outcomes:

- `/pages/index.js` is materially smaller and now focuses on orchestration and map lifecycle effects.
- Panel presentation moved into `components/ControlPanel.js` and `components/InfoPanel.js`.
- URL and local-storage synchronization moved into `hooks/useMapPersistence.js`.
- Pure distance, crossing, and label helpers moved into `lib/map-domain.js`.
- Query parsing and trail-cache persistence moved into `lib/map-persistence.js`.
- Vitest and `npm run test:coverage` are wired into the repository and CI with a 90% threshold for lines, statements, branches, and functions across the covered modules.
- Dead code discovered through coverage work was removed instead of being retained behind artificial tests.

## Scope

1. Split `/pages/index.js` into smaller presentation components for the control panel, info panel, legend, destination selection, and trail detail sections.
2. Extract map lifecycle and layer wiring into focused hooks or helper modules where that improves clarity.
3. Isolate pure map-domain utilities such as trail crossing analysis, distance calculations, persistence helpers, and GeoJSON transforms away from the page component.
4. Consolidate repeated setup patterns so layer creation, event binding, and cached fetch handling are easier to reason about.
5. Improve naming and file boundaries to reflect SRP, KISS, and DRY rather than a single large page owning every concern.
6. Add a lightweight unit-test setup suitable for the extracted pure logic and shared utilities, since the repository does not currently have one.
7. Add unit tests for the most failure-prone extracted logic, especially trail analysis, distance and geometry helpers, persistence helpers, and request-shaping utilities.
8. Preserve current product behavior unless a small bug fix is required to make the cleanup safe.

## Deliverables

- A materially smaller `/pages/index.js` focused on page composition rather than every implementation detail.
- Reusable components and helper modules with clearer boundaries.
- A minimal unit-test harness and test scripts integrated into the project.
- Unit coverage for the extracted pure logic that carries the highest regression risk.
- Equivalent or improved readability of map behavior, fetch flow, and persistence logic.
- Documentation updated to reflect the new project structure if file locations change materially.

## Handoff package

Recommended starting points for whoever executes this phase:

- Treat `/pages/index.js` as the main decomposition target.
- Extract pure utilities first, because they can be tested immediately.
- Add the test harness early in the phase so later refactors have coverage.
- Keep the destination-first flow and current URL/local-storage behavior stable while splitting files.

Suggested logical split:

1. Pure helpers for geometry, distance, crossings, label generation, and persistence shaping.
2. Hooks for map initialization, destination loading, trail loading, and URL/local-storage synchronization.
3. Presentation components for the control panel, info panel, legend, destination picker, and trail details.
4. A thinner page component that composes those pieces and owns only page-level orchestration.

## Guiding Principles

- SRP: each module should have one clear reason to change.
- KISS: prefer direct solutions and avoid speculative abstractions.
- DRY: extract repetition only when it reduces mental overhead rather than hiding simple code.
- Behavior preservation: cleanup is successful only if the current map flow still behaves the same.
- Test the seams: when logic is extracted into pure modules, add tests there instead of relying only on manual map checks.

## Dependencies

- Phase 5 should exist first so the shipped behaviors being preserved are clearly documented.

## Risks

- Refactoring the map page can break subtle interaction flows such as layer ordering, event registration, or URL synchronization.
- Over-extraction can make the code harder to follow if responsibilities are split too aggressively.
- Cleanup work can accidentally become a feature phase if scope is not controlled tightly.
- Introducing a test harness during refactoring can add churn if the setup is heavier than the codebase needs.

## Verification

1. Confirm the user-visible behavior still matches the current documentation after the split.
2. Confirm the new test command passes for the extracted utility and helper modules.
3. Confirm `npm run build` still succeeds.
4. Confirm destination loading, trail loading, persistence, terrain mode, nearby suggestions, and trail detail interactions still work.
5. Confirm the new structure makes ownership boundaries more obvious than the current single-file implementation.

## Out Of Scope

- New product capabilities unrelated to cleanup.
- POIs, transport stops, warning polling, or offline support.
- Large visual redesigns unless needed to support the structural split.