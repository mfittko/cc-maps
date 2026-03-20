# Cross-Country maps Apple Project

This subtree contains the current native Apple implementation for Cross-Country maps.

## Structure

- `CrossCountryMaps.xcodeproj` is the checked-in Xcode entry point.
- `CrossCountryMaps/` contains the iPhone SwiftUI browse-and-inspect MVP target.
- `CrossCountryMapsWatch/` contains the Apple Watch SwiftUI companion shell target.
- `CrossCountryMapsTests/` contains the native XCTest parity suite for shared browse-contract fixtures.
- `Config/` contains shared `.xcconfig` files used by both Apple targets.
- `scripts/generate_project.rb` regenerates the Xcode project and shared schemes from the checked-in source tree.

## Prerequisites

1. macOS with Xcode 16.2 or newer.
2. Xcode command line tools selected with `xcode-select`.
3. Ruby 3.3.9 via `rbenv` for project regeneration.

## Open The Project

1. Open `apps/ios/CrossCountryMaps.xcodeproj` in Xcode.
2. If the project file needs regeneration, run `RBENV_VERSION=3.3.9 ruby apps/ios/scripts/generate_project.rb` from the repo root.

## Schemes

- `CrossCountryMaps` builds and runs the iPhone shell.
- `CrossCountryMapsWatch` builds and runs the watch companion shell.
- `CrossCountryMapsTests` runs the native XCTest browse-contract suite against the iPhone target.

## Build Paths

Build the iPhone app from the command line:

```sh
xcodebuild -project apps/ios/CrossCountryMaps.xcodeproj -scheme CrossCountryMaps -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Build the watch shell from the command line:

```sh
xcodebuild -project apps/ios/CrossCountryMaps.xcodeproj -scheme CrossCountryMapsWatch -destination 'generic/platform=watchOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Run the native iPhone tests from the command line:

```sh
xcodebuild test -project apps/ios/CrossCountryMaps.xcodeproj -scheme CrossCountryMaps -destination 'platform=iOS Simulator,name=iPhone 16' CODE_SIGNING_ALLOWED=NO
```

## Run Paths

1. Ensure the Next.js app is serving the existing `/api/destinations` and `/api/trails` routes at the URL configured by `APP_API_BASE_URL` in `Config/Base.xcconfig`.
2. Select the `CrossCountryMaps` scheme and an iPhone simulator destination.
3. Run the app. The root screen should load destinations first, auto-select a destination when possible, and render selected-destination trails as the primary MapKit overlay set.
4. Select the `CrossCountryMapsWatch` scheme and a paired Apple Watch simulator destination.
5. Run the app. The root screen should show a companion-oriented waiting state until the iPhone sends a route, then surface the latest stored route summary without implying watch-side route authoring.

## Phase 3 behavior

1. The iPhone target now implements the destination-first browse-and-inspect MVP.
2. Runtime trail data still comes from the existing Next.js API routes rather than direct native Sporet access.
3. Nearby preview destinations remain bounded to a 20 km radius and a maximum of 3 previews.
4. Trail inspection now resolves crossing-based intervals when the loaded geometry supports it, with whole-feature fallback only when no reliable interval can be derived.
5. The native XCTest suite consumes the shared browse-contract fixtures under `tests/fixtures/browse-contract/` so Apple parity starts from the same contract as the web validation.

## Paired Simulator Guidance

1. Prefer a paired simulator set that Xcode already offers for the chosen iPhone destination.
2. If no watch pair appears, open Xcode's Devices and Simulators window and create a new paired device set.
3. The watch companion now supports Phase 5.1 happy-path route receipt, local persistence, and acknowledgement back to iPhone.

## Signing Notes

1. Simulator builds should succeed with `CODE_SIGNING_ALLOWED=NO`.
2. If Xcode asks for a team for device builds, choose a local automatic-signing team in the Signing & Capabilities tab.
3. Do not commit developer-specific team identifiers to the repository.

## Workflow Boundary

This Apple subtree builds independently from the root Node workflow. Phase 1 validation does not require `npm install`, `npm run dev`, or a running Next.js server.
