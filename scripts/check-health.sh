#!/bin/bash
# Health check script for ContentPool services

set -e

ENV="${1:-dev}"
KEYCLOAK_URL="${2:-http://localhost:8080}"
API_URL="${3:-http://localhost:3000}"
FRONTEND_URL="${4:-http://localhost:4200}"

echo "=== ContentPool Health Check ==="
echo "Environment: $ENV"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_service() {
    local name=$1
    local url=$2
    local endpoint=$3
    
    echo -n "Checking $name... "
    
    if curl -s -o /dev/null -w "%{http_code}" "$url$endpoint" | grep -q "200\|301\|302"; then
        echo -e "${GREEN}OK${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

# Check Keycloak
check_service "Keycloak" "$KEYCLOAK_URL" "/health/ready"

# Check Backend API
if [ "$ENV" = "prod" ]; then
    check_service "API" "$API_URL" "/api/health" || true
else
    check_service "Backend" "$API_URL" "/api/auth/oidc-config" || true
fi

# Check Frontend
check_service "Frontend" "$FRONTEND_URL" "/" || true

echo ""
echo "=== Docker Container Status ==="

if [ "$ENV" = "prod" ]; then
    docker-compose -f docker-compose.prod.yml ps
else
    docker-compose ps
fi

echo ""
echo "=== Health Check Complete ==="
