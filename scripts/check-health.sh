#!/bin/bash
# Health check script for ContentPool services

set -e

ENV="${1:-dev}"
KEYCLOAK_URL="${2:-http://localhost:8080}"
API_URL="${3:-http://localhost:3000/api}"
FRONTEND_URL="${4:-http://localhost:4201}"
FAILURES=0

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

    echo -n "Checking $name... "

    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|301\|302"; then
        echo -e "${GREEN}OK${NC}"
    else
        echo -e "${RED}FAILED${NC}"
        FAILURES=$((FAILURES + 1))
    fi

    return 0
}

if [[ "$KEYCLOAK_URL" == *"/realms/"* ]]; then
    KEYCLOAK_HEALTH_URL="${KEYCLOAK_URL%/}/.well-known/openid-configuration"
else
    KEYCLOAK_HEALTH_URL="${KEYCLOAK_URL%/}/realms/master/.well-known/openid-configuration"
fi

# Check Keycloak
check_url "Keycloak discovery" "$KEYCLOAK_HEALTH_URL"

# Check Backend API
check_url "API liveness" "${API_URL%/}/health/live"
check_url "API readiness" "${API_URL%/}/health/ready"
check_url "API OIDC config" "${API_URL%/}/auth/oidc-config"

# Check Frontend
check_url "Frontend" "${FRONTEND_URL%/}/"

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
else
    docker compose ps
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
    echo -e "=== Health Check Complete: ${RED}${FAILURES} check(s) failed${NC} ==="
    exit 1
fi

echo -e "=== Health Check Complete: ${GREEN}all checks passed${NC} ==="
