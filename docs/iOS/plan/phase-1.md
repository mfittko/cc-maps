# Phase 1: Apple Project Foundation And Early Xcode Validation

## 0. Implementation status

Status: complete.

Delivered in the repository:

1. `apps/ios/` exists as the Apple subtree.
2. `apps/ios/CrossCountryMaps.xcodeproj` is checked in with shared `CrossCountryMaps` and `CrossCountryMapsWatch` schemes.
3. `apps/ios/Config/` contains checked-in base, debug, and release xcconfig files.
4. `apps/ios/CrossCountryMaps/` contains the minimal iPhone SwiftUI shell with a bounded MapKit surface.
5. `apps/ios/CrossCountryMapsWatch/` contains the minimal Apple Watch SwiftUI companion shell.
6. `apps/ios/README.md` documents prerequisites, build paths, run paths, signing notes, and paired simulator guidance.

Validation completed:

1. `xcodebuild -list -project apps/ios/CrossCountryMaps.xcodeproj` exposes both expected targets and shared schemes.
2. The `CrossCountryMaps` scheme builds successfully for an iOS simulator.
3. The `CrossCountryMapsWatch` scheme builds successfully for a watchOS simulator.
4. A paired iPhone and Apple Watch simulator set was created and booted successfully for validation.
5. Both `com.mfittko.ccmaps` and `com.mfittko.ccmaps.watch` were installed and launched successfully in Simulator.

## 1. Refined problem statement

Create the first real Apple project structure for Cross-Country maps under `apps/ios/`, prove that the iPhone app and Apple Watch companion are viable Xcode targets, and surface project-level blockers before feature work begins.

This phase exists to remove the risks that documentation alone cannot remove: bad Xcode project structure, broken simulator setup, invalid companion-target wiring, scheme confusion, signing friction, missing capability decisions, and watch pairing surprises. The output must be a real Apple project that can be opened on a clean macOS machine, built locally, and launched into minimal native shells on paired simulators.

The phase is intentionally foundation-only. It must not drift into browse parity, planning parity, route-contract implementation, or watch transfer behavior. The purpose is to make later feature phases safer by proving that the Apple subtree, targets, schemes, and local workflow are solid enough to carry real work.

KISS execution rule for this phase: keep it as one implementation issue or one tightly scoped pull request if practical. The work is coupled around one Xcode foundation and should not be split unless a reviewer explicitly introduces a separate ownership boundary.

## 2. Scope

1. Create the Apple subtree physically under `apps/ios/` and keep it isolated from the existing Next.js directories.
2. Create one real iPhone application target and one real Apple Watch companion app boundary in Xcode.
3. Define project, scheme, target, bundle-identifier, and configuration-file conventions that later phases can extend without reorganizing the Apple subtree.
4. Establish the minimum checked-in configuration artifacts required for clean-machine buildability.
5. Document local setup for Xcode, simulator selection, and any local signing step that a developer must perform before the first run.
6. Validate that the iPhone shell launches in an iPhone simulator and that the watch shell launches in a paired watch simulator.
7. Validate that paired-run behavior works at the target and simulator level, even though route transfer is still out of scope.
8. Document target ownership boundaries so later phases know where iPhone-only, watch-only, and Apple-shared code belongs.
9. Preserve workflow isolation: Apple work must build from Xcode or Apple tooling without depending on the Node or Next.js workflow.

## 3. Explicit deliverables

1. A checked-in Apple project root at `apps/ios/`.
2. One Xcode project or workspace entry point under `apps/ios/` with shared schemes committed to the repo.
3. An iPhone app target intended to host the native phone experience.
4. A watchOS companion app target intended to host the watch experience.
5. If the chosen Xcode template emits a separate watch extension target, that target is treated as part of the watch boundary and must also be buildable and documented.
6. A documented Apple project structure under `apps/ios/` that includes, at minimum:
	- the Xcode project or workspace entry point
	- target source directories for iPhone and watch code
	- target-specific asset catalogs
	- target-specific `Info.plist` files if they are not generated from build settings
	- checked-in shared schemes
	- checked-in configuration files under a dedicated config directory such as `apps/ios/Config/`
7. A configuration artifact plan that includes, at minimum:
	- one shared base configuration file
	- one debug configuration file
	- one release configuration file
	- a documented approach for local signing overrides if developer-specific values are required
