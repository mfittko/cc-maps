# Route Plan Migrations And Hydration

## Current web parity

The shipped web app defines the current parity baseline.

### URL encoding parity

Current version `2` compact URL form:

`version|destinationId|destinationIds joined by ';'|anchorEdgeIds joined by ','`

Example:

`2|100|100;200|10.750000:59.910000~10.760000:59.910000,10.760000:59.910000~10.770000:59.910000`

Legacy version `1` compact URL form:

`version|destinationId|anchorEdgeIds joined by ','`

Legacy version `1` payloads migrate into the version `2` canonical shape by setting `destinationIds` to `[destinationId]`.

### Local storage parity

The web app stores canonical route JSON only.

Destination-scoped storage key format:

`cc-maps:settings:plan:<destinationId>`

Current persisted payload fields:

1. `version`
2. `destinationId`
3. `destinationIds`
4. `anchorEdgeIds`

## Hydration behavior

Hydration validates canonical anchor ids against a rebuilt route graph.

Hydration does not treat traversal details, connector segments, route summaries, or direction features as canonical input.

### Outcome semantics

1. `ok`: all anchor ids resolve in the graph.
2. `partial`: some anchor ids resolve and some are stale.
3. `empty`: no anchor ids resolve, or the route is structurally empty.

### Stale-anchor rules

1. Valid anchors remain in original order.
2. Stale anchors are reported explicitly.
3. All-stale routes remain distinguishable from a user-created empty route through hydration result metadata and caller context.
4. If no route graph is available, anchors are treated as stale rather than guessed.

## Normalization expectations

Canonical outputs must normalize destination ids to:

1. numeric strings only
2. unique values only
3. primary destination first

Duplicate or misordered destination ids may appear as migration inputs, but they must not survive as canonical output.

## Unsupported inputs

The shared contract rejects:

1. unsupported future versions
2. malformed destination ids
3. empty anchor identifiers
4. coordinate-heavy payloads presented as canonical state

## Browse-focus changes are not migrations

Canonical route identity is not affected by browse-focus changes. This is Option A from RFC mfittko/cc-maps#44 and is a no-migration decision.

1. Changing the selected destination in the UI is a browse-focus change, not a route-owner change.
2. A focus change must not mutate canonical `destinationId`.
3. A focus change must not reorder `destinationIds` or alter `anchorEdgeIds`.
4. No storage-key migration, no URL share-format migration, and no watch-envelope redesign is required when focus changes.
5. Implementations must distinguish `destinationId` (stable route owner, fixed at route creation) from the currently selected or focused destination (derived UI state).

## Export boundary

`GPX` remains export output generated from resolved route features.

It is not:

1. canonical route persistence
2. URL share state
3. watch transfer state