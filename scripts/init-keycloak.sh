#!/bin/bash
# Initialize Keycloak realm and users for fresh deployment

set -e

KEYCLOAK_URL="${1:-http://localhost:8080}"
ADMIN_USER="${2:-admin}"
ADMIN_PASS="${3:-admin}"
REALM_NAME="iqb"

echo "=== Keycloak Initialization Script ==="
echo "URL: $KEYCLOAK_URL"
echo ""

# Wait for Keycloak to be ready
echo "Waiting for Keycloak to start..."
until curl -s "$KEYCLOAK_URL/health/ready" > /dev/null 2>&1; do
    echo "  Keycloak not ready yet, waiting..."
    sleep 5
done
echo "Keycloak is ready!"
echo ""

# Get admin token
echo "Authenticating as admin..."
TOKEN_RESPONSE=$(curl -s -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$ADMIN_USER" \
    -d "password=$ADMIN_PASS" \
    -d "grant_type=password" \
    -d "client_id=admin-cli")

ADMIN_TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Error: Failed to authenticate"
    echo "Response: $TOKEN_RESPONSE"
    exit 1
fi

echo "Authenticated successfully!"
echo ""

# Check if realm exists
echo "Checking if realm '$REALM_NAME' exists..."
REALM_CHECK=$(curl -s -o /dev/null -w "%{http_code}" \
    "$KEYCLOAK_URL/admin/realms/$REALM_NAME" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

if [ "$REALM_CHECK" = "200" ]; then
    echo "Realm '$REALM_NAME' already exists."
else
    echo "Realm '$REALM_NAME' does not exist."
    echo "Please ensure the realm is imported via docker-compose volume."
    echo "The keycloak/realm-export.json file should be mounted at /opt/keycloak/data/import/"
fi

echo ""
echo "=== Keycloak initialization check complete ==="
echo ""
echo "Admin Console: $KEYCLOAK_URL/admin"
echo "Realm: $REALM_NAME"
echo ""
echo "Default users:"
echo "  - admin / admin123 (admin role)"
echo "  - user / user123 (user role)"