8. A documented bundle identifier family and target naming convention that clearly relates the iPhone app, watch app, and any watch extension.
9. A minimal `apps/ios/README.md` that explains:
	- prerequisites
	- how to open the Apple project
	- how to select the correct schemes
	- how to build the iPhone target
	- how to build the watch target
	- how to run the paired simulators
	- what minimum shell behavior should appear when the build succeeds
10. Minimal native shell behavior for each target:
	- iPhone shell: launches into a non-crashing SwiftUI app shell with a clear root screen and a visible native foundation surface suitable for future MapKit-based work
	- watch shell: launches into a non-crashing SwiftUI companion shell with a clear empty or waiting state appropriate for a future route companion
11. A local validation checklist that covers clean build, simulator launch, and companion pairing readiness.

## 4. Detailed workstreams

### 4.1 Apple subtree and Xcode entry point

1. Create `apps/ios/` as the only home for Apple implementation work in this phase.
2. Place the Xcode entry point inside `apps/ios/` and keep it self-contained.
3. Do not place Apple targets, Swift files, build settings, or Apple assets under `pages/`, `components/`, `hooks/`, `lib/`, or other Next.js-owned directories.
4. Commit shared schemes so a clean clone exposes the expected build targets without per-developer scheme recreation.
5. Keep the Apple subtree navigable for later phases by using stable, intention-revealing names rather than temporary bootstrap names.

### 4.2 Target boundaries and ownership

Define these boundaries explicitly:

1. iPhone target boundary:
	- owns the iOS app lifecycle
	- owns iPhone shell UI
	- becomes the future home of browse, inspect, planning, share, export, and watch-send initiation
2. Watch target boundary:
	- owns the watchOS app lifecycle
	- owns watch shell UI
	- becomes the future home of received-route review and active-use watch surfaces
3. Watch extension boundary, if generated by template:
	- is part of the watch app delivery boundary
	- must not be treated as disposable scaffolding
4. Apple-shared boundary inside `apps/ios/`, if created now or later:
	- may hold Apple-only shared types or helpers
	- must not become a cross-platform dumping ground for web and Swift code

Boundary rule:

1. This phase creates true targets, not placeholders that are expected to be replaced by a future architecture reset.
2. This phase does not create web-shared UI abstractions or route-contract logic owned by Phase 2.

### 4.3 Naming, identifiers, and configuration artifacts

The refinement must lock these conventions so coding work does not improvise them:

1. Project naming must align with the product and repository naming rather than temporary sample-app names.
2. Bundle identifiers must be defined as one family with consistent suffixing across:
	- the iPhone app target
	- the watch app target
	- the watch extension target if present
3. Build settings must flow through checked-in configuration files rather than being left as opaque per-target Xcode defaults.
4. The Apple subtree should include a dedicated config area, recommended as `apps/ios/Config/`, containing:
	- `Base.xcconfig`
	- `Debug.xcconfig`
	- `Release.xcconfig`
	- optional local override example documentation if team or signing values cannot be committed directly
5. The refinement must state which values are safe to commit and which values must be provided locally.
6. Signing strategy must be documented clearly enough that a clean machine can decide between:
	- automatic signing with a selected team in Xcode
	- documented local override settings for bundle or team values
7. This phase must not introduce backend URLs, route payload versions, or feature flags that belong to later feature phases.

### 4.4 Minimal shell behavior

Minimum shell behavior is required so target viability is validated through actual app launch rather than compile-only success.

Required iPhone shell behavior:

1. The app launches from Xcode into an iPhone simulator without crashing.
2. The root screen is visibly native SwiftUI rather than a blank template or empty white screen.
3. The root screen communicates that the app is an early foundation shell and does not pretend that browse or planning is implemented.
4. The shell includes a minimal foundation surface for future map work. This may be a bounded MapKit-backed view or a clearly intentional native container reserved for that purpose, but it must not require live product data.
5. The shell must not depend on the Next.js dev server or `npm run dev` to launch.

Required watch shell behavior:

1. The watch app launches from Xcode into a paired watch simulator without crashing.
2. The root screen is visibly native SwiftUI and clearly companion-oriented.
3. The root state communicates an empty, waiting, or not-yet-synced route state appropriate for a future companion app.
4. The watch shell must not imply that route authoring exists on watch.

### 4.5 Local setup and workflow isolation

The coding task for this phase must document a clean-machine setup path that is Apple-specific and independent from the Node workflow.

Required local setup coverage:

