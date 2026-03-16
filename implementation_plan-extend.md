# ContentPool Next — Refined Implementation Plan for AI Agent

## Overview

This plan maps every requirement from the [ContentPool specification](https://iqb-berlin.github.io/rising-stars/content-pool/) (including [ACP-Manager](https://iqb-berlin.github.io/rising-stars/content-pool/acp-manager) and [ACP-Views](https://iqb-berlin.github.io/rising-stars/content-pool/acp-views)) to concrete implementation tasks in the existing codebase at `/Users/julian/dev/iqb/plan`.

### Current Status

| Area | Status |
|------|--------|
| Backend core (auth, users, ACP CRUD, files, snapshots, views, comments, validation, admin) | ✅ Done |
| Database (10 TypeORM entities, PostgreSQL) | ✅ Done |
| Frontend structure (routing, core services, component shells) | ✅ Scaffolded |
| Backend unit tests (6 service spec files) | ✅ Basic |
| Frontend component logic & Verona Player integration | ❌ Needs work |
| Server-to-server API | ❌ Needs work |
| E2E tests | ❌ Missing |
| Production deployment | ❌ Needs work |

---

## User Review Required

> [!IMPORTANT]
> **Prioritization**: The spec mentions a **mid-2026 prototype**. Should we prioritize:
> 1. All 5 usage scenarios equally, or focus on the most critical ones first (e.g., public access + commenting)?
> 2. Server-to-server API now, or defer to post-prototype?
> 3. Full Verona Player integration vs. a simpler preview mode?

---

## Implementation Tasks (Agent-Ready)

Below, each task block is designed for an AI coding agent: it specifies exact files, concrete changes, and acceptance criteria.

---

### Task 1: Frontend — Verona Player Unit View

**Spec requirement**: *"Eine Unit wird so angezeigt, wie sie im IQB-Testcenter im Modus run-review angezeigt wird. Es handelt sich also um einen Verona-Player, der für die Anzeige geladen werden muss."*

#### [MODIFY] [unit-view.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/unit-view/unit-view.component.ts)

- Load the Verona Player HTML from the ACP's player dependency file via an `<iframe>`
- Send `vopStartCommand` via `postMessage` with:
  - `unitDefinition` (from UNIT_DEFINITION file)
  - `sessionId`
  - `unitState` (empty or saved)
  - `playerConfig: { stateReportPolicy: "none", pagingMode: "buttons" }`
- Listen for `vopStateChangedNotification` (page navigation events)
- Implement page navigation buttons (prev/next) based on player's reported page count
- Use `run-review` mode as specified

**Acceptance criteria**:
- Unit definition file is fetched from backend `/api/acp/:acpId/files/:fileId/download`
- Player is loaded in iframe from the player file associated with the unit
- Units with multiple pages show navigation arrows
- Navigation arrows are disabled at first/last page

---

### Task 2: Frontend — Unit View Metadata/Coding Scheme/RichText Split Panel

**Spec requirement**: *"Je nach Konfiguration können weitere Daten einer Unit angezeigt werden: Metadaten, Kodierschema und RichText. Diese Daten verdecken entweder die Unit oder führen zu einer vertikalen Teilung des Bildschirmes."*

#### [MODIFY] [metadata-panel](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/metadata-panel/)

- Create tabbed panel component with 3 tabs: **Metadaten**, **Kodierschema**, **RichText**
- Panel can be toggled to either:
  - Overlay mode (covers the unit view)
  - Split-screen mode (50/50 vertical split: unit left, panel right)
- Only show tab-buttons for features enabled in `featureConfig`:
  - `showMetadata` → Metadaten tab
  - `showCodingScheme` → Kodierschema tab
  - `showRichText` → RichText tab
- Fetch metadata from `/api/view/acp/:acpId/units/:unitId/metadata`

**Acceptance criteria**:
- Button to toggle metadata panel visible only when at least one feature flag is `true`
- Split-screen mode works on desktop (≥768px), overlay on mobile
- Disabled tabs are hidden

---

### Task 3: Frontend — Item View with Scroll-to and Highlight

**Spec requirement**: *"Zusätzlich wird zu einer bestimmten Seite gesprungen und zu einer bestimmten Stelle auf der Seite geblättert, so dass das Item sichtbar wird. Außerdem wird das Item optisch hervorgehoben."*

#### [MODIFY] [item-view.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/item-view/)

- Reuse the unit-view component as base
- On load, send `vopNavigateToPage` to jump to the item's page
- After page loads, send `vopScrollToElement` with the item's DOM element ID
- Apply highlight via CSS: colored border (e.g., `3px solid #ff9800`) around the item element
- Determine item's page and position from `items[].page` and `items[].position` in ACP-Index

**Acceptance criteria**:
- Navigating to `/view/:acpId/item/:itemId` loads the parent unit, jumps to correct page, scrolls to item, and highlights it
- Clicking an item in the item list navigates to this view

---

### Task 4: Frontend — Task Sequence View with Navigation

**Spec requirement**: *"Zusätzlich sind ständig zwei Navigationspfeile 'Weiter' und 'Zurück' verfügbar. Es ist außerdem ein Button verfügbar, über den man die Liste aller Units aufruft und direkt zu einer Unit springen kann."*

#### [MODIFY] [task-sequence.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/task-sequence/)

- Fetch the sequence from `/api/view/acp/:acpId/sequences/:sequenceId`
- Display the first unit using the unit-view component
- Show persistent navigation bar with:
  - **← Zurück** button (disabled on first unit)
  - **Weiter →** button (disabled on last unit)
  - **Unit list popup** button (opens dialog with unit names, click to jump)
  - **Comment** button (if `enableCommenting` is true in featureConfig)
  - **Download ZIP** button (if `allowUnitDownload` is true)
- Track current position in sequence; update URL to reflect current unit

**Acceptance criteria**:
- All navigation buttons work correctly (incl. disabled states at edges)
- Unit list popup shows all units in the sequence
- Comment button opens comment dialog (Task 6)

---

### Task 5: Frontend — Item List with Sort/Filter/Tags

**Spec requirement**: *"Erzeugen und Anzeige einer Liste aus allen Items des ACP; sortierbar, Filter möglich, Markierungen setzen."*

#### [MODIFY] [item-list.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/item-list/)

- Fetch items from `/api/view/acp/:acpId/items`
- Display as a data table with configurable metadata columns (from `itemListMetadataColumns` feature config)
- **Sort**: Clickable column headers, toggle asc/desc/none
- **Filter**: Text search per column, combined filter bar
- **Tags**: If `enableItemListTags` is true:
  - Show tag column with multi-select from `availableTags` list
  - Tags are persisted per user (if `persistUserPreferences` and user is authenticated)
- **Click**: If `enableItemClick` is true, clicking an item row navigates to `/view/:acpId/item/:itemId`
- Visibility controlled by feature flags: `enableItemList`, `enableItemListFilter`, `enableItemListSort`, `enableItemListTags`

#### [MODIFY] [items.controller.ts](file:///Users/julian/dev/iqb/plan/backend/src/items/items.controller.ts)
- Add `PATCH /api/view/acp/:acpId/items/:itemId/tags` endpoint for saving tags per user
- Add `GET /api/view/acp/:acpId/items/preferences` for loading user-specific preferences (sort, filter, tags)
- Add `PUT /api/view/acp/:acpId/items/preferences` for saving preferences

**Acceptance criteria**:
- Item list renders with dynamic columns based on featureConfig
- Sort/filter work client-side for performance
- Tags persist across sessions for authenticated users
- Feature flags correctly hide/show UI elements

---

### Task 6: Frontend — Comment Dialog with Export

**Spec requirement**: *"Es ist möglich, diese Aufgaben und die darin enthaltenen Items zu kommentieren. Die Kommentare können dann von diesen Personen heruntergeladen werden (z. B. Xlsx)."*

#### [MODIFY] [comment-dialog](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/comment-dialog/)

- Dialog component with:
  - Text area for comment
  - Display of target type (Unit / Item / Aufgabenfolge) and target name
  - Submit button → `POST /api/view/acp/:acpId/comments`
  - Cancel button
- Comment list view showing own comments with edit/delete
- Export button → `GET /api/view/acp/:acpId/comments/export` → downloads XLSX file
- Only enabled when `enableCommenting` is true and target type is in `commentTargets`

**Acceptance criteria**:
- Comments can be created, viewed, and deleted
- XLSX export downloads correctly formatted file
- Comment dialog accessible from unit-view, task-sequence, and item-view

---

### Task 7: Frontend — ACP-Index Interactive Browser

**Spec requirement**: *"Man kann durch alle Daten des ACP-Index klicken und verlinkte Dateien anzeigen."*

#### [MODIFY] [acp-index-view.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/acp-index-view/)

- Fetch ACP-Index data from `/api/view/acp/:acpId/index`
- Render as collapsible tree view:
  - Top-level sections: Header, AssessmentParts, Units, Dependencies
  - Each node expandable to show nested data
  - File references show as clickable links:
    - PDF/ZIP → download
    - Booklet → navigate to task sequence view
    - Unit → navigate to unit view
    - Item → navigate to item view
- Optionally download ACP-Index JSON if `allowIndexDownload` is true

**Acceptance criteria**:
- All ACP-Index data is browsable
- File links navigate to correct views or trigger downloads
- Tree handles arbitrarily nested ACP-Index structures

---

### Task 8: Frontend — ACP-Manager Dashboard (ACP-Index Editing)

**Spec requirement**: *"Ansicht, Upload, Download und Ändern von Daten des ACP-Index. Der ContentPool unterstützt das Ändern von Daten des ACP-Index durch verschiedene Formulare."*

#### [MODIFY] [dashboard.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/acp-manager/dashboard/)

- Section 1: **ACP-Index Overview** — display key fields (name, description, version, assessment parts summary)
- Section 2: **ACP-Index Import/Export**
  - Upload button: `POST /api/acp/:acpId/index/import` (JSON file)
  - Download button: `GET /api/acp/:acpId/index/export`
- Section 3: **ACP-Index Editor Forms** — editable forms for key sections:
  - Header data (name, description, version, etc.)
  - Assessment parts (add/remove/edit parts and instruments)
  - Units listing (read-only, with links to file management)
  - Dependencies listing

#### [MODIFY] [acp.controller.ts](file:///Users/julian/dev/iqb/plan/backend/src/acp/acp.controller.ts)
- Add `PATCH /api/acp/:acpId/index/header` for editing header fields
- Add `PATCH /api/acp/:acpId/index/parts` for editing assessment parts
- These endpoints merge partial updates into the existing JSONB

**Acceptance criteria**:
- Import overwrites existing ACP-Index (with defaults applied for missing required fields)
- Form edits persist immediately and are reflected in the index
- Export downloads valid JSON matching `acp-index@0.5` schema

---

### Task 9: Frontend — Access Configuration UI

**Spec requirement**: *"Der ACP-Manager kann einen Nur-Lese-Zugriff auf das ACP erteilen"* with 3 access models and 16+ feature flags.

#### [MODIFY] [access-config.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/acp-manager/access-config/)

- **Access Model Selection**: Radio buttons for Public / Registered Users / Credentials List
  - Options 1 and 3 are mutually exclusive (enforce in UI)
  - Option 2 can be combined with either
- **Credentials Management** (if model 3):
  - Upload credentials CSV/list
  - Set valid_from and valid_until dates (max 3 months)
  - View/delete existing credential entries
- **Registered User Assignment** (if model 2):
  - Search and add users with READ_ONLY role
  - List and remove existing read-only users
- **Feature Flag Toggles** — grouped into sections:
  - **Downloads**: allowIndexDownload, allowUnitDownload, allowFileDownload
  - **Unit View**: enableUnitView, showMetadata, showRichText, showCodingScheme
  - **Navigation**: enableUnitListNavigation, enableSequenceNavigation
  - **Commenting**: enableCommenting, commentTargets (checkboxes: UNIT, ITEM, TASK_SEQUENCE)
  - **Item List**: enableItemList, itemListMetadataColumns (multi-select), enableItemClick, enableItemListFilter, enableItemListSort, enableItemListTags, availableTags (editable list), persistUserPreferences

**Acceptance criteria**:
- Mutual exclusion of Public and Credentials models is enforced
- Feature flags save and are reflected in read-only views
- Credentials time limit is validated (max 3 months)

---

### Task 10: Backend — Server-to-Server API

**Spec requirement**: *"Kommunikation zwischen Servern... auf einen ContentPool zuzugreifen: Login, verfügbare ACP auflisten, ACP oder Teile davon in beide Richtungen transferieren."*

#### [MODIFY] [api.controller.ts](file:///Users/julian/dev/iqb/plan/backend/src/api/api.controller.ts)
#### [MODIFY] [api.service.ts](file:///Users/julian/dev/iqb/plan/backend/src/api/)

- `POST /api/server/auth` — API key authentication for server clients
- `GET /api/server/acp` — List available ACPs for the authenticated server
- `GET /api/server/acp/:acpId/export` — Export complete ACP (Index + files as ZIP)
- `POST /api/server/acp/import` — Import ACP from ZIP (creates or updates)
- `GET /api/server/acp/:acpId/files` — List files for transfer
- `GET /api/server/acp/:acpId/files/:fileId` — Download individual file
- `POST /api/server/acp/:acpId/files` — Upload file to ACP

**Acceptance criteria**:
- Server-to-server auth uses API keys (not JWT)
- Export produces a valid ZIP containing ACP-Index JSON + all files
- Import creates ACP if not exists, or updates if `packageId` matches
- Bidirectional: both push and pull supported

---

### Task 11: Frontend — Landing Page Polish

**Spec requirement**: *"Hauptseite des ContentPools. Dann ist auf dieser Seite eine Liste zu finden von allen für die Öffentlichkeit freigegebenen ACP."*

#### [MODIFY] [landing.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/landing/)

- Fetch and display app settings (logo, landing page HTML, theme)
- List all public ACPs + credential-based ACPs (with login indicator)
- Each ACP card shows: name, description, access model badge
- Public ACPs: clicking navigates directly to ACP start page
- Credential ACPs: clicking navigates to credential login page
- App-wide navigation header with login button for registered users

**Acceptance criteria**:
- Landing page reflects admin-configured theme, logo, and texts
- ACPs are correctly categorized by access model
- Navigation between landing → login → ACP is seamless

---

### Task 12: Backend & Frontend — ACP-Start Page Deep Links

**Spec requirement**: *"Über eine Url kann man zu folgenden Orten eines ContentPools gelangen: ACP-Startseite, eine bestimmte Aufgabenfolge, eine bestimmte Unit, ein bestimmtes Item."*

#### [MODIFY] [acp-start.component.ts](file:///Users/julian/dev/iqb/plan/frontend/src/app/views/acp-start/)

- Direct URL access to: `/view/:acpId`, `/view/:acpId/unit/:unitId`, `/view/:acpId/sequence/:seqId`, `/view/:acpId/item/:itemId`
- ACP start page shows:
  - ACP name, description
  - Links to "Aufgabenfolgen" (if `enableSequenceNavigation`)
  - Links to "Alle Units" (if `enableUnitListNavigation`)
  - Links to "Itemliste" (if `enableItemList`)
  - Link to "ACP-Index" (always available)
- Breadcrumb showing: ContentPool → ACP → [current view] with back navigation
- Access guard redirects unauthenticated users for non-public ACPs

**Acceptance criteria**:
- All deep links work even without prior context
- Feature flags control which sections are visible on ACP start page
- Breadcrumbs work correctly across all views

---

### Task 13: Backend — E2E Tests

#### [NEW] [test/](file:///Users/julian/dev/iqb/plan/backend/test/)

Write E2E tests covering the 5 manual verification journeys:

1. **Admin Journey**: Login as admin → create user → create ACP → assign ACP-Manager
2. **ACP-Manager Journey**: Login → upload ACP-Index → upload files → check validation → create snapshot → configure access
3. **Public Access**: List public ACPs → browse unit → view task sequence
4. **Credential Access**: Credential login → view restricted ACP → download files
5. **Commenting Journey**: Login → view units → create comment → export comments

**Run with**:
```bash
cd /Users/julian/dev/iqb/plan/backend && npm run test:e2e
```

**Acceptance criteria**:
- All 5 journeys pass
- Tests run against a test database (separate from dev)

---

### Task 14: Production Deployment

#### [MODIFY] [docker-compose.prod.yml](file:///Users/julian/dev/iqb/plan/docker-compose.prod.yml)
#### [MODIFY] [nginx/](file:///Users/julian/dev/iqb/plan/nginx/)

- Multi-stage Docker build for both frontend and backend
- nginx config (SPA routing, API proxying, gzip, caching)
- Environment variables for JWT_SECRET, DB credentials, file storage path, API keys
- Health checks for all services

**Acceptance criteria**:
- `docker compose -f docker-compose.prod.yml up --build` starts all services
- Frontend at `/`, API at `/api`, Swagger at `/api/docs`
- nginx properly handles SPA routing (404 → index.html)

---

## Implementation Order for AI Agent

The agent should work through these tasks in this order, since each builds on previous ones:

| Order | Task | Dependencies | Size |
|-------|------|-------------|------|
| 1 | Task 11: Landing Page Polish | None | S |
| 2 | Task 12: ACP-Start Page + Deep Links | Task 11 | S |
| 3 | Task 9: Access Config UI | None | M |
| 4 | Task 8: ACP-Manager Dashboard | Task 9 | M |
| 5 | Task 1: Verona Player Unit View | Task 12 | L |
| 6 | Task 2: Metadata/CodingScheme Panel | Task 1 | M |
| 7 | Task 4: Task Sequence Navigation | Task 1 | M |
| 8 | Task 3: Item View with Highlight | Task 1 | M |
| 9 | Task 5: Item List Sort/Filter/Tags | Task 8 | L |
| 10 | Task 6: Comment Dialog + Export | Task 7 | M |
| 11 | Task 7: ACP-Index Browser | Task 12 | M |
| 12 | Task 10: Server-to-Server API | None | L |
| 13 | Task 13: E2E Tests | Tasks 1–12 | L |
| 14 | Task 14: Production Deployment | All | S |

> [!TIP]
> Each task can be implemented as an independent PR or work session. The agent should verify each task compiles and basic functionality works before moving to the next.

---

## Verification Plan

### Automated Tests

#### Existing backend tests:
```bash
cd /Users/julian/dev/iqb/plan/backend && npm test
```
Tests exist for: `auth.service`, `users.service`, `acp.service`, `files.service`, `snapshots.service`, `validation.service`

#### Frontend build check:
```bash
cd /Users/julian/dev/iqb/plan/frontend && npx ng build
```

#### E2E tests (Task 13):
```bash
cd /Users/julian/dev/iqb/plan/backend && npm run test:e2e
```

### Manual Verification

For each frontend task, verify in the browser by starting the dev servers:
```bash
# Terminal 1: Database
docker compose up db -d

# Terminal 2: Backend
cd /Users/julian/dev/iqb/plan/backend && npm run start:dev

# Terminal 3: Frontend
cd /Users/julian/dev/iqb/plan/frontend && npx ng serve
```
Then visit `http://localhost:4200` and test the relevant views.

The 5 user journeys from the spec should be tested end-to-end:
1. Visit landing page → see public ACPs → click through to unit view
2. Login as admin → create ACP → configure access → verify feature flags
3. Login as ACP-Manager → upload files → create snapshot → view diff
4. Credential login → browse ACP → download files
5. Login → add comment to unit → export comments as XLSX
