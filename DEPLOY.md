# Deployment Guide

Two ways to deploy content-pool-next to a server. **Option A** is the simplest; **Option B** avoids building on the server entirely.

---

## Server Requirements

| Requirement | Minimum |
|---|---|
| Docker + Compose v2 | ✅ |
| RAM | 2 GB (4 GB recommended) |
| Disk | 5 GB free |
| Ports | 80 (or custom `APP_PORT`) |

---

## Option A: Git Clone on Server

Build and run directly on the server. Simple, but the first build takes a few minutes.

### 1. Clone the repo

```bash
git clone https://github.com/iqb-berlin/content-pool-next.git
cd content-pool-next
```

### 2. Create `.env`

```bash
cp .env.example .env
nano .env   # set JWT_SECRET, DB_PASSWORD, etc.
```

**Required:** `JWT_SECRET` and `DB_PASSWORD` must be changed from defaults.

### 3. Build and start

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### 4. Verify

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Test the API
curl http://localhost/api/auth/oidc-config

# Default admin login: admin / admin
```

### 5. Stop / Update

```bash
# Stop
docker compose -f docker-compose.prod.yml down

# Update to latest
git pull
docker compose -f docker-compose.prod.yml up --build -d
```

---

## Option B: Pre-built Images via Registry

Build images on a powerful machine (local dev or CI), push to GitHub Container Registry, then just pull on the server. **No build on the server at all.**

### Version Strategy

| Phase | Version | When to use |
|-------|---------|-------------|
| **Testing** | `v0.1.0`, `v0.2.0`... | Still iterating, breaking changes expected |
| **Production** | `v1.0.0`, `v1.1.0`... | Stable, backward compatible |

### 1. Build and push images (on your dev machine or CI)

**For testing phase (recommended):**
```bash
# Start with v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

**When ready for production:**
```bash
# Move to v1.0.0
git tag v1.0.0
git push origin v1.0.0
```

Images will be published to:
- `ghcr.io/iqb-berlin/content-pool-backend:v0.1.0`
- `ghcr.io/iqb-berlin/content-pool-frontend:v0.1.0`

**Or build locally and push:**
```bash
# Log in to GitHub Container Registry
docker login ghcr.io -u YOUR_GITHUB_USERNAME

# Build and push (example with v0.1.0)
make build-push VERSION=v0.1.0
```

### 2. On the server: deploy using pre-built images

The repository includes `docker-compose.server.yml` configured to pull images from GHCR.

```bash
# Clone the repo (only needed files: docker-compose.server.yml, nginx.server.conf, .env.example)
git clone https://github.com/iqb-berlin/content-pool-next.git
cd content-pool-next

# Create .env
cp .env.example .env
nano .env  # Set JWT_SECRET, DB_PASSWORD, KEYCLOAK passwords, IMAGE_VERSION, etc.
```

**For testing with `latest` (auto-updates on redeploy):**
```bash
# .env
IMAGE_VERSION=latest

make server-up
```

**For testing with pinned version (recommended for stability):**
```bash
# .env - pin to a specific version
IMAGE_VERSION=v0.1.0

make server-up
```

To update to a new version:
```bash
# Edit .env: IMAGE_VERSION=v0.2.0
make server-update
```

### 3. Verify deployment

```bash
# Check all containers are running
docker compose -f docker-compose.server.yml ps

# Test the API
curl http://localhost/api/auth/oidc-config

# View logs
make server-logs
```

### 4. Update

```bash
# Pull latest images and restart
make server-update

# Or manually:
# docker compose -f docker-compose.server.yml pull
# docker compose -f docker-compose.server.yml up -d
```

### Server Deployment Commands

| Command | Description |
|---------|-------------|
| `make server-up` | Pull images and start server deployment |
| `make server-stop` | Stop server deployment |
| `make server-update` | Pull latest images and restart |
| `make server-logs` | View all service logs |
| `make server-clean` | Stop and remove all containers and volumes |

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `JWT_SECRET` | — | **yes** | Secret for signing JWT tokens |
| `DB_PASSWORD` | `contentpool_prod` | **yes** | PostgreSQL password (change!) |
| `DB_USERNAME` | `contentpool` | no | PostgreSQL user |
| `DB_DATABASE` | `contentpool` | no | PostgreSQL database name |
| `APP_PORT` | `80` | no | Port nginx listens on |
| `CORS_ORIGIN` | `*` | no | Allowed CORS origin |
| `JWT_EXPIRATION` | `24h` | no | JWT token lifetime |
| `OIDC_ISSUER_URL` | — | no | Keycloak realm URL |
| `OIDC_CLIENT_ID` | — | no | Keycloak client ID |
| `OIDC_REDIRECT_URI` | — | no | Callback URL after Keycloak login |
| `OIDC_SCOPE` | `openid profile email` | no | OIDC scopes |

---

## Database Migrations

After the first deployment or when the schema changes:

```bash
# Run inside the backend container
docker compose -f docker-compose.prod.yml exec backend \
  npx typeorm-ts-node-commonjs migration:run -d src/config/data-source.ts
```

---

## OIDC / Keycloak Setup

See [README.md](README.md#oidc--keycloak-integration) for the full setup guide. Quick summary:

1. Create a Keycloak client with `Client ID = contentpool-frontend`
2. Set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI` in `.env`
3. Restart containers
4. Verify: `curl http://localhost/api/auth/oidc-config` → `{"enabled": true}`

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| Build takes >10 min | Low RAM, server swapping | Use Option B (pre-built images) or add swap |
| `bcrypt` native build fails | Missing build tools on Alpine | Already fixed — project uses `bcryptjs` (pure JS) |
| Containers restart loop | DB not ready | `depends_on` with `condition: service_healthy` handles this; check DB logs |
| 502 Bad Gateway | Backend not up yet | Wait 30s after `docker compose up`, or check `docker compose logs backend` |
| Uploads lost after restart | Missing volume | `uploads` volume is defined in compose — check with `docker volume ls` |
