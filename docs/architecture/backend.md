# Backend Architecture

## Stack

The backend is a NestJS 11 application using TypeORM against PostgreSQL. It exposes
one REST API under the `/api` prefix and provides both interactive browser endpoints
and a separate server-to-server integration surface.

Primary backend concerns:

- authentication and authorization,
- ACP CRUD and access management,
- file upload, download, and ZIP export,
- ACP index import/export,
- semantic and syntactic validation,
- snapshot creation and restore,
- item explorer shared draft state,
- server API integration and audit logging.

## Bootstrap and Global Behavior

The application starts in [`backend/src/main.ts`](../../backend/src/main.ts).
Important global behavior:

- global route prefix: `/api`,
- request validation via `ValidationPipe`,
- CORS enabled from `CORS_ORIGIN`,
- Swagger enabled outside production by default, or explicitly through `SWAGGER_ENABLED=true`,
- port defaults to `3000`.

The root module is [`backend/src/app.module.ts`](../../backend/src/app.module.ts). It
loads the global `ConfigModule`, configures TypeORM, and imports the functional modules.

## Module Layout

### Auth module

Files under `backend/src/auth` handle the three authentication modes:

- local username/password login,
- OIDC login callback and role synchronization,
- ACP credential-list login.

Key pieces:

- `AuthController` exposes `/auth/login`, `/auth/credential-login`,
  `/auth/oidc-config`, `/auth/oidc-callback`, `/auth/profile`, and logout endpoints.
- `JwtAuthGuard` protects authenticated routes.
- `RolesGuard` enforces `APP_ADMIN` and `ACP_MANAGER` style role checks.
- `OidcAuthGuard` is used on admin endpoints to require OIDC-backed sessions.
- `AcpAccessGuard` makes ACP-specific access decisions and supports optional auth.

### Users module

The users module is app-admin only. It manages local users, profile data, and app-admin
status. OIDC users are represented in the local `users` table as linked accounts with
an optional `oidcSub`.

### Admin module

The admin module manages global application settings, including:

- theme variables,
- language,
- logo URL,
- landing page HTML,
- imprint, privacy, and accessibility HTML,
- default ACP index content.

### ACP module

This is the core manager API. It handles:

- ACP creation and deletion,
- ACP metadata updates,
- ACP index read/write/import/export,
- ACP role assignment,
- ACP access configuration,
- credential list upload and maintenance,
- metadata column configuration,
- item explorer draft endpoints.

### Files module

The files module is responsible for:

- multi-file uploads,
- file metadata persistence,
- download endpoints,
- unit and sequence ZIP export,
- unit-view extraction from uploaded files,
- item-list extraction from `.vomd` files,
- cleanup after overwrites or deletions.

Uploaded binaries live on disk. The database stores metadata, checksum, validation
results, and ACP linkage.

### Validation module

Validation runs in two layers:

- syntactic/schema checks on individual files,
- semantic ACP-wide consistency checks across index references and uploaded files.

This module is called automatically after uploads and can also be triggered through
manager endpoints such as unit validation.

### Snapshots module

Snapshots persist a point-in-time copy of the ACP index together with snapshot file
metadata. Managers can:

- create snapshots,
- list and inspect snapshots,
- diff snapshots,
- compare snapshots with current state,
- restore a snapshot,
- delete snapshots.

### Views module

This module powers the read-only browser experience under `/api/view`. It serves:

- public settings,
- public ACP list,
- ACP landing/start data,
- unit, item, sequence, and index views,
- persisted item preferences for non-manager viewers.

This module depends heavily on `AcpAccessGuard` and ACP feature flags.

### Items module

The items module supports:

- filtered item listing,
- single-item lookup,
- persisted item tags,
- empirical difficulty CSV import,
- response-state persistence and fallback retrieval.

It also integrates with Item Explorer draft mode so managers can test item-property
changes before publishing them.

### Item Explorer module

The item explorer state service manages a separate draft/published model for shared ACP
view state. It keeps:

- UI preferences,
- item tags,
- metadata column selection and order,
- manual item ordering,
- item properties such as empirical difficulty.

It also tracks version numbers and a change log to support optimistic locking and
manager collaboration.

### Server API module

The server API lives under `/api/server` and is intentionally separate from browser
auth. It supports scoped token-based access for:

- ACP listing,
- transfer export,
- ACP import,
- ACP index read/write,
- file listing/download/upload,
- coding scheme replacement,
- audit-log retrieval.

### Health module

Health endpoints are intentionally simple:

- `/api/health/live` checks process liveness,
- `/api/health/ready` verifies database readiness with `SELECT 1`.

## Authorization Model in the Backend

The backend has two overlapping authorization systems:

### Global user roles

- `APP_ADMIN`
- `ACP_MANAGER`
- `READ_ONLY`

`APP_ADMIN` is global. ACP roles are attached per ACP.

### ACP access models

ACP read access can also be granted through an access configuration:

- `PRIVATE`
- `PUBLIC`
- `REGISTERED`
- `CREDENTIALS_LIST`

In current application behavior, newly created ACPs start with `PRIVATE`. The
`REGISTERED` label is mainly used as an effective frontend state for authenticated users
with ACP roles, while the persisted base configuration is typically `PRIVATE`, `PUBLIC`,
or `CREDENTIALS_LIST`.

The `AcpAccessGuard` considers:

1. app-admin status,
2. credential-token ACP match,
3. ACP role assignment,
4. public fallback.

Managers and admins typically bypass read-only feature restrictions.

## Persistence Boundaries

The backend uses PostgreSQL for metadata and the filesystem for uploaded files.

Stored in PostgreSQL:

- users,
- ACP records,
- ACP access config and credentials,
- ACP role assignments,
- snapshots,
- comments,
- item response state,
- item explorer draft state and change log,
- server API audit logs,
- global app settings.

Stored on disk:

- uploaded ACP files,
- files bundled into generated ZIP downloads at request time.

## Database Initialization Strategy

TypeORM is configured dynamically:

- in development, schema synchronization defaults to enabled,
- in production, migrations are expected and `DB_SYNCHRONIZE` should remain `false`,
- `DB_RUN_MIGRATIONS=true` triggers startup migration execution when synchronization is off.

This makes development convenient while keeping production schema changes explicit.

## Backend Conventions Worth Knowing

- DTO validation is used consistently on write endpoints.
- Many ACP-specific settings are stored as JSONB, not as deeply normalized tables.
- Download URLs sometimes accept `auth_token` query parameters to support direct browser downloads.
- Server API tokens are compared with `timingSafeEqual`.
- OIDC uses an internal issuer URL for backend validation and a public issuer URL for browser redirects.
- Snapshot and Item Explorer workflows both favor append-only history over destructive edits.

## Related Documents

- [Architecture Overview](overview.md)
- [Data Model](data-model.md)
- [Access Control](../features/access-control.md)
- [Integrations and API](../features/integrations-and-api.md)
