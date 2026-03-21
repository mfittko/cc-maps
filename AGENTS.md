# AGENTS.md

## Purpose

This file gives future coding agents the minimum project context needed to work safely in this repository without rediscovering the product intent, current architecture, and active constraints.

## Project snapshot

- Project name: Cross-Country maps
- Package and deployment alias: `cc-maps`
- Stack: Next.js, React, Mapbox GL JS
- Primary external data source: public Sporet ArcGIS REST service
- Main runtime flow: destination-first, then destination-scoped trail loading

## Current product behavior

- The app loads active destinations first.
- It can auto-select the nearest destination using foreground geolocation.
- It fetches trails only for the selected destination in the intended product flow.
- Trail colors can be switched between trail type and grooming freshness.
- The UI includes a winter-tuned basemap, optional 3D terrain, nearby destination suggestions, trail detail panels, and trail crossing analysis.
- URL query parameters and local storage persist destination, map view, terrain mode, and color mode.
- PWA support is limited to manifest and icon metadata. There is no service worker or offline-first caching layer.

## Current architecture

- `pages/index.tsx` composes the homepage orchestration, derived state, and panel rendering.
- `lib/home-page.ts` contains extracted page-scoped constants and pure helper logic for map styling, trail collection shaping, and route-selection utilities.
- `components/ControlPanel.tsx`, `components/InfoPanel.tsx`, `components/PlanningPanel.tsx`, and `components/TrailDetailsPanel.tsx` own the extracted panel presentation.
- `hooks/useMapLifecycle.ts` owns map creation, initial view restoration, and ready/error lifecycle state.
- `hooks/useDestinationsData.ts` owns destination bootstrap and shaping.
- `hooks/useAutoDestinationSelection.ts` owns geolocation-driven destination auto-selection.
- `hooks/useNearbyDestinationIds.ts` owns debounced nearby destination suggestion derivation.
- `hooks/useRoutePlanSync.ts` owns route hydration plus route/planning URL and storage synchronization.
- `hooks/useRouteDirectionTracking.ts` owns route-travel direction detection from live progress.
- `hooks/useInteractionEnvironment.ts` owns the device and pointer-environment detection used by planning and overlay UX.
- `hooks/useLatestValue.ts` owns the repeated latest-value ref synchronization pattern for async map handlers.
- `hooks/useMapPersistence.ts` owns URL and local-storage synchronization for destination, terrain, color mode, and map view.
- `lib/map-domain.ts` contains extracted pure map-domain helpers such as distance, destination matching, crossing analysis, and segment label shaping.
- `lib/map-persistence.ts` contains extracted storage and query-parsing helpers plus trail-cache shaping.
- `pages/api/destinations.ts` proxies active destination data from Sporet layer 4.
- `pages/api/trails.ts` validates `destinationid` and proxies trail data from Sporet layer 6.
- `lib/sporet.ts` contains shared layer IDs, integer parsing, the Sporet fetch helper, and style mappings.
- `pages/_app.tsx` wires in global styles, Mapbox CSS, and manifest metadata.

## Source of truth

- Product and runtime behavior: `README.md` and `docs/spec.md`
- Buildout and phase status: `docs/PLAN.md` and `docs/plan/`
- Post-MVP shipped enhancements: `docs/plan/phase-5.md`
- Planned cleanup and test work: `docs/plan/phase-6.md`
- VS Code Copilot workflow: `docs/ai/vscode-copilot-workflow.md`
- Repo-wide workspace instructions: `AGENTS.md`
- Copilot scoped customizations: `.github/instructions/`, `.github/prompts/`, `.github/agents/`, `.github/skills/`, and `.github/hooks/`

When implementation changes materially, keep these docs aligned. Do not let the repo drift back into stale scaffold-era assumptions.

## Active constraints

- Preserve the destination-first loading model.
- Do not treat unbounded trail loading as the main user flow.
- Do not introduce offline support or a service worker unless the scope is explicitly expanded.
- POIs, transport stops, and warning polling remain deferred unless the task explicitly changes scope.
- Keep external Sporet access centralized in the Next.js API routes unless there is a strong reason to move it.

## Performance guardrails

Treat performance regressions as release blockers for both the frontend map experience and the backend proxy surface.

Frontend guardrails:

- Do not reintroduce unbounded trail loading on startup. Keep the destination-first flow as the main performance boundary.
- Be careful with geometry-heavy logic such as crossing analysis, distance calculations, and segment-label generation. These should stay in pure helpers and only run when their real inputs change.
- Avoid adding map listeners, sources, or layers repeatedly. Check for existing Mapbox resources before adding them, and clean up event handlers when effects are torn down.
- Avoid high-frequency state writes tied directly to map movement. Prefer settled events such as `moveend`, and debounce any derived suggestion or persistence work when possible.
- Treat nearby-destination previews as a bounded enhancement, not an excuse to fan out to many trail fetches. Keep suggestion loading constrained and cache-aware.
- When changing the control panel or map shell, watch for extra rerenders caused by broad state coupling or expensive derived values inside render paths.

Backend guardrails:

- Keep Sporet requests field-limited and parameter-validated. Do not widen `outFields` or query scope casually.
- Keep unfiltered API fallbacks explicitly bounded. If a query can grow with dataset size, add or preserve a hard cap.
- Preserve cache headers on proxy routes unless there is a strong product reason to reduce cacheability.
- Avoid adding server-side work that scales with the full trail dataset when the product flow only needs destination-scoped data.

