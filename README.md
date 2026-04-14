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

### Prerequisites

- Docker and Docker Compose installed
- Server with ports 80 and 443 available
- Domain name pointing to your server (optional but recommended)

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

# CORS (set to your domain)
CORS_ORIGIN=https://your-domain.de

# OIDC (optional - leave empty to disable)
OIDC_ISSUER_URL=
OIDC_CLIENT_ID=
OIDC_REDIRECT_URI=
OIDC_SCOPE=openid profile email
```

### HTTPS Setup with Let's Encrypt

```bash
# 1. Install certbot on server
sudo apt update && sudo apt install certbot

# 2. Get certificate (replace your-domain.de)
sudo certbot certonly --standalone -d your-domain.de

# 3. Update nginx.prod.conf with your domain
# Edit server_name from "deine-domain.de" to your actual domain

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

Admin and ACP Manager features require OIDC authentication via Keycloak. Public ACP access with credentials continues to work with local username/password.

### 1. Keycloak Client Configuration

Create a new client in your Keycloak realm:

| Setting | Value |
|---------|-------|
| Client ID | `contentpool-frontend` (or your choice) |
| Client Protocol | `openid-connect` |
| Access Type | `public` |
| Valid Redirect URIs | `http://localhost:4200/auth/callback` |
| Web Origins | `http://localhost:4200` |

**Required Client Scopes:**
- `openid`
- `profile`
- `email`

### 2. Docker Configuration

All OIDC configuration is done via Docker environment variables. The Keycloak login button only appears when OIDC is properly configured.

**Quick Start - Activate OIDC in Development:**

```bash
# 1. Copy the example file
cp .env.example .env

# 2. Edit .env with your Keycloak values
nano .env
# Set: OIDC_ISSUER_URL=https://your-keycloak.com/realms/iqb
# Set: OIDC_CLIENT_ID=contentpool-frontend

# 3. Restart containers
docker-compose up -d
```

**Manual Setup (without .env file):**

```bash
export OIDC_ISSUER_URL=https://keycloak.example.com/realms/your-realm
export OIDC_CLIENT_ID=contentpool-frontend
docker-compose up -d
```

**Production** (`docker-compose.prod.yml`):
```bash
export OIDC_ISSUER_URL=https://keycloak.example.com/realms/your-realm
export OIDC_CLIENT_ID=contentpool-frontend
export OIDC_REDIRECT_URI=https://contentpool.example.com/auth/callback
export JWT_SECRET=your-secure-secret

docker-compose -f docker-compose.prod.yml up -d
```

**Verify OIDC is active:**
```bash
# The API should return "enabled": true
curl http://localhost:3000/api/auth/oidc-config
```

### 3. Database Migration

Run the migration to add the `oidc_sub` column:

```bash
cd backend
npx typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts
```

### 4. Link Users to Keycloak Accounts

After configuration, link existing ContentPool users to Keycloak:

**Step 1:** Get the user's Keycloak `sub` claim
- From Keycloak Admin Console → Users → {user} → ID field
- Or inspect the JWT token from a successful Keycloak login

**Step 2:** Link via API (as ContentPool Admin):

```bash
curl -X POST http://localhost:3000/api/auth/link-oidc \
  -H "Authorization: Bearer <your-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "contentpool-user-uuid",
    "oidcSub": "keycloak-user-sub-uuid"
  }'
```

### 5. Login Flow

1. User clicks **"Mit Keycloak anmelden"** on the login page
2. Redirect to Keycloak login page
3. After successful Keycloak auth → redirect to `/auth/callback?id_token=...`
4. Frontend exchanges ID token for ContentPool JWT
5. User is logged in and can access Admin/ACP Manager features

### Security Notes

- Admin and ACP Manager endpoints require OIDC authentication (`OidcAuthGuard`)
- The local username/password login still works for ACP credential-based access
- JWT tokens from OIDC login contain `authType: 'oidc'` for verification
- The `oidcSub` uniquely links a ContentPool user to a Keycloak identity
