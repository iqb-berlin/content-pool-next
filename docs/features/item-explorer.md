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

## Performance and load diagnostics

The main Explorer load costs are the initial XML/VOMD/VOCS parsing and, for the first preview of a
unit, resolving the unit dependencies plus downloading the Player HTML and VOUD definition.
Response-state lookup remains item-specific.

The backend keeps bounded in-process caches for file catalogs, parsed and fully numbered item lists,
and resolved unit views. The database validates file catalogs with a compact aggregate signature
over file identity, checksum, size, path, and upload timestamp; complete file records are loaded only
after that signature changes. Item-list keys use that file signature, the relevant feature
configuration, and the active and published Explorer version tokens. Numbered results additionally
use an aggregate revision of the persisted row-number assignments. Unit-view keys include the file
signature, unit ID, and the lightweight version of the active or published Explorer state for the
requested perspective.

File mutations proactively invalidate the local process while the database signatures detect
changes made by another backend process. Each cache is limited to 100 least-recently-used entries.
Identical in-flight catalog, parse, and numbering work shares one Promise, and failed computations
are never retained.

The browser keeps the resolved unit, Player HTML, and definition for the lifetime of the Explorer
route. Selecting another item in the same unit reuses the existing iframe and assets and requests
only the item's response state. Concurrent requests for the same unit share one in-flight load.

| Interaction                           | Before                                           | After the first successful unit load |
| ------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| Select another item in the same unit  | Unit view + response state + Player + definition | Response state only                  |
| Repeat an unchanged item-list request | Parse every referenced source file               | Signature check + cached parse       |
| Repeat an unchanged file download     | Full response body                               | Browser cache or conditional `304`   |

The UI shows an immediate loading state. If a list or preview phase exceeds 1.5 seconds, it adds a
polite hint that WLAN or VPN latency may be involved. The hint disappears as soon as the current
request settles and is not carried over to the next selection.

Backend responses expose `Server-Timing` entries for file-signature and Explorer-version reads,
source reads, parsing, row-number revision and assignment, total endpoint time, parsed-cache status,
and numbered-result cache status. File downloads additionally use private `ETag` caching. Calls over
1.5 seconds produce a structured `item-explorer-slow-load` warning containing the ACP ID, phase,
duration, and cache status, but no item or file contents.

For detailed browser measurements, enable diagnostics in the browser console and reload the
Explorer:

```js
localStorage.setItem("cp.itemExplorer.performance", "1");
```

The console then reports `item-list`, `item-selection-total`, `unit-view`, `response-state`,
`player-html`, `definition`, and `player-ready` measurements. They are also available as Performance
API measures named `item-explorer:<phase>`. With diagnostics disabled, the browser retains only the
latest measure per phase. With diagnostics enabled, measures remain bounded to 100 entries per
phase. Disable the console output with:

```js
localStorage.removeItem("cp.itemExplorer.performance");
```

### Performance acceptance baseline

The reproducible local benchmark compares the working tree with commit `c85fcf3` on the same
PostgreSQL instance and synthetic fixture of 50 units, 2,000 items, and 151 files. Warm measurements
alternate baseline and candidate over five independent backend starts and collect 30 requests per
endpoint and start. Cold measurements likewise alternate both variants.

The acceptance thresholds distinguish the direct technical endpoint from the user-visible reuse
path:

- warm item-list median improves by at least 50%,
- warm direct unit-view median improves by at least 40%,
- a second selection in the same unit improves by at least 30% and requests response state only,
- the same-unit browser path remains below 500 ms median and 1.5 seconds p95,
- cold item-list median regresses by no more than 15%,
- optimized warm p95 values remain below 1.5 seconds,
- response bodies remain identical and conditional file requests return `304` without a body.

The absolute browser-duration limits are evaluated only in the dedicated counterbalanced browser
benchmark described below. The regular Playwright suite gates the stable functional invariant
instead: the first preview issues exactly one unit-view request and two asset requests, and further
selections in that unit request response state only. This avoids coupling CI correctness to the load
of an individual runner.

Prepare the reference revision as a worktree with backend and frontend dependencies installed. Then
run the complete counterbalanced browser benchmark from the candidate checkout:

```bash
ITEM_EXPLORER_BENCHMARK_BASELINE_ROOT=/path/to/c85fcf3-worktree \
  npm run benchmark:item-explorer
```

Run this command from the candidate checkout's `frontend/` directory. The runner creates one
PostgreSQL container and alternates which variant starts each of six paired rounds. Before every
start it recreates the same synthetic fixture of 50 units, 2,000 items, and 151 files, then records
40 warm same-unit selections. The validator aggregates all 240 samples per variant, calculates the
median as the mean of the two middle samples, calculates p95 by nearest rank, and fails unless the
candidate improves the median by at least 30%, remains below 500 ms median, and remains below 1.5
seconds p95.

Raw runs and `summary.json` are written to a timestamped directory below
`frontend/benchmark-results/`. Set `ITEM_EXPLORER_BENCHMARK_RUNS` to override the default of six
paired runs; the value must remain even so both variants occupy each start position equally often.
The runner verifies that the baseline worktree has no tracked changes and is checked out at
`c85fcf3`; set `ITEM_EXPLORER_BENCHMARK_BASELINE_REVISION` when intentionally comparing against
another reference. The benchmark spec and configuration live outside the regular Playwright test
directory and are therefore not part of `npm run e2e` or CI.

The direct unit-view threshold is intentionally 40% rather than 50% because every request still
performs current authorization and cross-process database-revision checks. Those correctness checks
must not be replaced with stale process-local authorization data merely to cross a sub-millisecond
benchmark boundary.

The reference run on 2026-07-17 produced these results:

