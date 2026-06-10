# Keycloak Registration and ALTCHA

ContentPool allows direct Keycloak self-registration. New users must verify
their email address before they can sign in.

The registration form is intentionally not restricted to HU/IQB email domains.
Bot protection is handled by a self-hosted ALTCHA proof-of-work challenge in
the Keycloak registration flow.

## Deployment Model

```text
Browser -> Keycloak registration form -> ALTCHA widget
        -> Keycloak registration FormAction -> email verification
```

ALTCHA is self-hosted:

- the browser widget is served from the local Keycloak theme,
- challenges are generated and signed by the Keycloak provider,
- submitted payloads are verified inside Keycloak,
- no Google, Cloudflare, or external CAPTCHA verification service is called.

## Build the Provider

Build the Keycloak provider before starting or updating Keycloak:

```bash
make keycloak-altcha-provider
```

This creates:

```text
keycloak/providers/content-pool-keycloak-altcha.jar
```

The JAR is a build artifact and is not committed. The Compose files mount
`./keycloak/providers` into `/opt/keycloak/providers`.

## Required Environment

Set a strong HMAC secret in `.env`:

```bash
ALTCHA_HMAC_SECRET=<long-random-secret>
```

Generate one with:

```bash
openssl rand -hex 32
```

Changing the secret invalidates already-rendered registration challenges, which
is acceptable. It does not affect existing users.

## Realm Configuration

Fresh realm imports enable registration and email verification through
`keycloak/realm-export.json`, but the ALTCHA execution should still be applied
after Keycloak has loaded the provider JAR.

Existing Keycloak databases are not automatically changed by realm imports.
After deploying the provider and restarting Keycloak, always run:

```bash
make keycloak-registration
```

The script:

- enables self-registration,
- enables email verification,
- keeps duplicate emails disabled,
- adds the `registration-altcha-action` execution to the `registration` flow,
- marks the ALTCHA execution as `REQUIRED`.

If the script reports that it cannot find `registration-altcha-action`, rebuild
the provider and restart Keycloak so the JAR is loaded.

## Manual Admin Console Setup

If needed, configure the flow manually:

1. Open `Authentication -> Flows`.
2. Select the `registration` flow.
3. Add execution `ALTCHA`.
4. Set the execution requirement to `Required`.
5. Open `Realm settings -> Login`.
6. Enable `User registration`.
7. Enable `Verify email`.
8. Keep `Duplicate emails` disabled.

The provider can read its HMAC secret from `ALTCHA_HMAC_SECRET`, so the
execution does not need to store the secret in Keycloak's database. If you do
set a secret in the execution config, it takes precedence over the environment
variable.

## Operational Notes

ALTCHA raises the cost of automated registrations but does not replace rate
limits. Keep reverse-proxy rate limits for registration, password reset, and
token endpoints, and keep Keycloak brute-force protection enabled.

Newly registered users should receive only minimal default roles. Access to ACPs
and administrative features must continue to be controlled by ContentPool roles
and access configuration.
