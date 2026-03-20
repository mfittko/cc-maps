# Route Plan Contract

This directory defines the shared route contract used by the web app, the planned native iPhone app, and the planned Apple Watch transfer flow.

## Contract generation

The current shared contract generation is version `2`, matching the shipped web route-plan version.

The authoritative route identity remains compact and limited to four fields:

1. `version`
2. `destinationId`
3. `destinationIds`
4. `anchorEdgeIds`

Anything else remains derived and non-authoritative.

## Route ownership versus browse focus

`destinationId` is the stable route owner for the lifetime of a canonical route.

1. Setting `destinationId` at route creation fixes the route owner.
2. Changing browse focus (the currently selected destination in the UI) does not mutate canonical `destinationId`.
3. `destinationIds` always lists the route owner first. Its first element must equal `destinationId`.
4. Browse-focus changes are derived, non-canonical UI state. They must never alter `destinationId`, reorder `destinationIds`, or mutate `anchorEdgeIds`.

This is Option A from RFC mfittko/cc-maps#44 and requires no canonical version bump, no storage-key migration, no share-format migration, and no watch-envelope redesign.

## Canonical payload

Canonical payload file: `schema/route-plan-canonical.v2.schema.json`

Canonical route identity rules:

1. `destinationId` is the primary destination, the stable route owner, and must be a numeric string.
2. `destinationIds` is the ordered, unique set of participating destination ids with the route owner (`destinationId`) first.
3. `anchorEdgeIds` is the ordered list of deterministic graph edge ids in user-visible route order.
4. Canonical payloads must not embed route polylines, route summaries, GPX content, or watch-only display state.

## Derived watch payload

Derived payload file: `schema/route-plan-derived-watch.v2.schema.json`

The derived watch payload is a convenience payload for review and rendering. It is subordinate to the canonical route payload and must never become route authority.

Derived payload rules:

1. It exists to avoid forcing the watch to rebuild a full route graph before showing a route.
2. It may contain route geometry, distance, elevation summaries, section summaries, and an optional label.
3. If derived data disagrees with canonical route identity, the payload is invalid.
4. Derived data is disposable and may be regenerated on the phone.

## Transfer envelope

Transfer envelope file: `schema/route-plan-transfer-envelope.v2.schema.json`

The transfer envelope carries:

1. `version` for the overall document.
2. `canonical` as the authoritative compact route identity.
3. `derived` as optional watch-display data.

Versioning rules:

1. Unsupported future versions are rejected.
2. Legacy version-1 web URL payloads remain migration inputs only.
3. Canonical and derived data do not version independently in this generation.

## Hydration rules

Hydration validates canonical `anchorEdgeIds` against a rebuilt route graph and returns one of three outcomes:

1. `ok`: all anchors are valid.
2. `partial`: at least one anchor is valid and at least one anchor is stale.
3. `empty`: no anchors are valid, or the canonical route is structurally empty.

Stale anchors must be surfaced explicitly. They must not be silently dropped.

## Storage and export boundaries

1. Web and iPhone persistence store canonical route identity only.
2. The watch may persist the received transfer envelope for continuity, but the watch is not the source of truth.
3. `GPX` is export only. It is not canonical persistence and not the watch transfer payload.

## Repository layout

1. `README.md` defines the shared contract rules.
2. `schema/` contains versioned JSON Schema artifacts.
3. `migrations.md` documents URL parity, local-storage parity, and migration rules.
4. `parity.md` maps fixture scenarios to current web helper behavior.
5. `tests/fixtures/route-plan/` contains JSON fixtures for valid, partial, migration, and invalid cases.