#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"

read_env_value() {
  local key="$1"
  local default_value="${2:-}"
  local line
  local value

  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi

  if [[ -f "$ENV_FILE" ]]; then
    line="$(grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 || true)"
    if [[ -n "$line" ]]; then
      value="${line#*=}"
      value="${value%$'\r'}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command curl
require_command jq

KEYCLOAK_URL="${1:-$(read_env_value KEYCLOAK_URL http://localhost:8080)}"
KEYCLOAK_REALM="$(read_env_value KEYCLOAK_REALM iqb)"
KEYCLOAK_ADMIN_USER="$(read_env_value KEYCLOAK_ADMIN_USER admin)"
KEYCLOAK_ADMIN_PASSWORD="$(read_env_value KEYCLOAK_ADMIN_PASSWORD admin)"
ALTCHA_HMAC_SECRET="$(read_env_value ALTCHA_HMAC_SECRET '')"
ALTCHA_PROVIDER_ID="registration-altcha-action"
REGISTRATION_FLOW_ALIAS="${KEYCLOAK_REGISTRATION_FLOW_ALIAS:-registration}"

if [[ -z "$ALTCHA_HMAC_SECRET" ]]; then
  echo "ALTCHA_HMAC_SECRET must be set in the environment or .env." >&2
  exit 1
fi

TMP_PARENT="${TMPDIR:-/tmp}"
TMP_DIR="$(mktemp -d "${TMP_PARENT%/}/keycloak-registration.XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
chmod 700 "$TMP_DIR"

KEYCLOAK_ADMIN_PASSWORD_FILE="$TMP_DIR/keycloak-admin-password"
AUTH_HEADER_FILE="$TMP_DIR/keycloak-auth-header"
REALM_FILE="$TMP_DIR/realm.json"
UPDATED_REALM_FILE="$TMP_DIR/realm-updated.json"
EXECUTIONS_FILE="$TMP_DIR/executions.json"
UPDATE_EXECUTION_FILE="$TMP_DIR/update-execution.json"

printf '%s' "$KEYCLOAK_ADMIN_PASSWORD" > "$KEYCLOAK_ADMIN_PASSWORD_FILE"
chmod 600 "$KEYCLOAK_ADMIN_PASSWORD_FILE"

TOKEN_RESPONSE="$(
  curl -fsS -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=admin-cli" \
    --data-urlencode "username=$KEYCLOAK_ADMIN_USER" \
    --data-urlencode "password@$KEYCLOAK_ADMIN_PASSWORD_FILE"
)"

ACCESS_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | jq -r '.access_token // empty')"
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Could not obtain a Keycloak admin token from $KEYCLOAK_URL." >&2
  exit 1
fi

printf 'Authorization: Bearer %s\n' "$ACCESS_TOKEN" > "$AUTH_HEADER_FILE"
chmod 600 "$AUTH_HEADER_FILE"

curl -fsS "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM" \
  -H "@$AUTH_HEADER_FILE" \
  > "$REALM_FILE"

jq '
  .registrationAllowed = true
  | .verifyEmail = true
  | .duplicateEmailsAllowed = false
  | .loginWithEmailAllowed = true
' "$REALM_FILE" > "$UPDATED_REALM_FILE"

curl -fsS -X PUT "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM" \
  -H "@$AUTH_HEADER_FILE" \
  -H "Content-Type: application/json" \
  --data-binary "@$UPDATED_REALM_FILE" >/dev/null

curl -fsS "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/authentication/flows/$REGISTRATION_FLOW_ALIAS/executions" \
  -H "@$AUTH_HEADER_FILE" \
  > "$EXECUTIONS_FILE"

execution_id="$(jq -r --arg provider "$ALTCHA_PROVIDER_ID" '
  .[]
  | select(.providerId == $provider or .authenticator == $provider)
  | .id
  ' "$EXECUTIONS_FILE" | head -n 1)"

if [[ -z "$execution_id" ]]; then
  curl -fsS -X POST "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/authentication/flows/$REGISTRATION_FLOW_ALIAS/executions/execution" \
    -H "@$AUTH_HEADER_FILE" \
    -H "Content-Type: application/json" \
    --data-binary "{\"provider\":\"$ALTCHA_PROVIDER_ID\"}" >/dev/null

  curl -fsS "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/authentication/flows/$REGISTRATION_FLOW_ALIAS/executions" \
    -H "@$AUTH_HEADER_FILE" \
    > "$EXECUTIONS_FILE"

  execution_id="$(jq -r --arg provider "$ALTCHA_PROVIDER_ID" '
    .[]
    | select(.providerId == $provider or .authenticator == $provider)
    | .id
    ' "$EXECUTIONS_FILE" | head -n 1)"
fi

if [[ -z "$execution_id" ]]; then
  echo "Could not find or add $ALTCHA_PROVIDER_ID in flow '$REGISTRATION_FLOW_ALIAS'." >&2
  echo "Make sure the provider JAR is mounted and Keycloak was restarted." >&2
  exit 1
fi

jq -n --arg id "$execution_id" '{id: $id, requirement: "REQUIRED"}' > "$UPDATE_EXECUTION_FILE"

curl -fsS -X PUT "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/authentication/flows/$REGISTRATION_FLOW_ALIAS/executions" \
  -H "@$AUTH_HEADER_FILE" \
  -H "Content-Type: application/json" \
  --data-binary "@$UPDATE_EXECUTION_FILE" >/dev/null

echo "Configured Keycloak registration for realm '$KEYCLOAK_REALM'."
echo "Self-registration: enabled"
echo "Email verification: enabled"
echo "ALTCHA execution: $execution_id REQUIRED"
