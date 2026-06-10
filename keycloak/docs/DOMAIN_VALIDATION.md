# Domain Validation for IQB ContentPool Registration

## Option 1: Client-Side Validation (Implemented)
✅ Already added to `register.ftl` - JavaScript checks email domain before submission.

Allowed domains: `@iqb.hu-berlin.de`, `@hu-berlin.de`, `@campus.hu-berlin.de`

## Option 2: Keycloak Server-Side Validation (Recommended for Production)

### Via Keycloak Admin Console:

1. **Access Keycloak Admin**: http://localhost:8080/admin
   - Username: `admin`
   - Password: `admin`

2. **Navigate**: Authentication → Flows

3. **Create Custom Flow**:
   - Click "Copy" on "registration" flow
   - Name it: `iqb-domain-validation`

4. **Add Validation Step**:
   - Click "Add execution"
   - Provider: "Declarative User Profile" or "Registration Profile"
   - Move it after "Registration User Creation"

5. **Configure Email Domain Validator**:
   - Click "Config" (gear icon)
   - Add validator with regex: `.*@(iqb\.hu-berlin\.de|hu-berlin\.de|campus\.hu-berlin\.de)$`

6. **Bind to Realm**:
   - Go to Realm Settings → General
   - Set "Registration Flow" to `iqb-domain-validation`

### Via realm-export.json (Configuration as Code):

Add to `realm-export.json` under `authenticationFlows`:

```json
{
  "alias": "iqb-domain-validation",
  "description": "Registration with HU Berlin domain validation",
  "providerId": "basic-flow",
  "topLevel": true,
  "builtIn": false,
  "authenticationExecutions": [
    {
      "authenticator": "registration-user-creation",
      "requirement": "REQUIRED",
      "priority": 10
    },
    {
      "authenticator": "registration-profile-action",
      "requirement": "REQUIRED",
      "priority": 20
    },
    {
      "authenticator": "registration-password-action",
      "requirement": "REQUIRED",
      "priority": 30
    },
    {
      "authenticator": "registration-email-verification",
      "requirement": "REQUIRED",
      "priority": 40
    }
  ]
}
```

## Option 3: Backend Validation (Application-Level)

Add to your NestJS backend to auto-disable non-IQB users:

```typescript
// backend/src/auth/services/oidc-validation.service.ts

const ALLOWED_DOMAINS = ['@iqb.hu-berlin.de', '@hu-berlin.de', '@campus.hu-berlin.de'];

private isAllowedDomain(email: string): boolean {
  const emailLower = email.toLowerCase();
  return ALLOWED_DOMAINS.some(domain => emailLower.endsWith(domain));
}

// In validateIdToken method, after user creation:
if (!this.isAllowedDomain(user.email)) {
  user.isActive = false; // Require admin approval
  await this.usersRepository.save(user);
  
  // Optionally notify admins
  this.logger.warn(`New external user registered: ${user.email}`);
}
```

## Option 4: Invitation-Only (Most Secure)

Disable public registration and use admin-created accounts:

1. In `realm-export.json`:
   ```json
   "registrationAllowed": false
   ```

2. Create an admin invite flow in your backend

3. Or use Keycloak's "Required Actions" with email invites

## Testing Domain Validation

```bash
# Test with valid domain
curl -X POST http://localhost:8080/realms/iqb/protocol/openid-connect/registrations \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@hu-berlin.de" \
  -d "username=testuser" \
  -d "password=test123"

# Test with invalid domain (should fail)
curl -X POST http://localhost:8080/realms/iqb/protocol/openid-connect/registrations \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=test@gmail.com" \
  -d "username=testuser2" \
  -d "password=test123"
```

## Recommended Setup for IQB

For a research/educational institution like IQB:

| Feature | Recommendation | Priority |
|---------|---------------|----------|
| Email verification | ✅ Required | High |
| Domain restriction | ✅ HU Berlin domains only | High |
| Admin approval | Optional for external collaborators | Medium |
| Password policy | Min 8 chars, complexity requirements | High |
| 2FA/MFA | For admin accounts | Medium |

## SMTP Configuration (for email verification)

Production Keycloak should send to the local MTA on the Docker host. The local
MTA then authenticates with the CMS function account and relays to the HU relay
`mailhost.cms.hu-berlin.de:587`.

```json
"smtpServer": {
  "from": "iqb-noreply@hu-berlin.de",
  "fromDisplayName": "IQB ContentPool",
  "host": "host.docker.internal",
  "port": "25",
  "ssl": "false",
  "starttls": "false",
  "auth": "false"
}
```

For local testing, use [Mailtrap](https://mailtrap.io) or disable email verification in development.
