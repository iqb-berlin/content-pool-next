# Item Explorer

## Purpose

The Item Explorer is a shared ACP-level workspace for curating item-oriented metadata and
presentation preferences without forcing every change directly into the main ACP record.

It is one of the more advanced parts of the application because it supports:

- shared draft state,
- published state,
- version tracking,
- optimistic locking,
- change-history export,
- collaborative curation of metadata columns, tags, and item properties.

## What the Explorer Stores

The explorer state payload can include:

- UI state,
- item tags,
- metadata column visibility and order,
- manual item ordering,
- per-item properties such as empirical difficulty.

The backend stores both:

- a `publishedState`,
- a `draftState`.

## State Model

### Published state

This is the version visible to read-only viewers.

### Draft state

This is the working copy managers edit. It can diverge from the published state and is
marked as `DIRTY` when unpublished changes exist.

### Version numbers

The explorer state tracks:

- `version`
- `publishedVersion`

Manager write operations can include `baseVersion` for optimistic locking. If the server
version changed in the meantime, the backend returns a conflict instead of silently
overwriting someone else's work.

## Default Explorer State

When an ACP gets explorer state for the first time, the backend builds it from existing
ACP data:

- item tags are derived from `acp.itemProperties`,
- metadata columns are derived from normalized `featureConfig.metadataColumns`,
- UI state starts empty,
- item order starts empty,
- item properties are taken from the ACP record.

This keeps the explorer aligned with existing ACP data rather than creating a blank editor.

## Editing Workflow

Typical manager loop:

1. load current explorer state,
2. make local changes in the UI,
3. send patch operations to the draft state,
4. review the history and current draft status,
5. save draft to publish changes,
6. or discard the draft to revert to published state.

## Supported Change Types

The client sends a `changeType` label with draft patches. This improves the usefulness of
the change log and allows operators to understand what kind of edits occurred.

Examples in the current code include:

- tag changes,
- CSV upload of empirical difficulty,
- clearing empirical difficulty,
- general UI/filter/sort changes.

## Shared Metadata Column Management

The explorer can manage which metadata columns are visible and in what order.

Publishing the explorer draft updates:

- the ACP `itemProperties`,
- the ACP access-config `featureConfig.metadataColumns`.

This means column choices are not just temporary UI preferences. They become part of the
ACP's published shared configuration.

## Item Tags

Tags can come from two places:

- shared explorer state,
- existing item properties in the ACP.

The explorer normalizes tags and exposes them in the UI so managers can:

- add tags from predefined available tags,
- create inline tags,
- remove tags,
- publish the resulting tag map.

Read-only tag availability still depends on feature flags.

## Empirical Difficulty Import

Managers can upload empirical difficulty CSV data through item endpoints.

Two modes exist:

### Direct persistence

The import updates ACP item properties immediately.

### Draft-aware persistence

The import updates explorer draft state instead, allowing managers to review and publish
the result later.

The same distinction exists when clearing empirical difficulty values.

## History and Auditing

Every explorer change is written to `AcpItemExplorerChangeLog`.

Stored history data includes:

- before and after state,
- top-level diff,
- actor metadata,
- change type,
- draft and published version counters.

The frontend exposes history filtering and export, which makes the explorer especially useful
for collaborative curation work.

## Why the Explorer Exists Separately

The explorer state is intentionally not just another field on the ACP record because it needs:

- draft versus published separation,
- optimistic lock handling,
- append-only history,
- collaborative change tracking.

Those concerns are much easier to model in dedicated tables than through ad-hoc writes to
the ACP JSON payload.

## Operational Advice

Use the explorer when you want to:

- refine item ordering,
- standardize metadata columns,
- apply item tags,
- bulk-import empirical difficulty data,
- keep a history of curation activity.

Create a snapshot before a large explorer publishing step if the changes are important.

## Related Documents

- [ACP Workflows](acp-workflows.md)
- [Data Model](../architecture/data-model.md)
- [Backend Architecture](../architecture/backend.md)
