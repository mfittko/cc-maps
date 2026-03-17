# Native Apple Buildout Plan

This document turns the iOS specification into an execution-oriented phase plan for bootstrapping the native Apple work inside this repository.

## Current status

- The web app remains the shipped product and the full behavioral reference.
- The native Apple work is refined but not yet implemented.
- The intended setup is a monorepo addition in this repository.
- The intended stack is native Swift, SwiftUI, MapKit, and WatchConnectivity.
- The delivery strategy is deliberately simple: clone the current web app behavior where practical, replace the platform layer, and add planned-route use on Apple Watch.

## Phases

1. Phase 0: repository bootstrap, parity inventory, and pre-Xcode planning.
2. Phase 1: Apple project foundation and early Xcode validation.
3. Phase 2: shared route contract and cross-platform fixtures.
4. Phase 3: native iPhone destination and trail clone MVP.
5. Phase 4: native iPhone planning, sharing, and GPX parity.
6. Phase 5: Apple Watch route transfer and synchronization.
7. Phase 6: Apple Watch route experience and release-readiness alignment.

## Execution notes

1. Phase 0 is the bootstrap work that can and should happen here in the repo before meaningful native implementation begins.
2. Phase 1 should start early rather than being deferred until the MVP is feature-complete, because Apple target setup, simulator behavior, MapKit constraints, and WatchConnectivity lifecycle issues need early validation.
3. Phase 2 should begin as soon as Phase 0 establishes the route-contract work area.
4. Phase 3 delivers the first native product value by cloning the core destination-first browse and inspect flow.
5. Phase 4 is the parity gate for route planning and sharing and should be treated as a prerequisite for serious watch work.
6. Phase 5 should focus on reliable delivery of planned routes from phone to watch rather than live-only messaging tricks.
7. Phase 6 should keep the watch deliberately small and legible, then close the loop with release validation and documentation alignment.

## Phase documents

1. See `docs/iOS/plan/phase-0.md` for repository bootstrap and parity inventory.
2. See `docs/iOS/plan/phase-1.md` for the Apple project foundation and early Xcode work.
3. See `docs/iOS/plan/phase-2.md` for the shared route-contract and fixture phase.
4. See `docs/iOS/plan/phase-3.md` for the native iPhone browse-and-inspect clone MVP.
5. See `docs/iOS/plan/phase-4.md` for native iPhone planning and sharing parity.
6. See `docs/iOS/plan/phase-5.md` for watch transfer and synchronization.
7. See `docs/iOS/plan/phase-6.md` for the watch experience and release-readiness phase.

## Current verification outlook

1. Phase 0 verification is documentation and contract completeness.
2. Phase 1 verification is buildability and simulator/device readiness in Xcode.
3. Phase 2 verification is fixture-backed route contract stability.
4. Phase 3 verification is destination-first behavior parity on iPhone.
5. Phase 4 verification is planning, sharing, and GPX parity on iPhone.
6. Phase 5 verification is reliable phone-to-watch route transfer.
7. Phase 6 verification is a usable watch route experience plus release documentation.