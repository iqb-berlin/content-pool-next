# Integrations and API

## API Surfaces

The backend exposes three broad API surfaces:

### 1. Browser-facing management API

Main prefix:

```text
/api
```

Examples:

- `/api/auth/...`
- `/api/users/...`
- `/api/admin/...`
- `/api/acp/...`

### 2. Read-only view API

Main prefix:

```text
/api/view
```

This surface supports public and restricted viewers and is used heavily by the Angular read-only pages.

### 3. Server-to-server API

Main prefix:

```text
/api/server
```

This surface is token-scoped and meant for system integration rather than browser use.

## Swagger

When Swagger is enabled, API documentation is exposed at:

```text
/api/docs
```

In production this is disabled by default unless `SWAGGER_ENABLED=true`.

## Management API Areas

The main authenticated API groups are:

- `/api/auth`
- `/api/users`
- `/api/admin`
- `/api/acp`
- `/api/acp/:acpId/files`
- `/api/acp/:acpId/snapshots`
- `/api/acp/:acpId/comments`
- `/api/acp/:acpId/items`

These endpoints expect the application JWT, not a server API token.

## Read-Only View API Areas

The `/api/view` surface covers:

- public settings,
- public ACP listing,
- ACP start page,
- units and sequences,
- items and item preferences,
- ACP index,
- item explorer state for viewers.

These endpoints rely on ACP-level access logic and can work for:

- anonymous viewers,
- authenticated users,
- credential viewers.

## Server API Authentication

The server API uses either:

- `X-Server-Token: <token>`
- `X-Integration-Token: <token>`
- `Authorization: Bearer <token>`

The token is first validated against database-backed application tokens managed
through the admin API. For compatibility and bootstrap setups, the backend can
also validate configured clients from `SERVER_API_TOKENS` or the legacy
`SERVER_API_KEY`.

Application token secrets are only returned once when they are created. The
backend stores a hash and a short display prefix, not the clear-text token.

### Manage application tokens

Admins can manage application tokens in the UI under **Token**
(`/admin/application-tokens`) or through the admin API.

Admin-only endpoints:

```text
GET   /api/admin/application-tokens?limit=50&offset=0
POST  /api/admin/application-tokens
PATCH /api/admin/application-tokens/:id/revoke
```

Example create payload:

```json
{
  "name": "studio",
  "scopes": ["acp.read", "transfer.read", "files.read"],
  "expiresAt": "2099-01-01T00:00:00.000Z"
}
```

The create response includes the one-time `token` field. Store it immediately in
the external application.

Create and revoke actions are written to the audit log as admin security events.
The audit details include the token ID, name and display prefix, but never the
clear-text token.

## Server API Scopes

Supported scopes:

- `acp.read`
- `transfer.read`
- `transfer.write`
- `index.read`
- `index.write`
- `files.read`
- `files.write`
- `audit.read`

Each endpoint declares the required scope through the `ServerApiScopes` decorator.

## Main Server API Workflows

### List ACPs

Endpoint:

```text
GET /api/server/acp
```

Scope:

- `acp.read`

Use case:

- discover transferable ACPs and their latest update timestamp.

### Export full ACP transfer payload

Endpoints:

```text
GET /api/server/acp/:acpId
GET /api/server/acp/:acpId/export
```

Scope:

- `transfer.read`

Returned payload includes:

- ACP metadata,
- current index,
- file metadata list.

### Read ACP index only

Endpoint:

```text
GET /api/server/acp/:acpId/index
```

Scope:

- `index.read`

### Update ACP index

Endpoint:

```text
PUT /api/server/acp/:acpId/index?strategy=overwrite|merge
```

Scope:

- `index.write`

Supports:

- overwrite behavior,
- deep merge behavior,
- optimistic concurrency using `expectedUpdatedAt`.

### List or download files

Endpoints:

```text
GET /api/server/acp/:acpId/files
GET /api/server/acp/:acpId/files/:fileId
GET /api/server/acp/:acpId/files/:fileId/download
```

Scope:

- `files.read`

### Upload files

Endpoint:

```text
POST /api/server/acp/:acpId/files/upload?conflictStrategy=reject|overwrite|keep-both
```

Scope:

- `files.write`

### Replace coding schemes

Endpoint:

```text
POST /api/server/acp/:acpId/coding-schemes/replace
```

Scope:

- `files.write`

This workflow is more specialized than a normal upload because it:

- targets `.vocs` replacement by filename,
- can create a new snapshot,
- supports optimistic concurrency and changelog metadata.

### Import or update an ACP

Endpoints:

```text
POST /api/server/acp/import
POST /api/server/acp
```

Scope:

- `transfer.write`

The second endpoint is kept as a legacy alias.

### Read server API audit logs

Endpoint:

```text
GET /api/server/audit
```

Scope:

- `audit.read`

Supports filtering by:

- limit,
- action,
- client ID.

## Example Token Configuration

```bash
SERVER_API_TOKENS=[{"id":"studio","token":"change-me","scopes":["transfer.read","files.read","index.read"]}]
```

## Example Request

```bash
curl -H "X-Server-Token: change-me" \
  http://localhost:3000/api/server/acp
```

## Concurrency and Conflict Notes

Some integration endpoints support `expectedUpdatedAt` so connected systems can reject stale updates.

This is especially useful for:

- ACP import,
- index writes,
- coding-scheme replacement.

If your integration reads, transforms, and writes ACP data, prefer this optimistic
concurrency pattern over blind overwrite.

## Auditability

Server API calls are audited through a dedicated interceptor and audit service. This is
helpful for tracing:

- which client changed which ACP,
- whether a transfer failed,
- what action type occurred,
- which API scopes were exercised in practice.

## Related Documents

- [Access Control](access-control.md)
- [ACP Workflows](acp-workflows.md)
- [Backend Architecture](../architecture/backend.md)