1. Required macOS and Xcode prerequisites.
2. How to ensure Xcode command line tools are selected if CLI builds are used.
3. How to open the Apple project from `apps/ios/`.
4. Which schemes correspond to the iPhone app and the watch companion.
5. Which simulator pair should be used for the first run.
6. What a developer must do if Xcode requests a local signing team before the first device or simulator run.
7. A clear statement that Apple target work does not require `npm install`, `npm run dev`, or a running Next.js server for this phase.

Isolation rule:

1. The Apple workflow may coexist in the monorepo, but it must not be coupled to the root Node workflow for buildability.
2. Any Apple-specific build or run instructions must live under Apple docs rather than being mixed into the main web quick-start in a way that suggests both stacks must be booted together.

### 4.6 Simulator and pairing readiness validation

This phase must explicitly validate these readiness checks.

Required iPhone readiness checks:

1. The iPhone scheme is visible after opening the checked-in project on a clean clone.
2. The iPhone target builds for an iPhone simulator destination.
3. The iPhone target runs and reaches the minimal shell.
4. Launch succeeds without dependence on backend availability.

Required watch readiness checks:

1. The watch scheme is visible after opening the checked-in project on a clean clone.
2. The watch boundary builds for a watch simulator destination.
3. The watch app runs and reaches the minimal shell.

Required pairing readiness checks:

1. A paired iPhone and Apple Watch simulator set can be selected in Xcode.
2. Running the watch companion from Xcode installs the required companion components rather than failing due to target wiring.
3. The project documentation tells a developer how to recover if the simulator pair is missing or not booted.
4. The phase records whether any simulator-only limitation remains that later WatchConnectivity work must account for.

This phase stops short of validating actual route transfer. It validates that the project and simulator foundation needed for that later work is real.

## 5. Acceptance criteria

1. The Apple project exists in the repo, physically under `apps/ios/`, and no Apple implementation files are added to the existing Next.js directories.
2. The iPhone app target builds in Xcode from a shared checked-in scheme using the documented local setup steps.
3. The watch app target builds in Xcode from a shared checked-in scheme, and any watch extension target required by the chosen template also builds.
4. Project setup instructions are documented clearly enough for a clean machine, including prerequisites, opening the project, scheme selection, signing expectations, and simulator selection.
5. Early simulator validation has been performed for both iPhone and watch targets, and the expected shell behavior is described concretely enough that pass or fail is obvious.
6. The iPhone shell launches into a minimal native root screen without depending on the Node or Next.js workflow.
7. The watch shell launches into a minimal companion root screen on a paired simulator without implying planner functionality.
8. Target boundaries, configuration artifacts, and bundle-identifier conventions are documented clearly enough that later phases can add features without restructuring the Apple subtree.
9. The documented workflow includes at least one explicit build path and one explicit run path for both iPhone and watch validation.
10. Pairing readiness is validated at the simulator and target-wiring level, even though route transfer is still out of scope.

## 6. Definition of Done

1. Apple targets can be opened, built, and run at a minimal shell level.
2. Project boundaries and ownership are documented.
3. Platform setup risk has been reduced enough for feature work to start.
4. Added DoD nuance: the checked-in Apple subtree is stable enough that Phase 2 can define shared route fixtures without asking where Apple code lives, and Phase 3 through Phase 5 can add behavior without renaming targets, replacing schemes, or reopening the watch-companion structure.
5. Added DoD nuance: clean-machine instructions are specific enough that another developer can reproduce the first simulator build and run without relying on tribal knowledge from the original setup author.
6. Added DoD nuance: the validated shell behavior proves launch viability only and does not blur the boundary between foundation work and later product phases.

## 7. Validation plan

### 7.1 Documentation and structure review

1. Verify that `apps/ios/` exists and is the only Apple implementation subtree created by this phase.
2. Verify that the Apple docs explain how to open and use the Xcode entry point.
3. Verify that shared schemes are present in the repo.
4. Verify that configuration files are checked in and named consistently.
5. Verify that target boundaries are documented for iPhone, watch app, and watch extension if present.

### 7.2 iPhone build and run validation

1. Open the Apple project from `apps/ios/` in Xcode.
2. Select the documented iPhone scheme.
3. Build for a documented iPhone simulator destination.
4. Run the target.
5. Confirm that the app reaches the minimal iPhone shell without crashing.
6. Confirm that the shell does not depend on a running web server.

Recommended evidence to capture:

1. Successful local build result.
2. Successful simulator launch result.
3. Short implementation note describing what shell screen was observed.

### 7.3 Watch build and run validation

