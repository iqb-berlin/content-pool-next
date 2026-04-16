# Deployment Guide (VPS + Keycloak)

This guide describes a **secure** deployment of ContentPool with Keycloak on a VPS.

## 1. Preconditions (must be true)

- Docker Engine + Compose v2 installed (`docker compose version`)
- Domain setup (recommended):
  - App: `app.example.com`
  - Keycloak: `auth.example.com` (can point to same VPS)
- TLS/HTTPS at the edge (nginx on VPS or upstream reverse proxy/load balancer)
- Firewall:
  - open: `80` (and `443` if terminating TLS on VPS)
  - closed from internet: `8080` (Keycloak stays localhost-bound)
- At least 2 GB RAM (4 GB recommended)

## 2. Choose deployment mode

- `docker-compose.prod.yml`: build locally on VPS
- `docker-compose.server.yml`: pull pre-built images from GHCR (recommended for small VPS)

## 3. Prepare configuration

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `POSTGRES_PASSWORD`
- `KEYCLOAK_DB_PASSWORD`
- `KEYCLOAK_ADMIN_PASSWORD`
- `JWT_SECRET` (long random value)
- `CORS_ORIGIN` (for example `https://app.example.com`)
- `KEYCLOAK_HOSTNAME` (for example `auth.example.com`)
- `OIDC_PUBLIC_ISSUER_URL` (for example `https://auth.example.com/realms/iqb`)
- `OIDC_REDIRECT_URI` (for example `https://app.example.com/auth/callback`)
- `OIDC_CLIENT_ID` (default `contentpool`)
- `DB_SYNCHRONIZE=false`
- `DB_RUN_MIGRATIONS=true`

## 3a. Migration strategy (required for production)

Use migrations as the only schema-change mechanism in production.

- Fresh deployment:
  - `DB_SYNCHRONIZE=false`
  - `DB_RUN_MIGRATIONS=true`
  - start stack and let backend run migrations on boot
- Upgrade deployment:
  - keep the same values (`false` / `true`)
  - deploy new image and verify logs for successful migration run


## 4. Adjust Keycloak client redirect/web origins

Update `keycloak/realm-export.json` to your real hostnames:

- `redirectUris`: include your exact callback URL
- `webOrigins`: include your frontend origin

Current defaults are placeholders (`app.example.com`, `YOUR_SERVER_IP`) and should be replaced before first deploy.
If you use TLS on an IP-based setup, use `https://YOUR_SERVER_IP/...` entries.
The scheme must match exactly (`https` vs `http`), otherwise Keycloak rejects
login with `Invalid parameter: redirect_uri`.

## 5. Validate config before start

```bash
docker compose -f docker-compose.server.yml config >/tmp/compose.server.resolved.yml
# or:
docker compose -f docker-compose.prod.yml config >/tmp/compose.prod.resolved.yml
```

If this fails, required env vars are missing or malformed.

## 6. Start services

### Option A: pre-built images

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

### Option B: build on VPS

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 7. Verify health

```bash
docker compose -f docker-compose.server.yml ps
./scripts/check-health.sh server "https://auth.example.com/realms/iqb" "http://localhost/api" "http://localhost"
```

Expected:

- `content-pool-nginx`, `content-pool-api`, `content-pool-db`, `keycloak`, `keycloak-db` are `Up`
- `GET /api/auth/oidc-config` returns `"enabled": true`

## 8. Access Keycloak Admin securely

Keycloak is bound to `127.0.0.1:8080` by default.

Use an SSH tunnel from your local machine:

```bash
ssh -L 8080:127.0.0.1:8080 USER@YOUR_SERVER
```

Then open:

- `http://localhost:8080/admin`

Login with `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD`.

## 9. First login bootstrap

1. In Keycloak realm `iqb`, create your real admin user.
2. Assign realm role `admin` to that user.
3. Login to ContentPool via OIDC.
4. Verify that the user becomes `isAppAdmin=true` automatically.

## 10. Updates

```bash
# pre-built mode
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d

# build mode
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 11. Backups (recommended)

```bash
mkdir -p backups
docker exec content-pool-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/contentpool_$(date +%F_%H-%M-%S).sql
docker exec keycloak-db pg_dump -U "$KEYCLOAK_DB_USER" "$KEYCLOAK_DB_NAME" > backups/keycloak_$(date +%F_%H-%M-%S).sql
```
