# Native Apple Phase Plan

This directory breaks the native Apple specification into implementation phases that can be tracked independently while preserving the simple clone-and-adapt strategy.

## Status

- Phase 0 is complete.
- Phase 1 is complete.
- Phase 2 is complete.
- Phase 3 is complete.
- Phase 4 through Phase 6 are still planned and not implemented yet.
- The currently delivered native surface includes the checked-in Apple targets, shared schemes, validated simulator launch paths, and the Phase 3 iPhone browse-and-inspect MVP.
- The currently delivered shared route-contract surface includes versioned schemas, migration notes, parity evidence, and fixture-backed validation.

## Phases

1. [Phase 0](./phase-0.md) - Bootstrap the native Apple work in the repo and define parity targets before Xcode-heavy implementation. Status: complete.
2. [Phase 1](./phase-1.md) - Establish the Apple project foundation and validate it early in Xcode. Status: complete.
3. [Phase 2](./phase-2.md) - Define the shared route contract and fixture set. Status: complete.
4. [Phase 3](./phase-3.md) - Build the native iPhone destination and trail clone MVP. Status: complete.
5. [Phase 4](./phase-4.md) - Add native iPhone planning, sharing, and GPX parity. Status: not started.
6. [Phase 5](./phase-5.md) - Add iPhone-to-watch planned-route transfer. Status: not started.
7. [Phase 6](./phase-6.md) - Deliver the Apple Watch route experience and release-readiness alignment. Status: not started.

## Completed deliverables

1. The planning package under `docs/iOS/` is complete enough to govern later Apple phases.
2. The Apple subtree under `apps/ios/` is present and isolated from the Next.js app.
3. The repository now contains a checked-in Xcode project, shared schemes, xcconfig files, and minimal iPhone and watch SwiftUI shells.
4. The repository now contains a shared route-contract package under `contracts/route-plan/` plus JSON fixtures under `tests/fixtures/route-plan/`.
5. The current foundation and contract package have been validated with simulator builds, simulator launches, and fixture-backed route-plan tests.
6. The repository now also contains the Phase 3 iPhone browse-and-inspect MVP plus shared and native parity coverage for destination-first loading, bounded nearby previews, and inspect-first trail details.

## Execution notes

1. Phase 0 is intentionally repo-centric and avoids native implementation beyond planning artifacts.
2. Phase 1 should begin as soon as Phase 0 gives the Apple subtree a clear home.
3. Phase 2 can overlap with Phase 1, but the route contract should stabilize before watch-transfer implementation begins.
4. Phase 3 should prove the native clone strategy before planning and watch work expand.
5. Phase 4 is the parity gate for route planning and should be completed before the watch companion becomes a serious focus.
6. Phase 5 must prefer reliable background-capable transfer over reachability-only live messaging.
7. Phase 6 should resist scope creep and keep the watch experience route-focused and glanceable.