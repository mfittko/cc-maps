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

- `pages/index.js` composes the map shell, map lifecycle effects, and page-level orchestration.
- `components/ControlPanel.js` and `components/InfoPanel.js` own the extracted panel presentation.
- `hooks/useMapPersistence.js` owns URL and local-storage synchronization for destination, terrain, color mode, and map view.
- `lib/map-domain.js` contains extracted pure map-domain helpers such as distance, destination matching, crossing analysis, and segment label shaping.
- `lib/map-persistence.js` contains extracted storage and query-parsing helpers plus trail-cache shaping.
- `pages/api/destinations.js` proxies active destination data from Sporet layer 4.
- `pages/api/trails.js` validates `destinationid` and proxies trail data from Sporet layer 6.
- `lib/sporet.js` contains shared layer IDs, integer parsing, the Sporet fetch helper, and style mappings.
- `pages/_app.js` wires in global styles, Mapbox CSS, and manifest metadata.

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
- CI must run `npm run test:coverage` and fail if coverage drops below 90% for lines, statements, branches, or functions across the covered modules.
- Use `npm ci` for dependency installation when the lockfile is present.
- For focused work, prefer targeted tests first, then finish with `npm run test:coverage` and `npm run build` when the change affects shared logic or shipped behavior.
- Prefer testing pure logic such as geometry helpers, trail analysis, persistence helpers, and request-shaping utilities over brittle UI-heavy tests as a first step.
- If coverage reveals dead or unreachable code, remove that code instead of writing tests whose only purpose is to cover it.

## Working rules for future agents

- Read the relevant phase docs before changing scope-sensitive behavior.
- If you change runtime behavior, update `README.md`, `docs/spec.md`, and any affected phase docs.
- Prefer focused changes over broad rewrites.
- Prefer the built-in file edit tool for code changes instead of shell redirection, ad hoc scripting, or Python wrappers that write files indirectly.
- If you notice undocumented shipped behavior, document it instead of leaving it implicit.
- If you are refactoring, make the safety net stronger as you go: extract pure logic, then test it.
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