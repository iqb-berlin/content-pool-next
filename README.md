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

### Using Makefile (Recommended)

```bash
# Setup and start everything
make dev-setup  # First time only - install dependencies
make dev        # Start all services (PostgreSQL, Keycloak, Backend, Frontend)

# Useful commands
make help              # Show all available commands
make dev-logs          # View logs
make dev-logs-backend  # View backend logs only
make dev-stop          # Stop all services
make health            # Check service health
make keycloak-admin    # Show Keycloak admin info
```

### Manual Start

```bash
# Start PostgreSQL
docker compose up db -d

# Backend
cd backend
npm install --cache /tmp/npm-cache
npm run start:dev
# → API at http://localhost:3000/api
# → Swagger at http://localhost:3000/api/docs
# → Seeded local users are available (for non-admin login)
# → App-Admin login requires OIDC (development user: iqb-admin / Admin1234!)

# Frontend
cd frontend
npm install --cache /tmp/npm-cache
npx ng serve
# → http://localhost:4200
```

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- Server with ports 80 and 443 available
- Domain names for app + auth (recommended for secure OIDC)

### Quick Deploy

```bash
# 1. Clone repository
git clone <your-repo-url>
cd content-pool-next

# 2. Setup environment
cp .env.example .env
nano .env  # Edit with your values

# 3. Deploy
docker compose -f docker-compose.prod.yml up -d --build
# → Application at http://your-server-ip
```

### Environment Configuration

Create `.env` file with your production values:

```bash
# Database (REQUIRED - change passwords!)
POSTGRES_DB=content_pool
POSTGRES_USER=content_pool
POSTGRES_PASSWORD=your-secure-password-here

# JWT (REQUIRED - generate random string)
JWT_SECRET=your-random-secret-at-least-32-characters
JWT_EXPIRATION=24h
DB_SYNCHRONIZE=true
DB_RUN_MIGRATIONS=false

# CORS (set to your domain)
CORS_ORIGIN=https://app.example.com

# OIDC (required for Application-Admin login)
KEYCLOAK_HOSTNAME=auth.example.com
OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
OIDC_PUBLIC_ISSUER_URL=https://auth.example.com/realms/iqb
OIDC_CLIENT_ID=contentpool
OIDC_REDIRECT_URI=https://app.example.com/auth/callback
OIDC_SCOPE=openid profile email

# Keycloak credentials
KEYCLOAK_DB_PASSWORD=your-keycloak-db-password
KEYCLOAK_ADMIN_PASSWORD=your-keycloak-admin-password
```

### HTTPS Setup with Let's Encrypt

```bash
# 1. Install certbot on server
sudo apt update && sudo apt install certbot

# 2. Get certificate (replace your domains)
sudo certbot certonly --standalone -d app.example.com -d auth.example.com

# 3. Configure your reverse proxy/edge to terminate TLS and forward to this stack

# 4. Restart containers
docker compose -f docker-compose.prod.yml restart nginx
```

### Production Architecture

The production setup includes:

- **PostgreSQL**: Database with persistent storage
- **NestJS API**: Backend running on port 3000 (internal only)
- **Angular SPA**: Frontend served by nginx (internal only)
- **nginx Reverse Proxy**: Handles SSL termination and routing
- **Security**: Non-root containers, no exposed internal ports

### Management Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Update application
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Backup database
docker exec content-pool-db pg_dump -U content_pool content_pool > backup.sql

# Stop services
docker compose -f docker-compose.prod.yml down

# Full reset (removes all data)
docker compose -f docker-compose.prod.yml down -v
```

### Troubleshooting

```bash
# Check container status
docker compose -f docker-compose.prod.yml ps

# Check specific service logs
docker compose -f docker-compose.prod.yml logs content-pool-api
docker compose -f docker-compose.prod.yml logs content-pool-db

# Access database directly
docker exec -it content-pool-db psql -U content_pool -d content_pool

# Test nginx configuration
docker exec content-pool-nginx nginx -t
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

## OIDC / Keycloak Integration

Application-Admin login uses Keycloak OIDC. ACP-Manager and READ_ONLY users can use local ContentPool credentials (JWT-based login). ACP credential-list access continues to work without OIDC.

Highlights:

- Frontend flow: **Authorization Code + PKCE**
- Realm export is preconfigured for secure defaults (`implicitFlowEnabled=false`, `publicClient=true`, `pkce=S256`)
- Development uses `keycloak/realm-export.dev.json` (localhost redirects, `sslRequired=none`)
- Development realm includes external broker `kodierbox` (external realm `coding-box`)
- Production uses `keycloak/realm-export.json` (secure baseline, `sslRequired=external`)
- Reverse proxy must expose `/realms/*` and `/resources/*`
- `/auth/callback` is reserved for the frontend and must not be proxied to Keycloak

For full setup and secure VPS deployment:

- [KEYCLOAK_SETUP.md](KEYCLOAK_SETUP.md)
- [DEPLOY.md](DEPLOY.md)