1. Select the documented watch scheme or companion run path.
2. Build for the documented paired watch simulator destination.
3. Run the watch app through the paired simulator flow.
4. Confirm that the watch app reaches the minimal companion shell without crashing.

Recommended evidence to capture:

1. Successful local build result for watch boundary targets.
2. Successful paired simulator launch result.
3. Short implementation note describing the observed watch shell state.

### 7.4 Pairing readiness checks

1. Confirm that Xcode can target a paired iPhone and Apple Watch simulator set.
2. Confirm that running the watch app does not fail because of missing companion configuration.
3. Confirm that the docs include a fallback step for repairing or recreating the simulator pair if needed.
4. Confirm that any discovered simulator-only caveat is written down for later watch-transfer work.

### 7.5 Workflow isolation checks

1. Confirm that Apple build instructions do not require `npm install`, `npm run dev`, or a running Next.js process.
2. Confirm that root Node scripts are not presented as prerequisites for Phase 1 validation.
3. Confirm that no foundation acceptance check depends on backend integration, contract fixtures, browse behavior, or planner behavior.

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The Apple project is created outside `apps/ios/` or leaks into web directories. | The monorepo boundary becomes muddy immediately and later phases inherit cleanup work. | Make `apps/ios/` the only allowed Apple implementation root and call leakage into Next.js directories a phase failure. |
| Xcode schemes are not shared or the entry point is ambiguous. | A clean clone cannot build without local project surgery. | Require a committed Xcode entry point and committed shared schemes with documented scheme names. |
| Bundle identifiers and signing expectations are left implicit. | The first clean-machine run stalls on avoidable signing and provisioning confusion. | Document the bundle-identifier family, what is committed, what must be set locally, and how automatic signing should be handled. |
| The watch target is treated as disposable scaffolding. | Later phases must replace the companion structure instead of building on it. | Require a true watch boundary now, and treat any generated watch extension as a real owned part of that boundary. |
| Phase 1 drifts into feature implementation. | Foundation work expands, takes longer, and blurs ownership with Phases 2 through 5. | Keep shell behavior intentionally minimal and prohibit browse, planning, contract, and transfer functionality in this phase. |
| Simulator pairing issues are discovered only when WatchConnectivity work starts. | Phase 5 inherits avoidable project and environment blockers. | Make paired-simulator launch and recovery guidance a required validation artifact now. |
| The Apple workflow becomes coupled to Node or Next.js setup. | Native contributors cannot work independently and foundation validation becomes noisy. | Require a standalone Apple build-and-run path that works without the web dev server. |

## 9. Non-goals / out of scope

1. Full browse and inspect parity.
2. Full planner parity.
3. Stable watch route transfer.
4. Route-contract schema definition, fixture creation, or payload versioning; that belongs to Phase 2.
5. Live backend integration, destination loading, or trail loading.
6. Product redesign for iPhone or watch.
7. Watch-side route authoring.
8. Real-device validation as a hard phase requirement. Device notes may be captured when available, but simulator readiness is the required gate for this phase.

## 10. Handoff notes for coding agent

1. Work only under `apps/ios/` for Apple implementation artifacts and under Apple docs for Apple-specific setup notes.
2. Use the locked Apple stack only: Xcode, Swift, SwiftUI, MapKit, and WatchConnectivity.
3. Treat the iPhone app and watch app as real long-lived targets. Do not create demo targets that will need replacement in Phase 3 or Phase 5.
4. Keep the shell behavior intentionally minimal. If a task starts to add destination loading, trail loading, planning, route payload logic, or watch transfer behavior, it has crossed into a later phase.
5. Do not move or reorganize the existing Next.js app as part of this phase.
6. Keep Node workflow isolation explicit in docs and in implementation choices. The Apple project must not require the web dev server to launch.
7. Prefer checked-in configuration files and shared schemes over undocumented Xcode defaults.
8. Document any local signing step clearly, but avoid locking the repo to one personal team or one developer-specific machine setup.
9. If the chosen Xcode template creates an extra watch extension target, keep it and document its ownership rather than collapsing it away casually.
10. If a capability or entitlement beyond basic target viability appears necessary, stop and document why before adding it. This phase should not front-load unrelated capabilities.
11. Capture any Xcode, simulator, or pairing caveat discovered during setup in the Apple docs so later phases do not rediscover it.

## 11. AC/DoD/Non-goal coverage table using exact current phase wording where possible

