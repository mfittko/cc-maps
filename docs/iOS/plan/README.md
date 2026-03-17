# Native Apple Phase Plan

This directory breaks the native Apple specification into implementation phases that can be tracked independently while preserving the simple clone-and-adapt strategy.

## Status

- No native Apple phases are implemented yet.
- Phase 0 is the immediate bootstrap phase that can be executed here in the repo before native code starts.
- Phase 1 is the earliest Xcode-dependent phase and should start before the native MVP is feature-complete.
- Phases 3 through 6 deliver the actual product surfaces on iPhone and Apple Watch.

## Phases

1. [Phase 0](./phase-0.md) - Bootstrap the native Apple work in the repo and define parity targets before Xcode-heavy implementation.
2. [Phase 1](./phase-1.md) - Establish the Apple project foundation and validate it early in Xcode.
3. [Phase 2](./phase-2.md) - Define the shared route contract and fixture set.
4. [Phase 3](./phase-3.md) - Build the native iPhone destination and trail clone MVP.
5. [Phase 4](./phase-4.md) - Add native iPhone planning, sharing, and GPX parity.
6. [Phase 5](./phase-5.md) - Add iPhone-to-watch planned-route transfer.
7. [Phase 6](./phase-6.md) - Deliver the Apple Watch route experience and release-readiness alignment.

## Execution notes

1. Phase 0 is intentionally repo-centric and avoids native implementation beyond planning artifacts.
2. Phase 1 should begin as soon as Phase 0 gives the Apple subtree a clear home.
3. Phase 2 can overlap with Phase 1, but the route contract should stabilize before watch-transfer implementation begins.
4. Phase 3 should prove the native clone strategy before planning and watch work expand.
5. Phase 4 is the parity gate for route planning and should be completed before the watch companion becomes a serious focus.
6. Phase 5 must prefer reliable background-capable transfer over reachability-only live messaging.
7. Phase 6 should resist scope creep and keep the watch experience route-focused and glanceable.