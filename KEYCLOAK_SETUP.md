# Keycloak Setup for IQB ContentPool

Keycloak is now integrated as an Identity Provider for both development and production environments.

## Quick Start (Development)

1. Start all services:
   ```bash
   docker-compose up -d
   ```

2. Access Keycloak Admin Console:
   - URL: http://localhost:8080/admin
   - Username: `admin`
   - Password: `admin`

3. Keycloak is pre-configured with:
   - Realm: `iqb`
   - Client: `contentpool` (public client)
   - Pre-created users:
     - `admin` / `admin123` (has admin role)
     - `user` / `user123` (regular user)

4. Open the application:
   - Frontend: http://localhost:4200
   - Login with "Mit Keycloak anmelden" button

## IP-Only Deployment (No Domain)

If you only have a server IP address (no domain name):

### 1. Configure Environment Variables

```bash
# Replace 203.0.113.1 with your actual server IP
OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
OIDC_PUBLIC_ISSUER_URL=http://203.0.113.1:8080/realms/iqb
OIDC_REDIRECT_URI=http://203.0.113.1/auth/callback
OIDC_CLIENT_ID=contentpool
OIDC_SCOPE=openid profile email

# Keycloak runs in dev mode for IP-only (allows HTTP)
KEYCLOAK_COMMAND=["start-dev", "--import-realm"]
KC_HTTP_ENABLED=true
KC_HOSTNAME_STRICT_HTTPS=false
KC_PROXY=none

KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=your-secure-password

# Database
POSTGRES_DB=content_pool
POSTGRES_USER=content_pool
POSTGRES_PASSWORD=secure-password

# JWT
JWT_SECRET=your-random-secret-min-32-chars
JWT_EXPIRATION=24h

# CORS - set to your server IP
CORS_ORIGIN=http://203.0.113.1
```

### 2. Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Access

- Application: http://203.0.113.1 (via nginx on port 80)
- Keycloak Admin: http://203.0.113.1:8080/admin
  - Username: `admin`
  - Password: (from .env)

### 4. Important Notes for IP Deployments

- Keycloak runs in `start-dev` mode which allows HTTP
- **Port 8080 must be open in your firewall** for Keycloak:
  ```bash
  # Example with ufw (Ubuntu)
  sudo ufw allow 8080/tcp
  
  # Example with firewall-cmd (CentOS/RHEL)
  sudo firewall-cmd --permanent --add-port=8080/tcp
  sudo firewall-cmd --reload
  ```
- No HTTPS means tokens are transmitted unencrypted - **security risk on public networks**
- The pre-configured Keycloak client allows all redirect URIs (`http://*/*`, `https://*/*`) to work with any IP
- Consider using a reverse proxy with self-signed certificates for better security

## Configuration

### Environment Variables

| Variable | Description | Default (Dev) |
|----------|-------------|---------------|
| `OIDC_ISSUER_URL` | Internal URL for backend-to-Keycloak API | `http://keycloak:8080/realms/iqb` |
| `OIDC_PUBLIC_ISSUER_URL` | Public URL for browser redirects | `http://localhost:8080/realms/iqb` |
| `OIDC_CLIENT_ID` | Keycloak client ID | `contentpool` |
| `OIDC_REDIRECT_URI` | OAuth redirect URI | `http://localhost:4200/auth/callback` |
| `OIDC_SCOPE` | OAuth scopes | `openid profile email` |
| `KEYCLOAK_ADMIN_USER` | Keycloak admin username | `admin` |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password | `admin` |
| `KEYCLOAK_HOSTNAME` | Public hostname for Keycloak (prod domain) | - |
| `KEYCLOAK_COMMAND` | Keycloak start command | `start-dev` |
| `KC_HTTP_ENABLED` | Enable HTTP (required for IP-only) | `true` |
| `KC_HOSTNAME_STRICT_HTTPS` | Require HTTPS (disable for IP-only) | `false` |
| `KC_PROXY` | Proxy mode: `none`, `edge`, or `reencrypt` | `none` |

### Development Setup

All defaults are pre-configured in `docker-compose.yml`. Just run:

```bash
docker-compose up -d
```

### Production Setup (With Domain)

1. Copy `.env.example` to `.env` and configure:
   ```bash
   # Required for production
   KEYCLOAK_HOSTNAME=auth.yourdomain.com
   KEYCLOAK_ADMIN_PASSWORD=your-secure-password

   # OIDC URLs
   OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb  # Internal (Docker)
   OIDC_PUBLIC_ISSUER_URL=https://auth.yourdomain.com/realms/iqb  # Public
   OIDC_REDIRECT_URI=https://yourdomain.com/auth/callback

   # Keycloak production mode settings
   KEYCLOAK_COMMAND=["start", "--optimized", "--import-realm"]
   KC_HOSTNAME_STRICT=true
   KC_HOSTNAME_STRICT_HTTPS=true
   KC_PROXY=edge
   ```

2. For HTTPS production, Keycloak runs in production mode with `KC_HOSTNAME_STRICT_HTTPS=true`

3. Uncomment the HTTPS port and Let's Encrypt volume in `docker-compose.prod.yml`

4. To proxy Keycloak through nginx (optional), uncomment the Keycloak location block in `nginx.prod.conf`

## How It Works

1. **Frontend**: User clicks "Mit Keycloak anmelden" button
2. **Backend**: Returns OIDC config via `/api/auth/oidc-config`
3. **Frontend**: Redirects browser to Keycloak authorization endpoint
4. **Keycloak**: User authenticates, redirects back with tokens
5. **Frontend**: Sends access token to backend `/api/auth/oidc-callback`
6. **Backend**: Validates token with Keycloak (internal URL), creates/updates user, returns JWT

### Role Mapping

Keycloak roles are automatically mapped to application permissions:

- `admin` realm role → `isAppAdmin: true` in ContentPool
- `user` realm role → regular user

## Customizing Keycloak

### Add New Users

1. Go to http://localhost:8080/admin (dev) or your production Keycloak URL
2. Select `iqb` realm → Users → Add user
3. Set username, email, first/last name
4. Credentials tab → Set password
5. Role mappings tab → Assign realm roles (`admin` or `user`)

### Add New Clients

If you need additional OAuth clients:

1. Keycloak Admin → Clients → Create
2. Client ID: your-client-name
3. Client Protocol: `openid-connect`
4. Root URL: your application URL
5. Valid Redirect URIs: your callback URLs

## Troubleshooting

### "Invalid redirect_uri" error

Update `redirectUris` in `keycloak/realm-export.json` or via Keycloak Admin Console:
- Clients → contentpool → Valid Redirect URIs

### Backend can't connect to Keycloak

- Check `OIDC_ISSUER_URL` uses internal Docker hostname (`keycloak`)
- Verify Keycloak container is healthy: `docker-compose ps`

### Frontend can't connect to Keycloak

- Check `OIDC_PUBLIC_ISSUER_URL` is accessible from browser
- In production, ensure HTTPS is used
- Check browser console for CORS errors

### Token validation fails

- Check Keycloak logs: `docker-compose logs keycloak`
- Verify client secret matches (if using confidential client)
- Ensure realms and clients exist in Keycloak

## Security Notes

- **Development**: Uses `start-dev` mode with HTTP enabled
- **Production**: Uses `start` mode with HTTPS enforced, `KC_HOSTNAME_STRICT_HTTPS=true`
- Change default admin password in production
- Use strong `JWT_SECRET` in production
- Consider using confidential client with client secret for additional security
