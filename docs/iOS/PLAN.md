# Native Apple Buildout Plan

This document turns the iOS specification into an execution-oriented phase plan for bootstrapping the native Apple work inside this repository.

## Current status

- The web app remains the shipped product and the full behavioral reference.
- Phase 0 is complete as a documentation and planning package.
- Phase 1 is complete as a checked-in Apple project foundation under `apps/ios/`, including the Xcode project, shared schemes, minimal SwiftUI shells, and simulator validation.
- Phase 2 is complete as a shared route-contract and fixture package under `contracts/route-plan/` and `tests/fixtures/route-plan/`.
- Phase 3 is complete as a native iPhone browse-and-inspect clone MVP with fixture-backed parity coverage and simulator validation.
- Phase 4 through Phase 6 remain planned and are not implemented yet.
- The intended setup is a monorepo addition in this repository.
- The intended stack is native Swift, SwiftUI, MapKit, and WatchConnectivity.
- The delivery strategy is deliberately simple: clone the current web app behavior where practical, replace the platform layer, and add planned-route use on Apple Watch.

## Phases

1. Phase 0: repository bootstrap, parity inventory, and pre-Xcode planning. Status: complete.
2. Phase 1: Apple project foundation and early Xcode validation. Status: complete.
3. Phase 2: shared route contract and cross-platform fixtures. Status: complete.
4. Phase 3: native iPhone destination and trail clone MVP. Status: complete.
5. Phase 4: native iPhone planning, sharing, and GPX parity. Status: not started.
6. Phase 5: Apple Watch route transfer and synchronization. Status: not started.
7. Phase 6: Apple Watch route experience and release-readiness alignment. Status: not started.

## Completed work

1. Phase 0 delivered the Apple docs package, parity inventory, monorepo layout decision, and phase ownership map.
2. Phase 1 delivered `apps/ios/`, the checked-in `CrossCountryMaps.xcodeproj`, shared schemes, base debug and release xcconfig files, a minimal iPhone SwiftUI shell, a minimal watch SwiftUI companion shell, and Apple-specific setup documentation.
3. Phase 1 validation completed with successful simulator builds for the `CrossCountryMaps` and `CrossCountryMapsWatch` schemes plus successful simulator launches for both bundle identifiers.
4. Phase 2 delivered the shared route-contract overview, versioned schemas, migration notes, parity evidence, and JSON fixtures for canonical, derived, migration, partial-hydration, and invalid-payload scenarios.
5. Phase 2 validation completed with fixture-backed Vitest coverage against the shipped route-plan helpers plus a passing production build.
6. Phase 3 delivered a native iPhone browse surface under `apps/ios/` with destination-first loading, manual destination stabilization, destination-scoped primary trail rendering, bounded nearby preview trails, inspect-first trail details, and map-first overlay UI.
7. Phase 3 validation completed with shared browse-contract fixture coverage in `tests/browse-contract.test.js`, native XCTest parity coverage in `apps/ios/CrossCountryMapsTests/BrowseContractTests.swift`, and repeated iPhone simulator build and launch checks against the checked-in Xcode project.

## Execution notes

1. Phase 0 is the bootstrap work that can and should happen here in the repo before meaningful native implementation begins.
2. Phase 1 should start early rather than being deferred until the MVP is feature-complete, because Apple target setup, simulator behavior, MapKit constraints, and WatchConnectivity lifecycle issues need early validation.
3. Phase 2 should begin as soon as Phase 0 establishes the route-contract work area.
4. Phase 3 delivers the first native product value by cloning the core destination-first browse and inspect flow.
5. Phase 4 is the parity gate for route planning and sharing and should be treated as a prerequisite for serious watch work. Phase 4 elevation summary depends on the shared `POST /api/elevation` endpoint (see `docs/iOS/plan/phase-4.md` section 13); that server-side endpoint is now implemented and tested.
6. Any future Apple work that expands segment-distance labels from selected-trail inspection to broader on-screen route-network labeling should be treated as planning-mode follow-up inside Phase 4 scope, not as browse-mode drift.
7. Phase 5 should focus on reliable delivery of planned routes from phone to watch rather than live-only messaging tricks.
8. Phase 6 should keep the watch deliberately small and legible, then close the loop with release validation and documentation alignment.

## Phase documents

1. See `docs/iOS/plan/phase-0.md` for repository bootstrap and parity inventory.
2. See `docs/iOS/plan/phase-1.md` for the Apple project foundation and early Xcode work.
3. See `docs/iOS/plan/phase-2.md` for the shared route-contract and fixture phase.
4. See `docs/iOS/plan/phase-3.md` for the native iPhone browse-and-inspect clone MVP.
5. See `docs/iOS/plan/phase-4.md` for native iPhone planning and sharing parity.
6. See `docs/iOS/plan/phase-5.md` for watch transfer and synchronization.
7. See `docs/iOS/plan/phase-6.md` for the watch experience and release-readiness phase.

## Current verification outlook

1. Phase 0 verification is complete.
2. Phase 1 verification is complete for checked-in project structure, simulator builds, paired simulator readiness, and minimal shell launch.
3. Phase 2 verification is complete for fixture-backed route contract stability, migration parity, and hydration semantics.
4. Phase 3 verification is destination-first behavior parity on iPhone.
5. Phase 4 verification is planning, sharing, and GPX parity on iPhone.
6. Phase 5 verification is reliable phone-to-watch route transfer.
7. Phase 6 verification is a usable watch route experience plus release documentation.