#!/bin/bash
# Health check script for ContentPool services

set -e

ENV="${1:-dev}"
KEYCLOAK_URL="${2:-http://localhost:8080}"
API_URL="${3:-http://localhost:3000/api}"
FRONTEND_URL="${4:-http://localhost:4201}"
EXPECTED_RELEASE="${5:-}"
EXPECTED_COMMIT="${6:-}"
HEALTH_CHECK_ATTEMPTS="${HEALTH_CHECK_ATTEMPTS:-1}"
HEALTH_CHECK_INTERVAL_SECONDS="${HEALTH_CHECK_INTERVAL_SECONDS:-5}"
HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS="${HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS:-3}"
HEALTH_CHECK_MAX_TIME_SECONDS="${HEALTH_CHECK_MAX_TIME_SECONDS:-5}"
FAILURES=0

[[ "$HEALTH_CHECK_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || {
    echo "HEALTH_CHECK_ATTEMPTS must be a positive integer" >&2
    exit 2
}
[[ "$HEALTH_CHECK_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || {
    echo "HEALTH_CHECK_INTERVAL_SECONDS must be a non-negative integer" >&2
    exit 2
}
[[ "$HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
    echo "HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS must be a positive integer" >&2
    exit 2
}
[[ "$HEALTH_CHECK_MAX_TIME_SECONDS" =~ ^[1-9][0-9]*$ ]] || {
    echo "HEALTH_CHECK_MAX_TIME_SECONDS must be a positive integer" >&2
    exit 2
}

echo "=== ContentPool Health Check ==="
echo "Environment: $ENV"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

check_url() {
    local name=$1
    local url=$2
    local status

    echo -n "Checking $name... "

    status="$(curl --connect-timeout "$HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS" \
        --max-time "$HEALTH_CHECK_MAX_TIME_SECONDS" \
        -sS -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)" || status=""
    if [[ "$status" =~ ^(200|301|302)$ ]]; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC} (${status:-unreachable})"
        FAILURES=$((FAILURES + 1))
    fi

    return 0
}

check_release_identity() {
    [[ -n "$EXPECTED_RELEASE" || -n "$EXPECTED_COMMIT" ]] || return 0

    echo -n "Checking deployed release identity... "
    if curl --connect-timeout "$HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS" \
       --max-time "$HEALTH_CHECK_MAX_TIME_SECONDS" \
       -fsS "${API_URL%/}/version" -o "$BACKEND_VERSION" && \
       curl --connect-timeout "$HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS" \
       --max-time "$HEALTH_CHECK_MAX_TIME_SECONDS" \
       -fsS "${FRONTEND_URL%/}/version.json" -o "$FRONTEND_VERSION" && \
       python3 - "$BACKEND_VERSION" "$FRONTEND_VERSION" "$EXPECTED_RELEASE" "$EXPECTED_COMMIT" <<'PY'
import json
import sys

backend = json.load(open(sys.argv[1], encoding="utf-8"))
frontend = json.load(open(sys.argv[2], encoding="utf-8"))
expected_release, expected_commit = sys.argv[3], sys.argv[4]
for field in ("version", "commit", "builtAt"):
    if backend.get(field) != frontend.get(field):
        raise SystemExit(f"frontend/backend {field} mismatch")
if expected_release and backend.get("version") != expected_release:
    raise SystemExit("unexpected release version")
if expected_commit and backend.get("commit") != expected_commit:
    raise SystemExit("unexpected release commit")
PY
    then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi
}

run_health_pass() {
    FAILURES=0

    check_url "Keycloak discovery" "$KEYCLOAK_HEALTH_URL"
    check_url "API liveness" "${API_URL%/}/health/live"
    check_url "API readiness" "${API_URL%/}/health/ready"
    check_url "API OIDC config" "${API_URL%/}/auth/oidc-config"
    check_url "Frontend" "${FRONTEND_URL%/}/"
    check_release_identity

    [[ "$FAILURES" -eq 0 ]]
}

if [[ "$KEYCLOAK_URL" == *"/realms/"* ]]; then
    KEYCLOAK_HEALTH_URL="${KEYCLOAK_URL%/}/.well-known/openid-configuration"
else
    KEYCLOAK_HEALTH_URL="${KEYCLOAK_URL%/}/realms/master/.well-known/openid-configuration"
fi

if [[ -n "$EXPECTED_RELEASE" || -n "$EXPECTED_COMMIT" ]]; then
    BACKEND_VERSION="$(mktemp "${TMPDIR:-/tmp}/content-pool-backend-version.XXXXXX")"
    FRONTEND_VERSION="$(mktemp "${TMPDIR:-/tmp}/content-pool-frontend-version.XXXXXX")"
    trap 'rm -f "$BACKEND_VERSION" "$FRONTEND_VERSION"' EXIT
fi

HEALTH_PASSED=0
for ((attempt = 1; attempt <= HEALTH_CHECK_ATTEMPTS; attempt += 1)); do
    echo "Health check attempt ${attempt}/${HEALTH_CHECK_ATTEMPTS}"
    if run_health_pass; then
        HEALTH_PASSED=1
        break
    fi
    if [[ "$attempt" -lt "$HEALTH_CHECK_ATTEMPTS" ]]; then
        echo "Attempt ${attempt}/${HEALTH_CHECK_ATTEMPTS} failed; retrying in ${HEALTH_CHECK_INTERVAL_SECONDS}s..."
        sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
        echo ""
    fi
done

echo ""
echo "=== Docker Container Status ==="

if [ "$ENV" = "prod" ]; then
    docker compose -f docker-compose.prod.yml ps
elif [ "$ENV" = "prod-traefik" ]; then
    docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml ps
elif [ "$ENV" = "server" ]; then
    docker compose -f docker-compose.server.yml ps
elif [ "$ENV" = "server-traefik" ]; then
    docker compose -f docker-compose.server.yml -f docker-compose.traefik.yml ps
elif [ "$ENV" = "traefik" ]; then
    docker compose -f docker-compose.server.yml -f docker-compose.traefik.yml ps
else
    docker compose ps
fi

echo ""
if [[ "$HEALTH_PASSED" -ne 1 ]]; then
    echo -e "=== Health Check Complete: ${RED}${FAILURES} check(s) failed${NC} ==="
    exit 1
fi

echo -e "=== Health Check Complete: ${GREEN}all checks passed${NC} ==="
