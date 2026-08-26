# Changelog

All notable changes to ContentPool are documented in this file. Releases use
[Semantic Versioning](https://semver.org/); release candidates add an
`-rc.N` suffix without changing the canonical version in `VERSION`.

## [Unreleased]

### Changes

- None.

### Breaking changes

- None.

### Configuration

- None.

### Database migrations

- Classification: `none`

### Rollback

- No special instructions.

## [0.4.0] - 2026-08-26

### Changes

- Preserve the fachliche Item-ID, visible variable alias, source variable, and
  internal variable ID separately, resolve derived variables through their
  source targets, and show the correct Item-ID in print views.
- Apply manual, variable-specific, code-specific, and general coding
  instructions at their intended levels without suppressing automatic rules
  when no matching manual instruction exists.
- Sort Item Explorer rows by their complete Item-ID and use VOMD item and
  stimulus times when no explicit Explorer or CSV value overrides them.
- Make all visible Item Explorer columns configurable by visibility, order,
  and width while retaining compatible saved layouts.
- Add text complexity imports and display, and allow item parameters to be
  imported without complete booklet-position data after explicit confirmation.
- Serialize Item Explorer draft updates so rapid search and filter changes no
  longer create self-inflicted version conflicts.
- Add ACP-scoped item comment threads to the Item Explorer, including shared
  visibility, replies, author labels, timestamps, author-only editing and
  deletion, and thread-aware exports.
- Remove an invalid start-page comment entry that could be shown without an
  associated item.

### Breaking changes

- None.

### Configuration

- ACP managers can enable item comments through `enableCommenting` and
  `commentTargets`, and choose `PRIVATE` or `SHARED` comment visibility through
  `commentVisibilityMode`.

### Database migrations

- Classification: `backward-compatible`
- Extend existing comments with stable item identity, credential ownership,
  thread relationships, author labels, update timestamps, optimistic versions,
  and soft deletion. Existing comments keep their content and receive safe
  timestamp and display-label backfills without inferring credential ownership
  from mutable usernames.

### Rollback

- Application rollback does not require reverting the additive comment
  migration. Previous backends ignore the new columns; comments created by the
  new thread interface remain stored but their thread metadata is unavailable
  until the new application version is restored.

## [0.3.0] - 2026-07-31

### Changes

- Add BiStaTest-oriented Item Explorer configuration for displaying general
  coding instructions and preferring manually authored instructions.
- Persist custom metadata column definitions and widths, and improve column
  selection, sticky table layout, row selection, and row-state feedback.
- Allow users to share item collections, activate shared collections, and copy
  them into their own collections.
- Expand responsive, interaction, and cross-browser coverage for Item Explorer
  workflows and install all required browser dependencies in CI.
- Update transitive `brace-expansion` dependencies to patched releases and
  document the scanner exception for fixed 1.x and 2.x backports.
- Make release-candidate image publication retry-safe and add an explicit,
  protected production-only exception path that does not claim staging evidence.

### Breaking changes

- None.

### Configuration

- None.

### Database migrations

- Classification: `none`

### Rollback

- No special instructions.

## [0.2.0] - 2026-07-22

### Changes

- Add a gated release-candidate and promotion process.
- Pin deployable application images by digest and expose build metadata.
- Add manifest-driven, auditable staging and production updates.
- Refresh pinned runtime bases and remove package-manager tooling from the
  backend runtime image.
- Preserve adopted legacy Compose project names so managed updates continue to
  use the existing database and upload volumes.
- Add checksum-validated local legacy baselines, exact-digest rollback, and
  structural validation for database backups.
- Wait for both restored PostgreSQL services to become healthy before invoking
  `pg_restore`.
- Wait for the complete restored application stack to become healthy before
  running release identity and endpoint checks.
- Wait for stack health during normal updates, legacy rollback, and automatic
  application recovery before evaluating deployment health.
- Persist Item Explorer reference and selection settings and add scalable,
  paginated collection-detail editing.
- Route all application-user authentication through Keycloak OIDC while
  retaining ACP-specific credential-list access for restricted viewers.
- Return OIDC logout to the installer-approved `/login` URL so existing
  Keycloak client settings accept the post-logout redirect.

### Breaking changes

- Server deployments no longer default to the mutable `latest` image tag.
- Managed deployments require a release manifest and explicit environment.
- Local ContentPool username/password login for application users is removed;
  every application user must have a working Keycloak identity.

### Configuration

- Add `DEPLOYMENT_ENV`, `COMPOSE_PROJECT_NAME`, `RELEASE_VERSION`, `APPLICATION_VERSION`, `RELEASE_COMMIT`,
  `RELEASE_BUILT_AT`, `CONTENT_POOL_BACKEND_IMAGE`, and
  `CONTENT_POOL_FRONTEND_IMAGE`.
- Deployment tools accept `--compose-override` and `--base-url` for isolated
  rehearsals on a shared Docker host.
- Remove the obsolete `SEED_DEFAULT_ADMIN` setting. Fresh and existing
  application users are provisioned through Keycloak OIDC.

### Database migrations

- Classification: `backward-compatible`
- A compatibility trigger derives response-state row keys for writes from the
  previous stable backend. It remains in place until a later contract release.
- The legacy `users.password_hash` column remains present with an empty default
  so Keycloak-only user creation and rollback to the previous backend both
  remain possible. Its removal is deferred to a later contract release.

### Rollback

- Adopt the currently running image digests before the first managed update.
- Application rollback never automatically reverts database migrations.
- Adopted legacy releases can be restored from their checksum-validated local
  baseline without relying on a historical GitHub release manifest.
- After an application rollback, users created by 0.2.0 continue to sign in
  through Keycloak; no local password is synthesized for them.

[Unreleased]: https://github.com/iqb-berlin/content-pool-next/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/iqb-berlin/content-pool-next/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/iqb-berlin/content-pool-next/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/iqb-berlin/content-pool-next/compare/v0.1.3...v0.2.0