| Path                              | Baseline median | Optimized median | Improvement |
| --------------------------------- | --------------: | ---------------: | ----------: |
| Warm item list                    |        52.55 ms |         22.49 ms |      57.21% |
| Warm direct unit view             |        14.11 ms |          7.16 ms |      49.27% |
| Second selection in the same unit |       336.33 ms |        167.19 ms |      50.29% |

The cold item-list median increased by 8.60%, warm p95 values were 38.29 ms for the item list and
14.72 ms for unit view, and all compared response bodies remained equal. Across five candidate
starts, 100 conditional downloads returned `304` and transferred no body bytes.

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

## Personal Working Data

When `enablePersonalItemData` is enabled, every authenticated user and every credential login can
maintain three private fields for each Explorer row:

- one category (commonly a competence level),
- zero or more configured colored markers,
- one plain-text note.

ACP managers configure the category label and allowed values as well as marker labels and colors in
the access configuration. Notes use a plain textarea and are never interpreted as Markdown or HTML.
Clearing a field removes it from the stored row data.

Personal working data is stored separately from the shared draft/published Explorer state in
`acp_item_preferences`, under the `item-explorer` view. Normal users are scoped by user ID and
credential logins by their stable credential ID. Consequently, publishing, discarding, or previewing
the shared Explorer draft never exposes or modifies another person's working data. The personal
controls remain usable from both manager and read-only perspectives.

Personal column filters are local to the current browser view and are excluded from the shared
Explorer UI state. Row edits use an atomic row-level endpoint, so saves from different browser tabs
cannot replace unrelated rows. The Explorer keeps failed edits pending, exposes the save error, and
blocks navigation until the pending personal changes have been saved successfully. If the session
expires during a save, pending rows are suspended in session storage with an application-session
memory fallback and hidden. They are merged back after the same stable identity signs in again, but
discarded when a different identity signs in.

The backend accepts non-empty personal data only for row keys that exist in the active Explorer
item list. Managers are validated against the draft and read-only or credential viewers against the
published state. Stale rows can still be deleted after their source item disappears. Each personal
preference record is additionally limited to 10,000 rows.

The map is keyed by the stable row key, so partial-credit rows of the same item keep independent
categories, markers, and notes.

Authenticated users can export their currently filtered and sorted Explorer list as XLSX. The
backend resolves only the caller's own personal preference record and combines it with the active
Explorer perspective. The export includes the visible order, unit and item identifiers, configured
marker colors, note, competence level, empirical item difficulty, and the mean empirical difficulty
of the unit when at least one value is available. Missing personal or difficulty values remain empty
cells.

ACP managers and application admins can additionally download one ACP-wide CSV from the Explorer
toolbar. The endpoint rejects read-only users, credential logins, and public access. It exports every
stored personal row across participants, using a stable participant identifier and including unit,
item, Sub-ID, stable row key, category, tags, note, empirical difficulty, and mean unit difficulty.
When present, both personal and manager exports also contain Infit, discrimination, solution rate,
item/stimulus times, and paired booklet positions.
Participants without stored rows are skipped without failing the export. Note line breaks are
written as literal `\\n` sequences so every personal entry remains on one CSV row.

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

### Wide item-parameter import

Managers can also upload a semicolon-separated wide CSV through the Item Explorer. Its canonical
headers are `item`, `sub_id`, `est`, `infit`, `discrimination`, `solution_rate`, `item_time_s`,
`stimulus_time_s`, `booklet`, and `position`. Only `item` and at least one parameter column are
required. Time values are non-negative seconds; decimal point and decimal comma are accepted.

Repeated rows for the same item/Sub-ID represent booklet occurrences. Scalar values on those rows
must agree, while `booklet` and `position` are collected as ordered 1:n metadata on the stable
Explorer row. The occurrence columns must always be supplied and filled together. Columns that are
absent leave stored values unchanged; a supplied but empty value clears that parameter in its
defined scope:

- difficulty, Infit, discrimination, solution rate, and booklet occurrences belong to the stable
  Explorer row,
- item time belongs to the underlying item UUID and is shared by its partial-credit rows,
- stimulus time belongs to the complete unit and is shared by all of its item rows.

When repeated rows address the same item or unit, one distinct non-empty time value is applied to
the complete scope and blank repetitions are ignored. If every supplied value in that scope is
blank, the stored value is cleared. Different non-empty values in one scope are rejected as a
conflict before any item property is changed. A standard row fans row-scoped values out to existing
partial-credit rows; importing explicit Sub-IDs does not delete other partial-credit rows.

Infit, discrimination, solution rate, item time, stimulus time, booklet, and position are built-in
configurable Explorer columns. Numeric columns use numeric filtering and sorting. Booklet and
position filters are paired, so a row only matches two simultaneous filters when one occurrence
satisfies both.

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

## Personal Item Collections

When `enableItemCollections` is enabled, authenticated users and credential identities can maintain
multiple named collections. Collections are stored in the existing `acp_item_preferences` JSONB
record under the `item-explorer` view and are never exposed to other participants or managers.
Every collection stores an ordered list of stable row keys and an optimistic-lock version.
Non-manager collection access additionally requires the Item Explorer item list to be enabled.

The leading duration is combined test time: item time is counted once per underlying item UUID and
stimulus time once per selected unit. Selecting several partial-credit rows therefore does not
multiply either time. The UI continues to show the known subtotal when data is incomplete and
reports how many item and unit time values are missing. Stale row keys remain removable but are
excluded from totals and exports.

Collections can be created, renamed, cleared, deleted, and exported as semicolon-separated UTF-8
CSV. Up to 100 named collections can be stored per identity and ACP. Direct generation of ACP
booklets or task sequences is intentionally outside this feature.

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
