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

### 1. Build and push images (on your dev machine or CI)

```bash
# Log in to GitHub Container Registry
docker login ghcr.io -u YOUR_GITHUB_USERNAME

# Set the image tag
export IMAGE_TAG=ghcr.io/iqb-berlin/content-pool-next
export VERSION=latest   # or a git tag like v1.2.0

# Build backend
docker build -t ${IMAGE_TAG}/backend:${VERSION} -f backend/Dockerfile.prod ./backend

# Build frontend
docker build -t ${IMAGE_TAG}/frontend:${VERSION} -f frontend/Dockerfile.prod ./frontend

# Push
docker push ${IMAGE_TAG}/backend:${VERSION}
docker push ${IMAGE_TAG}/frontend:${VERSION}
```

### 2. On the server: create a compose file that pulls images

Create a `docker-compose.server.yml` (or edit `docker-compose.prod.yml`):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USERNAME:-contentpool}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-contentpool_prod}
      POSTGRES_DB: ${DB_DATABASE:-contentpool}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME:-contentpool}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  backend:
    image: ghcr.io/iqb-berlin/content-pool-next/backend:latest
    environment:
      NODE_ENV: production
      PORT: 3000
      DB_HOST: db
      DB_PORT: 5432
      DB_USERNAME: ${DB_USERNAME:-contentpool}
      DB_PASSWORD: ${DB_PASSWORD:-contentpool_prod}
      DB_DATABASE: ${DB_DATABASE:-contentpool}
      JWT_SECRET: ${JWT_SECRET:?JWT_SECRET must be set}
      JWT_EXPIRATION: ${JWT_EXPIRATION:-24h}
      FILE_STORAGE_PATH: /app/uploads
      CORS_ORIGIN: ${CORS_ORIGIN:-*}
      OIDC_ISSUER_URL: ${OIDC_ISSUER_URL:-}
      OIDC_CLIENT_ID: ${OIDC_CLIENT_ID:-}
      OIDC_REDIRECT_URI: ${OIDC_REDIRECT_URI}
      OIDC_SCOPE: ${OIDC_SCOPE:-openid profile email}
    volumes:
      - uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  nginx:
    image: ghcr.io/iqb-berlin/content-pool-next/frontend:latest
    ports:
      - "${APP_PORT:-80}:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  pgdata:
  uploads:
```

> **Note:** The frontend Dockerfile.prod already uses nginx as the production stage. So the pushed `frontend` image is a self-contained nginx serving the Angular SPA with the reverse proxy config baked in.

### 3. On the server: pull and run

```bash
# Create .env
cp .env.example .env
nano .env

# Pull and start
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

### 4. Update

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

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
