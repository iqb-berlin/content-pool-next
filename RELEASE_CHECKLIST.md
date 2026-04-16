# ContentPool Go/No-Go Checklist

Use this checklist before every production rollout.

## 1. Deployment and migration readiness

- [ ] `.env` reviewed (`DB_SYNCHRONIZE=false`, `DB_RUN_MIGRATIONS=true`)
- [ ] Compose config validates without errors:
  - `docker compose -f docker-compose.server.yml config`
  - or `docker compose -f docker-compose.prod.yml config`
- [ ] Migration plan confirmed (see `DEPLOY.md`, section "Migration strategy")
- [ ] Backup created:
  - `pg_dump` for app DB
  - `pg_dump` for Keycloak DB

## 2. Monitoring and observability baseline

- [ ] Container health checks report healthy:
  - `docker compose -f docker-compose.server.yml ps`
- [ ] API liveness/readiness return success:
  - `curl -fsS http://localhost/api/health/live`
  - `curl -fsS http://localhost/api/health/ready`
- [ ] Full stack health script passes:
  - `./scripts/check-health.sh server "https://auth.example.com/realms/iqb" "http://localhost/api" "http://localhost"`
- [ ] No critical errors in recent logs:
  - `docker compose -f docker-compose.server.yml logs --since 15m content-pool-api keycloak`

## 3. Functional release gates

- [ ] Backend unit tests green (`cd backend && npm test -- --runInBand`)
- [ ] Backend e2e tests green (`cd backend && npm run test:e2e`)
- [ ] Backend build green (`cd backend && npm run build`)
- [ ] Frontend tests/build green (`cd frontend && npm run test`, `cd frontend && npm run build`)
- [ ] OIDC login path verified manually
- [ ] ACP create/update + file upload + view access smoke test passed

## 4. Decision

- [ ] Go
- [ ] No-Go
- [ ] Decision timestamp + owner documented in release notes / issue comment
