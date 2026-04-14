# Keycloak Setup for IQB ContentPool

Keycloak is integrated as an Identity Provider for both development and production environments.

This setup supports **two deployment modes**:
- **Mode 1: IP-Only** - Use when you only have a server IP (HTTP only, less secure)
- **Mode 2: Domain with HTTPS** - Use when you have a domain with SSL certificates (recommended)

---

## Mode 1: IP-Only Deployment (HTTP)

**⚠️ Security Warning**: This mode uses unencrypted HTTP. Tokens are transmitted in plain text.
- Acceptable for: Private networks, testing, temporary deployments
- **Not recommended for**: Public internet, production with sensitive data

### Prerequisites

- Server with a public IP address
- Ports 80 and 8080 accessible (configure firewall)

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and use **Mode 1** configuration:

```bash
# ════════════════════════════════════════════════════════
# MODE 1: IP-ONLY DEPLOYMENT (HTTP - Less Secure)
# ════════════════════════════════════════════════════════
KEYCLOAK_HOSTNAME=                    # Leave empty for IP mode
KEYCLOAK_COMMAND=["start-dev", "--import-realm"]
KC_HTTP_ENABLED=true
KC_HOSTNAME_STRICT_HTTPS=false
KC_PROXY=none
KEYCLOAK_PORT_EXPOSE=8080:8080        # Bind to all interfaces

OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
OIDC_PUBLIC_ISSUER_URL=http://YOUR_SERVER_IP:8080/realms/iqb
OIDC_REDIRECT_URI=http://YOUR_SERVER_IP/auth/callback
CORS_ORIGIN=http://YOUR_SERVER_IP

# Database (same for both modes)
KEYCLOAK_DB_NAME=keycloak
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_PASSWORD=change-me-to-a-secure-password

# Admin credentials
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=change-me-to-a-secure-password

# Application settings
POSTGRES_DB=content_pool
POSTGRES_USER=content_pool
POSTGRES_PASSWORD=change-me-to-a-secure-password
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
JWT_EXPIRATION=24h
```

**Replace `YOUR_SERVER_IP`** with your actual server IP address.

### 2. Update realm-export.json

Edit `keycloak/realm-export.json` and update the IP placeholder:

```json
"redirectUris": [
  "http://YOUR_SERVER_IP/*",
  "http://YOUR_SERVER_IP:80/*"
],
"webOrigins": [
  "http://YOUR_SERVER_IP",
  "http://YOUR_SERVER_IP:80"
]
```

### 3. Configure Firewall

Open port 8080 for Keycloak:

```bash
# Ubuntu/Debian with ufw
sudo ufw allow 8080/tcp

# CentOS/RHEL with firewall-cmd
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

### 4. Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Access

- Application: `http://YOUR_SERVER_IP`
- Keycloak Admin: `http://YOUR_SERVER_IP:8080/admin`
  - Username: `admin` (from .env)
  - Password: (from .env)

### 6. Create Admin User

1. Login to Keycloak Admin Console
2. Select `iqb` realm → Users → Add user
3. Set username, email, first/last name
4. Credentials tab → Set password
5. Role mappings → Assign `admin` realm role

---

## Mode 2: Domain Deployment (HTTPS) - Recommended

### Prerequisites

- A domain name (e.g., `yourdomain.com`)
- Valid SSL/TLS certificates (Let's Encrypt recommended)
- DNS configured for `yourdomain.com` and `auth.yourdomain.com`

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and use **Mode 2** configuration:

```bash
# ════════════════════════════════════════════════════════
# MODE 2: DOMAIN DEPLOYMENT (HTTPS - Recommended)
# ════════════════════════════════════════════════════════
KEYCLOAK_HOSTNAME=auth.yourdomain.com
KEYCLOAK_COMMAND=["start", "--optimized", "--import-realm"]
KC_HTTP_ENABLED=false
KC_HOSTNAME_STRICT_HTTPS=true
KC_PROXY=edge
KEYCLOAK_PORT_EXPOSE=127.0.0.1:8080:8080  # Local only

OIDC_ISSUER_URL=http://keycloak:8080/realms/iqb
OIDC_PUBLIC_ISSUER_URL=https://auth.yourdomain.com/realms/iqb
OIDC_REDIRECT_URI=https://yourdomain.com/auth/callback
CORS_ORIGIN=https://yourdomain.com

# Database
KEYCLOAK_DB_NAME=keycloak
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_PASSWORD=change-me-to-a-secure-password

# Admin credentials
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASSWORD=change-me-to-a-very-secure-password

# Application settings
POSTGRES_DB=content_pool
POSTGRES_USER=content_pool
POSTGRES_PASSWORD=change-me-to-a-secure-password
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
JWT_EXPIRATION=24h
```

### 2. Update realm-export.json

Edit `keycloak/realm-export.json` and update the domain placeholders:

```json
"redirectUris": [
  "https://yourdomain.com/*"
],
"webOrigins": [
  "https://yourdomain.com"
]
```

### 3. Configure SSL Certificates

**Option A: Let's Encrypt (Recommended)**

1. Obtain certificates:
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com -d auth.yourdomain.com
   ```

2. Uncomment HTTPS in `docker-compose.prod.yml`:
   ```yaml
   ports:
     - "80:80"
     - "443:443"
   volumes:
     - ./nginx.prod.conf:/etc/nginx/conf.d/default.conf:ro
     - /etc/letsencrypt:/etc/letsencrypt:ro
   ```

3. Update `nginx.prod.conf`:
   ```nginx
   server_name yourdomain.com;
   ```

**Option B: External Load Balancer**

If using AWS ALB, Cloudflare, etc.:
- Configure load balancer to forward HTTP to nginx
- Ensure `X-Forwarded-Proto: https` header is passed

### 4. Deploy

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 5. Access

- Application: `https://yourdomain.com`
- Keycloak Admin: `https://auth.yourdomain.com/admin`

### 6. Create Admin User

Same steps as IP mode: Keycloak Admin → Users → Add user → Assign `admin` role

### 7. Security Hardening

1. **Restrict admin console access** in `nginx.prod.conf`:
   ```nginx
   location /admin/ {
       # ... proxy settings ...
       allow 10.0.0.0/8;     # Your office/VPN IP
       deny all;
   }
   ```

2. **Enable 2FA** in Keycloak: Realm Settings → Authentication → OTP

3. **Review brute force settings**: Realm Settings → Security Defenses

## Configuration Reference

### Mode-Specific Variables

| Variable | IP-Only Mode | Domain/HTTPS Mode |
|----------|--------------|-------------------|
| `KEYCLOAK_HOSTNAME` | Empty or your IP | `auth.yourdomain.com` |
| `KEYCLOAK_COMMAND` | `["start-dev", "--import-realm"]` | `["start", "--optimized", "--import-realm"]` |
| `KC_HTTP_ENABLED` | `true` | `false` |
| `KC_HOSTNAME_STRICT_HTTPS` | `false` | `true` |
| `KC_PROXY` | `none` | `edge` |
| `KEYCLOAK_PORT_EXPOSE` | `8080:8080` (all interfaces) | `127.0.0.1:8080:8080` (localhost only) |
| `OIDC_ISSUER_URL` | `http://keycloak:8080/realms/iqb` | `http://keycloak:8080/realms/iqb` |
| `OIDC_PUBLIC_ISSUER_URL` | `http://YOUR_IP:8080/realms/iqb` | `https://auth.yourdomain.com/realms/iqb` |

### Common Variables (Required for Both Modes)

| Variable | Description |
|----------|-------------|
| `KEYCLOAK_DB_PASSWORD` | PostgreSQL password for Keycloak database |
| `KEYCLOAK_ADMIN_PASSWORD` | Keycloak admin password |
| `POSTGRES_PASSWORD` | Application database password |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) |

