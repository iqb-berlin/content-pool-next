# Releases and Promotion

## Release contract

`VERSION` is the canonical stable SemVer without a `v` prefix. Backend and
frontend package versions must match it. A release PR also updates the matching
`CHANGELOG.md` section and classifies database changes as `none`,
`backward-compatible`, or `manual`.

GitHub Actions is the only release authority. GitLab validation never publishes
images. Managed deployments never use `latest`, moving major/minor tags, or a
source archive from `master`.

After this workflow has been merged, a repository administrator configures the
required branch check and the protected environment once, naming a second
person as production approver:

```bash
./scripts/configure-github-release-settings.sh --reviewer RELEASE_APPROVER
```

## Release flow

1. Merge a release PR into `master` after the required `release-gate` succeeds.
2. Run **Release Candidate** from `master`, provide the RC number and the exact
   migration classification from `CHANGELOG.md`.
3. The workflow builds and scans backend/frontend images once, publishes a
   `vX.Y.Z-rc.N` prerelease, and records immutable image digests in
   `release-manifest.json`.
4. Deploy the candidate to the isolated staging stack:

   ```bash
   make staging-update RELEASE=vX.Y.Z-rc.N MODE=traefik
   ```

5. Complete `RELEASE_CHECKLIST.md` against staging and retain the evidence URL
   or issue reference.
6. Run **Promote Release** with the candidate and staging evidence. The
   protected `production` environment requires approval. Promotion creates the
   stable Git tag and GHCR tags from the existing digests; it never rebuilds.
7. Deploy the stable release manually on production:

   ```bash
   make production-update RELEASE=vX.Y.Z MODE=traefik
   ```

8. Store the generated `deployments/*.json` record with the operational change
   record. Confirm `/api/version` and `/version.json` report the same version,
   commit, and build time.

Migration classification `manual` intentionally cannot use the normal
promotion workflow. Redesign the migration as expand/contract or use a reviewed
maintenance plan outside the routine release process.

## First managed deployment

Before replacing a legacy tag-based deployment, capture the images that are
actually running:

```bash
make adopt-current RELEASE=v0.1.3 ENVIRONMENT=production MODE=traefik
```

The command refuses to continue unless Docker can resolve both running images
to registry digests. Repeat separately for staging. Adoption preserves the
running Compose project, writes full digest references to `.env`, and creates a
checksum-validated `baselines/vX.Y.Z` runtime snapshot for exact application
rollback.

## Rollback and restore

An update failure restores the previous runtime configuration and exact image
digests, then stops the public nginx service for inspection. It never runs
`migration:revert`. Routine migrations must therefore remain compatible with
the previous stable backend for at least one release.

An intentional application rollback is explicit:

```bash
make production-rollback RELEASE=vX.Y.Z MODE=traefik
```

For an adopted legacy release without a historical GitHub manifest, the same
command uses the local baseline. It restores the legacy runtime and adds a
temporary Compose image override so the exact captured digests are used rather
than mutable legacy tags. Database migrations are not reverted.

If an incompatible database or filesystem change requires a full recovery,
perform the documented downtime restore from one complete update backup:

```bash
make restore-backup BACKUP=backups/update_YYYYMMDD_HHMMSS MODE=traefik
```

The restore stops public/application services, restores both PostgreSQL custom
dumps with `pg_restore`, restores uploads and runtime configuration, restarts
the stack, and verifies health and release identity. Before stopping services,
it verifies `SHA256SUMS` and both tar archives; before replacing database
objects, it validates both custom dumps with `pg_restore --list`. Test this path
in an isolated environment before the first production release.

An isolated stack on a shared Docker host may supply an additional Compose file
and a non-default health URL:

```bash
./scripts/update.sh --mode server --environment staging \
  --release vX.Y.Z-rc.N \
  --compose-override /absolute/path/rehearsal.yml \
  --base-url http://127.0.0.1:18080
```

When `--manifest` points to a local file or private URL, the runtime archive and
`SHA256SUMS` must be available beside it. The installer verifies the manifest
and archive against that checksum file before extracting anything. Private
GitHub downloads can use a read-only token through `CONTENT_POOL_GITHUB_TOKEN`
(or `GH_TOKEN`); the token is never written to a deployment record.

## Environment isolation

Staging and production use separate Compose project names, databases, volumes,
domains, `.env` files, and secrets. Staging must not contain production personal
data. New installations set `COMPOSE_PROJECT_NAME` to `content-pool-staging` or
`content-pool-production`; legacy adoption preserves the running stack's
existing Compose project label. Release bundles contain no secrets.
