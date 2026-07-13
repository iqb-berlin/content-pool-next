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
- per-item properties such as empirical difficulty or exclusion flags.

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
- UI state starts empty, so the client falls back to sorting by task (`unitLabel`),
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

## Keyboard Interaction

The Item Explorer supports keyboard-first work for the most common navigation tasks.

## Fullscreen Mode

The Item Explorer can be opened in a dedicated fullscreen mode from the toolbar.

- The fullscreen toggle is local to the current browser session and is not stored in the shared
  explorer draft state.
- In fullscreen mode the explorer keeps the same split view, dialogs, and overlays, but hides the
  breadcrumb to maximize usable space.
- `Escape` leaves fullscreen when no dialog or overlay is currently open.

### Focus model

- `Tab` moves between toolbar, filter fields, item list, preview actions, and dialogs.
- The item list itself is a dedicated focus target. Once focused, list navigation works without
  moving focus into every single table row.
- Keyboard shortcuts are intentionally ignored while typing in inputs, selects, or textareas.

### Item list shortcuts

- `/` focuses the global item filter and selects its current content.
- `ArrowUp` / `ArrowDown` move the current item selection within the filtered result set.
- `Home` / `End` jump to the first or last visible item.
- `PageUp` / `PageDown` jump by 10 items.
- `Enter` or `Space` activates the current list selection.

### Editing shortcuts

- `Ctrl+S` / `Cmd+S` opens the existing draft save preview instead of triggering the browser's
  page-save dialog.
- In manual ordering mode, `Ctrl+ArrowUp` / `Cmd+ArrowUp` and
  `Ctrl+ArrowDown` / `Cmd+ArrowDown` move the selected item within the shared order.
- `Escape` closes the currently open overlay or dialog and returns focus to the previously active
  control when possible.

### Selection behavior

- Sorting and filtering keep the current selection as long as the selected item is still visible.
- If the selected item disappears from the current result set, the explorer falls back to the
  first visible item so keyboard navigation remains continuous.

## Supported Change Types

The client sends a `changeType` label with draft patches. This improves the usefulness of
the change log and allows operators to understand what kind of edits occurred.

Examples in the current code include:

- tag changes,
- CSV upload of empirical difficulty,
- clearing empirical difficulty,
- explicit item exclusions,
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

The import updates ACP item properties and the clean published explorer state immediately. If an
unpublished explorer draft already exists, the direct operation is rejected with a conflict so it
cannot silently overwrite or be overwritten by that draft. The caller must then use draft-aware
persistence or publish/discard the pending draft first.

### Draft-aware persistence

The import updates explorer draft state instead, allowing managers to review and publish
the result later.

The same distinction exists when clearing empirical difficulty values.

### Partial-credit rows

Difficulty CSV files may use the second column as a Sub-ID, category, or score level. The
expected shape is `item;<sub-id>;est`; the middle header may be chosen freely. Multiple rows may
refer to the same item as long as their Sub-IDs differ.

The explorer then creates one table row per Sub-ID. Every row has:

- a stable key made from the item UUID and the encoded Sub-ID,
- its own empirical difficulty,
- a visible and sortable/filterable Sub-ID column,
- the normal item preview and coding view of the underlying item.

The ACP feature configuration controls `itemSubIdLabel` (the column heading) and
`itemSubIdLabels` (display labels keyed by imported Sub-ID). Items without a Sub-ID continue to
use their item UUID as their row key and remain single rows.

Shared explorer properties, tags, manual ordering, saved response states, and personal
`rowData` preferences use the stable row key. This prevents two partial-credit rows of the same
item from overwriting one another and gives exports a unique identifier for every table row.

## Player Preview and Legacy Player Compatibility

The Item Explorer and the item detail view both embed the unit player inside an iframe and
try to focus the currently selected item automatically.

By default, the Item Explorer preview neutralizes conditional visibility logic from the VOUD so
that managers can inspect all relevant content even when the original unit would hide parts
of it behind section visibility rules or media dependencies. ACP managers can re-enable the
original conditional behavior through the ACP access-config feature flag
`enableItemExplorerConditionalVisibility`.

The preview keeps the corresponding schema fields in place with neutral default values so the
embedded Aspect player can still parse the generated unit definition reliably.

Visual item highlighting inside the embedded player can be controlled per ACP through
`enablePlayerFocusHighlight`. Newly created ACPs default this to off. Legacy ACPs keep the
previous highlighted behavior until the setting is changed explicitly.

The preview pipeline is intentionally defensive because ACPs can reference different
generations of Aspect player builds:

1. the client resolves the preview target from `sourceVariable` or `variableId`,
   optionally overridden by a per-item manual preview target from the shared explorer state,
2. `VoudService.getStartPage(...)` derives the page from the VOUD definition,
3. `VoudService.getFocusIdentifiers(...)` resolves equivalent `alias` and `id` values from
   the same VOUD element,
4. the iframe DOM is searched using both newer and older marker conventions.

ACP managers can override the preview target per item in two ways:

- select a known variable from the coding scheme,
- enter a free-text VOUD identifier or alias manually.

The override is stored as part of the shared draft/published item explorer state and can be
reset back to the standard target at any time.

The current DOM lookup covers:

- `data-element-id`
- `data-element-alias`
- `data-list-alias`
- `data-variable-id`
- `data-variable`
- `data-alias`
- `data-ref`
- `data-source-variable`
- `name`
- `id`

If none of those selectors match, the client falls back to a text-based lookup.

### Legacy page-navigation fallback

Newer Aspect players respect `playerConfig.startPage` directly. Older releases do not.

To keep previews usable with older players, the frontend sends the normal
`vopStartCommand` first and then, in paged preview modes, repeats
`vopPageNavigationCommand` with the same target page after short delays.

This fallback is applied only for paged previews:

- item detail view with `printMode = off`
- item explorer with paging modes other than `view-all` and `print-ids`

The repeated command is mainly there for older players such as `player/2.4.11`, where the
page-layout component already accepts `vopPageNavigationCommand` but the unit component still
ignores `playerConfig.startPage`.

### Compatibility guidance

- `player/2.4.11`: best effort only. Page navigation can be nudged through the fallback, but
  DOM focus is still limited because stable `data-element-*` markers are missing.
- `player/2.9.4`: reliable for normal paged preview because `startPage` and stable element
  marker attributes are both available.
- `player/2.10.0` and newer: recommended when `view-all` or print rendering also needs to be
  targetable.

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
