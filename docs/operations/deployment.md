# Deployment

## Deployment Modes

The repository supports three practical ways to run the application.

### 1. Local development stack

File:

- `docker-compose.yml`

Use this for:

- local onboarding,
- daily development,
- quick feature verification.

### 2. Build-on-host production deployment

File:

- `docker-compose.prod.yml`

Use this when:

- the server can build Docker images locally,
- you deploy directly from the repository source.

### 3. Prebuilt-image server deployment

File:

- `docker-compose.server.yml`

Use this when:

- you want the server to pull images from GHCR,
- you prefer faster deploys on small VPS instances,
- the build pipeline publishes backend and frontend images ahead of time.

### 4. Traefik edge deployment

File:

- `docker-compose.traefik.yml` combined with either production file

Use this when:

- an existing Traefik stack terminates HTTPS on the same Docker host,
- Traefik owns ports `80` and `443`,
- ContentPool should stay internal and be routed through Docker labels.

The Traefik stack can live outside this repository. It only needs to expose the
Docker network configured through `TRAEFIK_DOCKER_NETWORK` (`ingress-net` for
`iqb-berlin/traefik`). Do not use Traefik's `app-net` for ContentPool routing,
because Traefik's own monitoring Keycloak also lives there.

The overlay uses the Compose Spec `!reset` tag to remove ContentPool's direct
public nginx port binding. Validate the merged configuration before deployment.

## Development Deployment

Start:

```bash
make dev
```

Stop:

```bash
make dev-stop
```

Logs:

```bash
make dev-logs
make dev-logs-backend
make dev-logs-frontend
make dev-logs-keycloak
```

## Production Deployment From Source

1. Copy `.env.example` to `.env`
2. Fill in secure secrets and correct hostnames
3. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Or through the Makefile:

```bash
make prod-build
```

## Production Deployment Using Prebuilt Images

1. Copy `.env.example` to `.env`
2. Fill in secure secrets and correct hostnames
3. Pull and start

```bash
docker compose -f docker-compose.server.yml pull
docker compose -f docker-compose.server.yml up -d
```

Or through the Makefile:

```bash
make server-up
```

## Production Deployment Behind Traefik

1. Start the Traefik stack separately.
2. Make sure its ingress Docker network exists, for example `ingress-net`.
3. Copy `.env.example` to `.env`.
4. Fill in the normal production values and these Traefik values:

```bash
CONTENT_POOL_HOST=content-pool.example.com
CONTENT_POOL_AUTH_HOST=auth-content-pool.example.com
TRAEFIK_DOCKER_NETWORK=ingress-net
TRAEFIK_ENTRYPOINT=websecure
TRAEFIK_TLS_CERTRESOLVER=
```

For ContentPool OIDC, align the public URLs with those hosts:

```bash
CORS_ORIGIN=https://content-pool.example.com
KEYCLOAK_HOSTNAME=auth-content-pool.example.com
OIDC_PUBLIC_ISSUER_URL=https://auth-content-pool.example.com/realms/iqb
OIDC_REDIRECT_URI=https://content-pool.example.com/auth/callback
OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
```

Start with prebuilt images:

```bash
make server-traefik-up
```

Or build on the server:

```bash
make prod-traefik-build
```

The overlay removes ContentPool's public nginx port binding. Traefik routes to
the internal `content-pool-nginx` facade and ContentPool keeps its existing
internal nginx routing for SPA, API, GeoGebra assets, and Keycloak browser
endpoints.

## Required Production Concerns

Before any real deployment, make sure these are in place:

- secure database passwords,
- secure Keycloak admin password,
- strong `JWT_SECRET`,
- correct `CORS_ORIGIN`,
- correct `OIDC_PUBLIC_ISSUER_URL`,
- correct `OIDC_REDIRECT_URI`,
- `DB_SYNCHRONIZE=false`,
- `DB_RUN_MIGRATIONS=true`.
- local MTA/Postfix for Keycloak email delivery, relaying to
  `mailhost.cms.hu-berlin.de`.

## Recommended Production Topology

The default production layout is:

- nginx exposed publicly,
- frontend served behind nginx,
- backend internal-only,
- Keycloak public for browser auth flows but admin console localhost-bound,
- Keycloak SMTP delivery through a local host MTA,
- PostgreSQL internal-only,
- uploads persisted in a volume.

Behind Traefik, nginx is no longer exposed directly. Traefik is the public edge,
and nginx stays as the internal facade that knows ContentPool's path routing.

## Health Verification

After deployment, verify:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost/api/health/live
curl -fsS http://localhost/api/health/ready
```

Behind Traefik, validate the merged Compose configuration first:

```bash
make server-traefik-config
# or:
make prod-traefik-config
```

Then verify via the public hosts:

```bash
curl -fsS https://content-pool.example.com/api/health/live
curl -fsS https://auth-content-pool.example.com/realms/iqb/.well-known/openid-configuration
```

Or use the helper script:

```bash
./scripts/check-health.sh
```

The exact invocation depends on the deployment mode and target URLs.

## Migration Strategy

Production schema changes should happen through TypeORM migrations only.

Recommended values:

- `DB_SYNCHRONIZE=false`
- `DB_RUN_MIGRATIONS=true`

Manual commands when needed:

```bash
docker compose -f docker-compose.prod.yml exec content-pool-api npm run migration:run:dist
docker compose -f docker-compose.prod.yml exec content-pool-api npm run migration:revert:dist
```

## Backup Basics

Typical database backup commands:

```bash
docker exec content-pool-db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup.sql
docker exec keycloak-db pg_dump -U "$KEYCLOAK_DB_USER" "$KEYCLOAK_DB_NAME" > keycloak.sql
```

Keep in mind that ACP uploads live in a separate volume, so a complete backup strategy
should include both databases and the upload volume.

## Common Operational Commands

### Logs

```bash
make prod-logs
make prod-logs-api
make prod-logs-nginx
make prod-logs-keycloak
```

### Restart

```bash
make prod-restart
```

### Status

```bash
make status
```

### Update

```bash
make update
```

## Security Notes

- Keep `8080` closed to the public internet unless you intentionally run an insecure mode.
- Prefer public DNS hostnames and HTTPS for app and auth endpoints.
- Do not enable Swagger publicly unless you actually want it exposed.
- Avoid production deployments with schema synchronization enabled.

## Related Existing Runbooks

For more detailed operator guidance, also read:

- [`/Users/julian/iqb-dev/content-pool-next/DEPLOY.md`](../../DEPLOY.md)
- [`/Users/julian/iqb-dev/content-pool-next/KEYCLOAK_SETUP.md`](../../KEYCLOAK_SETUP.md)
- [`/Users/julian/iqb-dev/content-pool-next/RELEASE_CHECKLIST.md`](../../RELEASE_CHECKLIST.md)
- [`/Users/julian/iqb-dev/content-pool-next/docs/operations/keycloak-email.md`](keycloak-email.md)

## Related Documents

- [Monitoring and Maintenance](monitoring-and-maintenance.md)
- [Configuration](../development/configuration.md)
