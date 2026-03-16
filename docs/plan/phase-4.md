# Phase 4: Documentation And MVP Alignment

## Goal

Ensure the repository documentation matches the implemented MVP so future contributors and assignees do not rely on stale scaffold-era assumptions.

## Status

Complete.

This phase is satisfied in the current repository state:

- `README.md`, `docs/spec.md`, and the top-level planning docs now describe the shipped behavior.
- Deferred scope is called out explicitly.
- The documentation set also captures meaningful enhancements that landed after the original MVP handoff.

## Scope

1. Update `/README.md` to reflect the actual MVP flow and setup requirements.
2. Document any intentional exclusions from MVP such as POIs, transport stops, and warning polling.
3. Align setup instructions with the final environment variables, app shell, and any PWA metadata that was shipped.
4. Ensure the plan documents still reflect the delivered scope or clearly mark remaining work.
5. Capture meaningful implementation additions that landed outside the original written phase scope so they are not lost in handoff.

## Deliverables

- Updated README that matches the implementation.
- Clear note of deferred features.
- Final documentation pass over the planning artifacts if scope changed during implementation.
- Explicit documentation of off-plan shipped behavior such as terrain mode, state persistence, and trail analysis.

## Dependencies

- Should happen after the implementation phases are complete enough that the docs can be finalized against real behavior.

## Risks

- Documentation drift if implementation changes late in the cycle.
- Overstating PWA or mobile support before it is verified.

## Verification

1. Confirm the README setup steps are sufficient to run the app from a clean checkout.
2. Confirm the documented feature set matches the shipped MVP.
3. Confirm deferred work is called out explicitly rather than implied.

## Out Of Scope

- New product work.
- Post-MVP roadmap planning beyond clarifying deferred items.