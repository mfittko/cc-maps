# iOS And Apple Watch Specification

This directory contains the native Apple-platform refinement package for Cross-Country maps.

## Purpose

The current product is a Next.js web app with destination-first trail loading, shareable route planning, and GPX export. This package defines how to extend that product with:

1. A native iPhone app.
2. An Apple Watch companion app.
3. A monorepo layout that keeps the web and Apple clients aligned without pretending they can share UI implementation.

## Contents

1. `spec.md` - implementation-ready product and engineering specification for the native Apple setup.
2. `PLAN.md` - phase-oriented buildout summary for the native Apple work.
3. `plan/` - detailed phase documents for bootstrap, Xcode foundation, contract work, iPhone clone work, and Apple Watch delivery.

The canonical Phase 0 parity inventory and Apple phase ownership map live in `spec.md`.

## Current decision summary

1. The Apple clients should live in this repository as a monorepo addition, not a separate repository.
2. The Apple implementation should be native Swift and SwiftUI, with MapKit for map rendering and WatchConnectivity for phone-to-watch route transfer.
3. The existing web app is the full product reference for the native work: the iPhone app should be built as a straightforward clone of the current shipped behavior wherever practical.
4. The main platform substitution is `MapKit` instead of Mapbox GL JS, plus native Apple platform integration where required.
5. The watch app is a companion experience focused on using planned routes, not the primary place to build them.
6. Flutter is not the recommended primary stack for this Apple-specific setup because the watch companion would still require native Apple code.

## Implemented so far

1. The documentation and phase-planning package is complete through Phase 0.
2. The Apple foundation subtree is implemented under `apps/ios/`.
3. The repository now includes a checked-in Xcode project, shared schemes, base configuration files, and minimal SwiftUI shells for iPhone and Apple Watch.
4. The shared route-contract package is implemented under `contracts/route-plan/` and `tests/fixtures/route-plan/`.
5. Simulator build and launch validation has been completed for the current foundation shells.
6. Fixture-backed route-contract validation has been completed against the shipped web route helpers.
7. Phase 3 browse parity is implemented on iPhone, including destination-first trail loading, bounded nearby previews, and inspect-first trail details with native XCTest and shared-fixture validation.
8. Native planning UI, GPX parity on iPhone, and send-to-watch behavior are not implemented yet.