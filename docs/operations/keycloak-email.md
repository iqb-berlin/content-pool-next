# Keycloak Email Delivery

ContentPool uses Keycloak for transactional email such as address verification,
password reset, and administrative notifications.

The recommended HU deployment path is:

```text
Keycloak container -> local MTA/Postfix on Docker host -> mailhost.cms.hu-berlin.de
```

This keeps Keycloak simple and gives the server a local mail queue if the HU
relay is temporarily unavailable.

## 1. Install a local MTA on the server

On a Debian/Ubuntu server, install Postfix, a small mail test tool, and the
CLI dependencies used by the Keycloak SMTP helper:

```bash
sudo apt-get update
sudo apt-get install postfix mailutils curl jq
```

During the Postfix prompt, choose a relay/smarthost-style setup if offered.
The important final setting is that outbound mail is relayed to the HU relay:

```bash
sudo postconf -e 'relayhost = [mailhost.cms.hu-berlin.de]:25'
```

## 2. Allow the Keycloak container to reach Postfix

The production Compose files map `host.docker.internal` to the Docker host for
the Keycloak container. Postfix must therefore listen on an address reachable
from the Docker network, not only on `127.0.0.1`.

Resolve the actual host-gateway address that Keycloak sees as
`host.docker.internal`, then note the Docker subnets used by the networks
attached to the Keycloak service:

Run these commands after the production stack, or at least the `keycloak`
service, is up:

```bash
docker network ls | grep keycloak-network
docker compose -f docker-compose.server.yml exec -T keycloak \
  bash -lc "getent hosts host.docker.internal 2>/dev/null || grep '[[:space:]]host\\.docker\\.internal$' /etc/hosts"
docker network inspect <compose-project>_keycloak-network --format '{{(index .IPAM.Config 0).Subnet}}'
docker network inspect <compose-project>_app-network --format '{{(index .IPAM.Config 0).Subnet}}'
```

If you deploy from source, use `docker-compose.prod.yml` in the `docker compose`
command instead.

Before restarting Postfix, make sure the host firewall blocks public inbound
SMTP on port 25. Then bind Postfix to localhost and the resolved
`host.docker.internal` address, and restrict relay permission to localhost plus
the Docker subnets attached to Keycloak:

```bash
sudo postconf -e 'inet_interfaces = 127.0.0.1, <host-gateway-ip>'
sudo postconf -e 'mynetworks = 127.0.0.0/8 [::1]/128 <keycloak-docker-subnet> <app-docker-subnet>'
sudo postconf -e 'smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination'
sudo systemctl restart postfix
```

If binding to the resolved host-gateway address is not possible on a specific
host, use `inet_interfaces = all` only after the firewall rule is in place. The
server should not become a public mail relay.

## 3. Configure Keycloak SMTP

For fresh deployments, `keycloak/realm-export.json` already points Keycloak to
the local host MTA:

```text
host: host.docker.internal
port: 25
auth: false
ssl/starttls: false
from: noreply@iqb.hu-berlin.de
```

For an existing Keycloak database, realm imports are not automatically
reapplied. Also, fresh imports use the JSON defaults until changed through the
admin API. If your `.env` SMTP values differ from those defaults, configure the
running realm after Keycloak is up:

```bash
make keycloak-smtp
```

The script reads these optional values from `.env`:

```text
KEYCLOAK_SMTP_HOST=host.docker.internal
KEYCLOAK_SMTP_PORT=25
KEYCLOAK_SMTP_FROM=noreply@iqb.hu-berlin.de
KEYCLOAK_SMTP_FROM_DISPLAY_NAME="IQB ContentPool"
KEYCLOAK_SMTP_SSL=false
KEYCLOAK_SMTP_STARTTLS=false
KEYCLOAK_SMTP_AUTH=false
```

If the Keycloak admin console is only reachable through an SSH tunnel, open the
tunnel first:

```bash
ssh -L 8080:127.0.0.1:8080 USER@YOUR_SERVER
make keycloak-smtp
```

You can also configure the same values in Keycloak Admin Console under:

```text
Realm settings -> Email
```

## 4. Verify delivery

Check that Keycloak can reach the host MTA:

```bash
docker compose -f docker-compose.server.yml exec keycloak \
  bash -lc 'cat < /dev/null > /dev/tcp/host.docker.internal/25 && echo SMTP reachable'
```

Watch Postfix and Keycloak while sending a Keycloak test mail or password-reset
mail:

```bash
journalctl -u postfix -f
postqueue -p
docker compose -f docker-compose.server.yml logs -f keycloak
```

Expected behavior:

- Keycloak hands the message to `host.docker.internal:25`.
- Postfix accepts the message into its local queue.
- Postfix relays the message to `mailhost.cms.hu-berlin.de`.

The HU relay currently allows 300 target addresses per hour for the normal path.
For reliable bounce handling, request a CMS function account or agreed sender
address through the CMS user support channel.
