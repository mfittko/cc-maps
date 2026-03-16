# Phase 1: API Stabilization And Shared Data Setup

## Goal

Establish a predictable data contract for the MVP by hardening the trail API, introducing destination fetching, and centralizing symbol-to-style mappings used by the client.

## Scope

1. Update `/pages/api/trails.js` to validate `destinationid` and reject malformed input with a clear client error.
2. Avoid treating an unbounded `1=1` trail query as the main product flow.
3. Add `/pages/api/destinations.js` to proxy Sporet layer 4 and return destination data needed by the map.
4. Add `/lib/sporet.js` to hold trail type labels, trail colors, destination prep colors, and any lightweight response helpers.

## Deliverables

- Hardened trail proxy with explicit query validation.
- New destination proxy route with a documented response shape.
- Shared constants for `trailtypesymbol` and `prepsymbol` mappings.
- Clear contract for how the client requests destination-scoped trail data.

## Dependencies

- None inside the repo. This is the foundation phase.
- Depends externally on the Sporet service continuing to expose the documented layers.

## Risks

- The Sporet API may enforce record limits or return unexpected field shapes.
- Destination geometry and trail geometry must remain compatible with the client mapping flow.
- If the service response is inconsistent, light response shaping may be required before the UI phase.

## Verification

1. Confirm `/api/trails?destinationid=<number>` returns success for valid numeric values.
2. Confirm `/api/trails?destinationid=invalid` returns a client error rather than calling Sporet.
3. Confirm `/api/destinations` returns active destinations with the expected fields for rendering and selection.
4. Confirm the shared constants cover the expected `trailtypesymbol` and `prepsymbol` values and provide a fallback for unknown values.

## Out Of Scope

- Any user-facing map UI.
- PWA work.
- POIs, transport stops, and warning polling.