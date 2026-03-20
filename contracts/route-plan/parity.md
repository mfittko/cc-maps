# Route Plan Parity Evidence

This document ties the shared contract fixtures to current shipped web behavior.

## Behavioral references

1. `lib/route-plan.js` defines canonical payload shape, storage parity, URL encoding, legacy v1 migration, and hydration semantics.
2. `lib/route-graph.js` defines deterministic node and edge identifiers.
3. `lib/planning-mode.js` defines destination participation derived from selected anchors.
4. `lib/route-export.js` keeps GPX export separate from canonical persistence.

## Fixture mapping

| Fixture | Purpose | Current web rule exercised |
| --- | --- | --- |
| `canonical-single-destination.v2.json` | Happy-path canonical route in one destination | Compact v2 canonical shape, anchor ordering, canonical-only persistence |
| `canonical-primary-plus-preview-sector.v2.json` | Happy-path canonical route that spans a nearby preview sector | Primary-first unique `destinationIds`, bounded multi-destination participation |
| `transfer-derived-watch.v2.json` | Valid transfer envelope with derived watch data | Canonical-versus-derived separation and watch-display convenience shape |
| `hydration-partial-stale.v2.json` | Partial hydration with one stale anchor | `partial` semantics and stale-anchor visibility |
| `canonical-empty-anchors.v2.json` | Structurally valid empty route | `empty` hydration semantics for empty canonical route |
| `legacy-url-v1-migration.json` | Legacy compact URL migration | Version 1 decode path into current version 2 canonical shape |
| `normalization-duplicate-destination-ids.json` | Duplicate and misordered destination ids as migration input | Destination-id normalization to primary-first unique ids |
| `invalid-future-version.json` | Unsupported future version rejection | Reject unsupported versions rather than guessing |
| `invalid-bad-destination-ids.json` | Invalid numeric-string destination ids | Reject malformed canonical payloads |
| `invalid-empty-anchor-entry.json` | Empty anchor identifier rejection | Reject malformed anchor lists consistently across storage and URL semantics |
| `focus-change-stable-owner.v2.json` | Browse-focus change does not mutate canonical route owner | `destinationId` and owner-first `destinationIds` are unchanged after a focus change; Option A invariant |
| `duplicate-edge-ids-parallel.v2.json` | Parallel edge IDs with `:2` suffix round-trip unchanged | Suffixed edge ids survive compact URL encoding and local-storage round-trips without modification |

## Parity conclusions

1. Canonical route identity remains exactly `version`, `destinationId`, `destinationIds`, and `anchorEdgeIds`.
2. Anchor order remains authoritative and user-visible.
3. Deterministic edge ids remain graph-derived coordinate-pair ids from `lib/route-graph.js`.
4. Hydration remains strictly `ok`, `partial`, or `empty`.
5. `GPX` remains derived export output and is outside the contract boundary.
6. `destinationId` is the stable route owner for the lifetime of a route. Browse-focus changes (selected destination) are derived, non-canonical UI state and must not mutate canonical route identity.
7. Parallel edge IDs with suffixes such as `:2` are valid anchor identifiers and must survive all persistence, URL, and hydration paths unchanged.