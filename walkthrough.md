# ContentPool – Phase 1 Walkthrough

## What Was Built

A complete **NestJS backend** for the IQB ContentPool web application, implementing all the core data management, authentication, and access control features described in the [project specification](https://iqb-berlin.github.io/rising-stars/content-pool/).

## Project Structure

```
backend/
├── src/
│   ├── main.ts                          # App bootstrap (CORS, Swagger, validation)
│   ├── app.module.ts                    # Root module wiring
│   ├── auth/                            # JWT auth + 3 guard types
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts              # Keycloak/OIDC + ACP credential login
│   │   ├── auth.controller.ts           # OIDC callback + credential login
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts           # APP_ADMIN role check
│   │   │   └── acp-access.guard.ts      # Multi-model ACP access check
│   │   └── strategies/jwt.strategy.ts
│   ├── users/                           # User CRUD (admin-only)
│   ├── acp/                             # ACP lifecycle + Index + roles + access config
│   ├── files/                           # File upload/download with checksums
│   ├── snapshots/                       # Versioning (create/restore/diff)
│   ├── views/                           # Public read-only endpoints
│   ├── comments/                        # CRUD + export
│   ├── items/                           # Item list (placeholder)
│   ├── admin/                           # App settings
│   ├── validation/                      # Syntactic + semantic validation
│   └── database/entities/               # 10 TypeORM entities
├── docker-compose.yml                   # PostgreSQL + backend
├── Dockerfile
├── package.json
└── tsconfig.json
```

## Key Features Implemented

| Feature | Module | Status |
|---------|--------|--------|
| JWT Authentication (OIDC users + ACP credential login) | `auth` | ✅ |
| User CRUD for pre-provisioned Keycloak identities | `users` | ✅ |
| ACP CRUD + ACP-Index import/export | `acp` | ✅ |
| 3 access models (Public/Registered/Credentials) | `acp` | ✅ |
| File upload/download with SHA-256 checksums | `files` | ✅ |
| Snapshots (create/restore/diff) | `snapshots` | ✅ |
| Public/read-only view endpoints | `views` | ✅ |
| Comments (per-user, XLSX export data) | `comments` | ✅ |
| App settings (theme, language, texts) | `admin` | ✅ |
| Syntactic + semantic validation | `validation` | ✅ |
| Swagger API docs at `/api/docs` | [main.ts](file:///Users/julian/dev/iqb/plan/backend/src/main.ts) | ✅ |

## Verification

```
$ npx nest build
# ✅ Build succeeded with no errors
```

## Next Steps

To run the backend locally:

```bash
# Start PostgreSQL
docker compose up db -d

# Install dependencies (use temp cache if npm cache has permission issues)
cd backend && npm install --cache /tmp/npm-cache

# Start dev server
npm run start:dev

# API will be at http://localhost:3000/api
# Swagger docs at http://localhost:3000/api/docs
# Users authenticate through the configured Keycloak; no local default admin is seeded
```

**Remaining work:**
- Angular frontend (auth pages, ACP manager dashboard, read-only views, Verona Player integration)
- Backend unit & e2e tests
- Production Docker config with nginx reverse proxy