| Item | Type (AC/DoD/Non-goal) | Status (Met/Partial/Unmet/Unverified) | Evidence (spec/tests/behavior) | Notes |
| --- | --- | --- | --- | --- |
| The Apple project exists in the repo. | AC | Met | Refined problem statement, Scope, Explicit deliverables, Acceptance criteria | Tightened to require physical placement under `apps/ios/` and isolation from Next.js directories. |
| The iPhone app target builds in Xcode. | AC | Met | Explicit deliverables, Detailed workstreams, Acceptance criteria, Validation plan | Now includes shared-scheme and documented setup expectations. |
| The watch app target builds in Xcode. | AC | Met | Explicit deliverables, Detailed workstreams, Acceptance criteria, Validation plan | Expanded to cover any required watch extension boundary as well. |
| Project setup instructions are documented clearly enough for a clean machine. | AC | Met | Explicit deliverables, Detailed workstreams, Acceptance criteria, Validation plan | Refined into prerequisites, scheme selection, signing expectations, simulator selection, and build or run paths. |
| Early simulator validation has been performed for both iPhone and watch targets. | AC | Met | Detailed workstreams: Simulator and pairing readiness validation, Acceptance criteria, Validation plan | Made objective through specific iPhone, watch, and paired-run checks. |
| Apple targets can be opened, built, and run at a minimal shell level. | DoD | Met | Explicit deliverables, Minimal shell behavior workstream, Definition of Done, Validation plan | Minimal shell behavior is defined separately for iPhone and watch. |
| Project boundaries and ownership are documented. | DoD | Met | Scope, Detailed workstreams: Target boundaries and ownership, Handoff notes for coding agent | Clarifies iPhone, watch, optional watch extension, and Apple-shared boundaries. |
| Platform setup risk has been reduced enough for feature work to start. | DoD | Met | Refined problem statement, Risks and mitigations, Definition of Done, Validation plan | Reduced into concrete setup, simulator, pairing, and workflow-isolation checks. |
| Full browse and inspect parity. | Non-goal | Met | Non-goals / out of scope, Handoff notes for coding agent | Explicitly deferred to Phase 3. |
| Full planner parity. | Non-goal | Met | Non-goals / out of scope, Handoff notes for coding agent | Explicitly deferred to Phase 4. |
| Stable watch route transfer. | Non-goal | Met | Non-goals / out of scope, Detailed workstreams: Simulator and pairing readiness validation, Handoff notes for coding agent | Explicitly deferred to Phase 5; this phase validates only target and pairing readiness. |

## 12. Decision log

| Assumption or open point | Resolution | Rationale | Downstream effect |
| --- | --- | --- | --- |
| Where must the Apple implementation live? | Under `apps/ios/` only. | The monorepo boundary is already defined in Phase 0 and must stay clean. | Coding agents know exactly where to create Xcode artifacts and where not to put Apple code. |
| Should Phase 1 create placeholder targets that are replaced later? | No. Create true long-lived iPhone and watch boundaries now. | Replacing target structure later would reintroduce project and pairing risk after feature work starts. | Later phases can add behavior without target churn. |
| Does Phase 1 own route contracts or payload assumptions? | No. Phase 2 owns the shared route contract and fixtures. | Foundation work should not lock backend or payload details early. | Phase 1 shells stay data-light and feature-light. |
| How much watch behavior belongs in Phase 1? | Only enough to prove that the watch companion target launches and presents a minimal companion shell. | The goal is setup validation, not watch-product delivery. | Route receipt and active-use watch work remain in Phases 5 and 6. |
| Should Apple buildability depend on the Node workflow? | No. Apple build and run validation must be independent of `npm` and Next.js dev-server state. | Native contributors need a clean Apple-only workflow, and this phase exists partly to prove that isolation. | Later Apple phases can be validated independently from web runtime state. |
| Should extra entitlements or capabilities be front-loaded now? | No, unless one is strictly required to make the basic iPhone or watch targets viable. | Premature capability decisions create noise and can lock in unnecessary platform assumptions. | Later phases add only the capabilities they actually need. |
| Is real-device validation required to complete Phase 1? | No. Simulator and paired-simulator readiness are the hard gate; device notes are optional if available. | The phase goal is early viability, and simulator validation is the minimum reproducible baseline for contributors. | The phase remains assignable and testable even on machines without device access. |
| How specific should the config artifact expectation be? | Specific enough to require checked-in base, debug, and release configuration files plus documented local-signing handling. | Xcode defaults alone are too opaque for clean-machine setup. | Later phases inherit stable configuration plumbing instead of ad hoc build-setting edits. |