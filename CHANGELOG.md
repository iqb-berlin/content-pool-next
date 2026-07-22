# Changelog

All notable changes to ContentPool are documented in this file. Releases use
[Semantic Versioning](https://semver.org/); release candidates add an
`-rc.N` suffix without changing the canonical version in `VERSION`.

## [Unreleased]

### Changes

- None yet.

### Breaking changes

- None.

### Configuration

- None.

### Database migrations

- Classification: `none`

### Rollback

- No special instructions.

## [0.2.0] - Unreleased

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

### Breaking changes

- Server deployments no longer default to the mutable `latest` image tag.
- Managed deployments require a release manifest and explicit environment.

### Configuration

- Add `DEPLOYMENT_ENV`, `COMPOSE_PROJECT_NAME`, `RELEASE_VERSION`, `APPLICATION_VERSION`, `RELEASE_COMMIT`,
  `RELEASE_BUILT_AT`, `CONTENT_POOL_BACKEND_IMAGE`, and
  `CONTENT_POOL_FRONTEND_IMAGE`.
- Deployment tools accept `--compose-override` and `--base-url` for isolated
  rehearsals on a shared Docker host.

### Database migrations

- Classification: `backward-compatible`
- A compatibility trigger derives response-state row keys for writes from the
  previous stable backend. It remains in place until a later contract release.

### Rollback

- Adopt the currently running image digests before the first managed update.
- Application rollback never automatically reverts database migrations.
- Adopted legacy releases can be restored from their checksum-validated local
  baseline without relying on a historical GitHub release manifest.

[Unreleased]: https://github.com/iqb-berlin/content-pool-next/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/iqb-berlin/content-pool-next/compare/v0.1.3...v0.2.0
