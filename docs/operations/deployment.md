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

## Health Verification

After deployment, verify:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost/api/health/live
curl -fsS http://localhost/api/health/ready
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
