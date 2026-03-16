# IQB ContentPool

Web application for managing **Assessment Content Packages (ACPs)** — bundles of data required to conduct and evaluate educational assessments.

## Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 19, SCSS, standalone components |
| Backend | NestJS, TypeORM, JWT auth |
| Database | PostgreSQL 16 |
| Deployment | Docker Compose, nginx reverse proxy |

## Quick Start (Development)

```bash
# Start PostgreSQL
docker compose up db -d

# Backend
cd backend
npm install --cache /tmp/npm-cache
npm run start:dev
# → API at http://localhost:3000/api
# → Swagger at http://localhost:3000/api/docs
# → Default login: admin / admin

# Frontend
cd frontend
npm install --cache /tmp/npm-cache
npx ng serve
# → http://localhost:4200
```

## Production Deployment

```bash
# Set required env vars
export JWT_SECRET=your-secret-here
export DB_PASSWORD=your-db-password

# Build and run
docker compose -f docker-compose.prod.yml up --build -d
# → http://localhost (nginx)
```

## Project Structure

```
├── backend/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # JWT auth, 3 guards, credential login
│   │   ├── users/          # User CRUD, admin seeding
│   │   ├── acp/            # ACP lifecycle, Index import/export, roles
│   │   ├── files/          # Upload/download, checksums
│   │   ├── snapshots/      # Versioning, restore, diff
│   │   ├── views/          # Public read-only endpoints
│   │   ├── comments/       # CRUD, export
│   │   ├── items/          # Item extraction, filter/sort
│   │   ├── admin/          # App settings
│   │   ├── validation/     # Syntactic + semantic
│   │   ├── api/            # Server-to-server API
│   │   └── database/       # 10 TypeORM entities
│   └── test/               # E2E tests
├── frontend/                # Angular SPA
│   └── src/app/
│       ├── core/           # AuthService, ApiService, guards
│       ├── auth/           # Login pages
│       ├── admin/          # Users, settings, ACP list
│       ├── acp-manager/    # Dashboard, files, snapshots, access
│       └── views/          # Landing, units, sequences, items, index
├── nginx/                   # Reverse proxy config
├── docker-compose.yml       # Development
└── docker-compose.prod.yml  # Production
```

## Testing

```bash
# Backend unit tests (46 tests)
cd backend && npm test

# Backend E2E tests (requires running PostgreSQL)
cd backend && npm run test:e2e
```

## Key Features

- **3 Access Models**: Public, Registered Users, Credentials List (time-limited)
- **ACP-Index Management**: JSON import/export, interactive browser
- **File Management**: Multi-file upload, SHA-256 checksums, validation
- **Versioning**: Snapshots with copy-on-write, restore, diff
- **16 Feature Flags**: Per-ACP control over read-only features
- **Verona Player Integration**: Unit display via iframe
- **Server-to-Server API**: For Studio, Testcenter, Kodierbox integration