Performance review expectations:

- If a change increases client-side geometry work, map-layer churn, request fan-out, or API payload size, call that out explicitly in the implementation notes.
- Use coverage and cleanup work to remove dead paths that still carry runtime cost or mental overhead.
- For perf-sensitive map or API changes, validate more than correctness: check that fetch scope stays bounded, derived work stays dependency-driven, and no duplicate listeners or layers are introduced.
- If a future task meaningfully changes rendering cost or network behavior, add a lightweight before-and-after measurement where practical instead of relying on intuition.

## Cleanup expectations

Phase 6 is the next major engineering phase. If a task involves cleanup or refactoring, align with these expectations:

- Split responsibilities out of `pages/index.js` into smaller components, hooks, and pure helper modules.
- Apply SRP, KISS, and DRY pragmatically. Do not introduce abstractions that only reshuffle complexity.
- Preserve shipped behavior first. Cleanup is not a reason to change product behavior casually.
- Add unit tests when extracting pure logic. The cleanup phase should leave behind a test harness and coverage for the most failure-prone shared logic.
- Treat coverage as a quality gate, not a vanity metric: enforce at least 90% line, statement, branch, and function coverage in CI for the extracted pure logic and API contract surface.
- Use coverage reports to find dead code and remove it. Do not keep unused code and add tests just to satisfy the threshold.
- Treat Phase 6 as the final planned greenfield phase in the current roadmap, not as an excuse for open-ended redesign.

## Testing and validation

- Current proven validation command: `npm run build`
- The repository uses Vitest for extracted pure logic and API contract coverage.
- Work test-driven by default: define or update the contract in tests and fixtures before or alongside implementation, especially when behavior is derived from the shipped web app.
- For Apple work, start from shared parity fixtures and contract tests before expanding native UI code so the iPhone and watch implementations clone web behavior instead of reinterpreting it.
- CI must run `npm run test:coverage` and fail if coverage drops below 90% for lines, statements, branches, or functions across the covered modules.
- Use `npm ci` for dependency installation when the lockfile is present.
- For focused work, prefer targeted tests first, then finish with `npm run test:coverage` and `npm run build` when the change affects shared logic or shipped behavior.
- Prefer testing pure logic such as geometry helpers, trail analysis, persistence helpers, and request-shaping utilities over brittle UI-heavy tests as a first step.
- When adding a new behavior contract, prefer fixture-backed tests that encode the current web outcome and let downstream native work consume the same fixtures.
- If coverage reveals dead or unreachable code, remove that code instead of writing tests whose only purpose is to cover it.

## Working rules for future agents

- Read the relevant phase docs before changing scope-sensitive behavior.
- If you change runtime behavior, update `README.md`, `docs/spec.md`, and any affected phase docs.
- Treat test design as part of implementation, not a follow-up task: add or adjust the relevant tests early enough that they define the intended behavior before the code settles.
- Treat regressions as TDD work by default: reproduce them in a failing automated test first or alongside the fix, then land the code change with that regression coverage in place.
- Prefer focused changes over broad rewrites.
- Prefer the built-in file edit tool for code changes instead of shell redirection, ad hoc scripting, or Python wrappers that write files indirectly.
- Never configure a local working branch to track a different branch such as `origin/main`. A feature branch must track its same-named remote branch or have no upstream until that remote branch exists.
- If you notice undocumented shipped behavior, document it instead of leaving it implicit.
- If you are refactoring, make the safety net stronger as you go: extract pure logic, then test it.
- If you are cloning web behavior into Apple code, capture parity with fixtures or contract tests first, then implement against that contract.
- If the task is unclear about whether it is feature work or cleanup work, default to preserving current behavior and ask only if the distinction materially affects the outcome.

## Multi-agent workflow

This repo uses VS Code Copilot-native chat customizations.

- `AGENTS.md` is the only repo-wide workspace instruction file.
- `.github/instructions/` contains on-demand and file-specific instructions.
- `.github/prompts/` contains reusable slash-invocable prompt files.
- `.github/agents/` contains custom role-based agents.
- `.github/skills/` contains specialized workflows that Copilot can load on demand.
- `.github/hooks/` contains deterministic workspace hook configuration.
- `.vscode/mcp.json` contains workspace-shared MCP server configuration for VS Code.

Do not reintroduce parallel Claude-specific instruction systems in this repo. Keep the Copilot customizations aligned with the product docs and phase plans.

## Environment and local setup

Expected local environment variables:

- `NEXT_PUBLIC_MAPBOX_TOKEN`
- `SPORET_API_BASE_URL`

Typical local workflow:

1. `npm ci` when the lockfile is present, otherwise `npm install`
2. Copy `.env.local.example` to `.env.local`
3. `npm run dev` for interactive checks
4. `npm run build` for production-safe validation

When product behavior changes, update `README.md`, `docs/spec.md`, and `docs/plan/phase-7.md` when applicable.

## If you need a starting point

- Behavior question: read `docs/spec.md`
- Scope question: read `docs/PLAN.md` and the latest phase docs
- Refactor question: start with `docs/plan/phase-6.md`
- Data contract question: inspect `lib/sporet.js`, `pages/api/destinations.js`, and `pages/api/trails.js`