# Keycloak Setup (ContentPool)

ContentPool uses Keycloak via OpenID Connect with **Authorization Code Flow + PKCE**.

## Dev vs Production Realm

- Development (`docker-compose.yml`) imports `keycloak/realm-export.dev.json`:
  - `sslRequired: none`
  - localhost redirect URIs / web origins
- Production (`docker-compose.prod.yml`, `docker-compose.server.yml`) imports `keycloak/realm-export.json`:
  - `sslRequired: external`
  - secure domain-based baseline

## Secure baseline

- Keycloak runs in production mode (`start`)
- Reverse proxy mode: `KC_PROXY=edge`
- Internal HTTP only: `KC_HTTP_ENABLED=true`
- Public HTTPS required (`sslRequired: external` in realm export)
- Keycloak port bound to localhost by default: `127.0.0.1:8080:8080`
- Frontend callback path: `/auth/callback`

## Required env variables

```bash
KEYCLOAK_HOSTNAME=auth.example.com
KC_PROXY=edge
KC_HTTP_ENABLED=true
KC_HOSTNAME_STRICT=true
KC_HOSTNAME_STRICT_HTTPS=true
KEYCLOAK_HOSTNAME_STRICT_BACKCHANNEL=false
KEYCLOAK_PORT_EXPOSE=127.0.0.1:8080:8080

OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
OIDC_PUBLIC_ISSUER_URL=https://auth.example.com/realms/iqb
OIDC_REDIRECT_URI=https://app.example.com/auth/callback
OIDC_CLIENT_ID=contentpool
OIDC_SCOPE=openid profile email
```

## Nginx routing requirements

The reverse proxy must forward these Keycloak paths to the Keycloak container:

- `/realms/*`
- `/resources/*`

Important:

- Do **not** proxy `/auth/*` to Keycloak, because ContentPool needs `/auth/callback` for the frontend callback route.

## Realm export defaults

`keycloak/realm-export.json` already contains a secure client baseline:

- `standardFlowEnabled: true`
- `implicitFlowEnabled: false`
- `directAccessGrantsEnabled: false`
- `publicClient: true`
- `pkce.code.challenge.method: S256`
- `sslRequired: external`
- `registrationAllowed: false`

You still must replace placeholder domains/IPs in:

- `redirectUris`
- `webOrigins`

## Admin access (recommended)

Use SSH tunneling instead of exposing Keycloak admin publicly:

```bash
ssh -L 8080:127.0.0.1:8080 USER@YOUR_SERVER
```

Then open `http://localhost:8080/admin`.

## Role mapping

ContentPool maps Keycloak roles automatically:

- realm/client role `admin` -> `isAppAdmin=true`
- otherwise regular user

No manual linking is required for new OIDC users.

## Quick verification

```bash
curl -s https://app.example.com/api/auth/oidc-config
curl -s https://auth.example.com/realms/iqb/.well-known/openid-configuration
```

Expected:

- OIDC config reports `"enabled": true`
- discovery document returns HTTP 200