### Development Setup

For local development, use the development compose file:

```bash
docker-compose up -d
```

This uses HTTP, pre-configured test users (admin/admin123, user/user123), and H2 database.

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

## Security Comparison

| Feature | IP-Only (HTTP) | Domain (HTTPS) |
|---------|----------------|----------------|
| Encryption | ❌ None (tokens in plain text) | ✅ TLS 1.2/1.3 |
| Brute Force Protection | ✅ Enabled | ✅ Enabled |
| Client Type | Confidential (secret required) | Confidential (secret required) |
| Hardcoded Users | ❌ None (must create) | ❌ None (must create) |
| Database | ✅ PostgreSQL | ✅ PostgreSQL |
| Production Mode | ❌ Development mode | ✅ Optimized production |

**⚠️ IP-Only Mode Warnings:**
- Tokens are transmitted unencrypted
- Susceptible to man-in-the-middle attacks on public networks
- Use only for testing or private networks
- Migrate to HTTPS as soon as you have a domain

## Troubleshooting

### "Invalid redirect_uri" error

The redirect URI in the request must match exactly what's configured in Keycloak.

**Check/replace in `keycloak/realm-export.json` before first deployment:**
```json
"redirectUris": [
  "http://YOUR_IP/*",           // For IP mode
  "https://yourdomain.com/*"    // For domain mode
]
```

**Or fix via Keycloak Admin Console:**
1. Login to Keycloak Admin Console
2. Select `iqb` realm → Clients → `contentpool`
3. Valid Redirect URIs → Add your URL

### IP Mode: "Cannot connect to Keycloak"

1. **Check firewall**: Port 8080 must be open
   ```bash
   sudo ufw status  # Ubuntu
   sudo firewall-cmd --list-ports  # CentOS
   ```

2. **Verify port binding**:
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   # Should show 0.0.0.0:8080->8080/tcp or YOUR_IP:8080->8080/tcp
   ```

3. **Check environment**: Ensure `KEYCLOAK_PORT_EXPOSE=8080:8080` (not 127.0.0.1)

### Domain Mode: SSL/TLS Issues

1. **Certificate errors**:
   - Verify certificates mounted in docker-compose.prod.yml
   - Check permissions: `sudo ls -la /etc/letsencrypt/live/yourdomain.com/`

2. **Hostname mismatch**:
   - Ensure `KEYCLOAK_HOSTNAME` matches certificate CN/SAN
   - Check: `openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -text | grep DNS`

3. **Mixed content errors** (HTTP/HTTPS mixed):
   - Verify all URLs in `.env` use `https://`
   - Check `CORS_ORIGIN` matches your domain

### Database Connection Issues

```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs keycloak

# Verify database is healthy
docker-compose -f docker-compose.prod.yml ps

# Common fixes:
# 1. Ensure KEYCLOAK_DB_PASSWORD is set
# 2. Check keycloak-db container is running
# 3. Verify network connectivity: docker network inspect content-pool-next_keycloak-network
```

### Migrating from IP to Domain

When you get a domain, follow these steps:

1. **Update DNS**: Point domain and auth subdomain to your server IP
2. **Obtain SSL certificates**: Use Let's Encrypt or your provider
3. **Update `.env`**: Switch from Mode 1 to Mode 2 configuration
4. **Update `realm-export.json`**: Replace IP with domain in redirect URIs
5. **Update nginx**: Add HTTPS configuration
6. **Restart services**:
   ```bash
   docker-compose -f docker-compose.prod.yml down
   docker-compose -f docker-compose.prod.yml up -d
   ```
7. **Verify**: Test login at `https://yourdomain.com`
