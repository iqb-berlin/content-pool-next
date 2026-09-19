# Testing and Quality

## Overview

The project combines automated tests with a few important manual verification flows.
Because the product mixes UI, files, identity, and persistence, a small manual smoke
check is often worth more than a single isolated unit test.

## Automated Test Commands

### Backend

From `backend/`:

```bash
npm test
npm run test:e2e
```

What these cover:

- controller and service unit tests,
- guards and auth behavior,
- ACP utility logic,
- validation helpers,
- server API helpers,
- end-to-end API flows in the E2E suite.

### Frontend

From `frontend/`:

```bash
npm test
npm run lint
```

The frontend uses Vitest for tests and Angular ESLint tooling for lint checks.

### Full-stack browser tests

The Playwright suite runs Chromium against the real Angular frontend, NestJS backend, and an
isolated PostgreSQL database. From the repository root, run:

```bash
(cd frontend && npm run e2e)
```

The wrapper starts a disposable PostgreSQL container, seeds it, and uses dedicated ports for both
application servers. The seed and Playwright configuration refuse non-E2E database settings, and
existing application servers are never reused. Trace, screenshot, and video diagnostics are kept
only for failed tests. CI supplies its own isolated PostgreSQL service and performs browser
installation automatically.

## What to Test for Common Change Types

### Authentication or access changes

Verify:

- direct Keycloak redirect and OIDC login callback,
- credential login for ACPs,
- route-guard redirects,
- feature-disabled and insufficient-rights access flows.

### ACP or file-management changes

Verify:

- ACP creation and update,
- file upload,
- index synchronization,
- validation summaries,
- file download or ZIP export,
- snapshot creation and diff.

### Public-view changes

Verify:

- anonymous access to public ACPs,
- redirected access to restricted ACPs,
- unit, item, and sequence views,
- comment availability based on feature flags.

### Item Explorer changes

Verify:

- draft patching,
- optimistic version handling,
- save and discard actions,
- history export,
- manual item order and metadata column persistence.

### Integration API changes

Verify:

- token authentication,
- scope enforcement,
- ACP transfer export/import,
- file upload conflict behavior,
- audit log creation and retrieval.

## Manual Smoke Test Checklist

For a reasonably complete pre-merge check, walk through this short sequence:

1. open the frontend,
2. confirm public settings load,
3. log in with the expected auth path,
4. open an ACP manager page,
5. upload or inspect ACP files,
6. create a snapshot,
7. open the ACP read-only view,
8. confirm the intended feature flags behave correctly,
9. check `/api/health/live` and `/api/health/ready`.

## Health and Runtime Checks

Useful commands and URLs:

```bash
make health
curl -fsS http://localhost:3000/api/health/live
curl -fsS http://localhost:3000/api/health/ready
```

In deployed environments, use the production or server compose variants with the same health endpoints.

## Quality Expectations by Layer

### Backend

- add or update unit tests when business rules change,
- prefer deterministic tests around guards, services, and DTO validation,
- keep migration changes explicit.

### Frontend

- test guard and service behavior for auth-sensitive changes,
- smoke-test route flows in a browser,
- verify download helpers and redirect behavior when touching auth or access code.

### Documentation

When behavior changes, update:

- the relevant `docs/` file,
- any root runbook that now disagrees,
- README links if the entry points changed.

## Release-Oriented Verification

Before a release or deployment candidate:

1. run the relevant automated tests,
2. check health endpoints,
3. validate login,
4. confirm migrations are ready if the schema changed,
5. walk through the release checklist in [`RELEASE_CHECKLIST.md`](../../RELEASE_CHECKLIST.md).

## Related Documents

- [Getting Started](getting-started.md)
- [Deployment](../operations/deployment.md)
- [Monitoring and Maintenance](../operations/monitoring-and-maintenance.md)
