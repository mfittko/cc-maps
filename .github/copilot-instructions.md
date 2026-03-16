# CC-maps Copilot Instructions

- Stack: Next.js, React, Mapbox GL JS, Vitest.
- Runtime model: preserve the destination-first loading flow. Do not reintroduce unbounded trail loading as a normal path.
- Expected environment variables: `NEXT_PUBLIC_MAPBOX_TOKEN` and `SPORET_API_BASE_URL`.
- Use `npm ci` for dependency installation when the lockfile is available.
- Primary validation commands are `npm run test:coverage` and `npm run build`.
- For focused work, prefer targeted tests first, then finish with full coverage and build validation when the change can affect shared logic or production behavior.
- For UI work, prefer deterministic validation of panel state, routing controls, and URL/local-storage persistence behavior before relying on visual map rendering alone.
- Keep Sporet access centralized through the existing Next.js API routes under `pages/api/` unless the task explicitly changes scope.
- Keep performance boundaries intact: avoid extra trail fetch fan-out, repeated Mapbox listener/layer registration, and geometry-heavy recomputation unless inputs actually changed.
- If the task changes product behavior, update the relevant docs in `README.md`, `docs/spec.md`, and `docs/plan/phase-7.md` when applicable.