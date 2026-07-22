## Release

- Target version: `X.Y.Z`
- Migration classification: `none | backward-compatible | manual`

## Changes

Summarize user-visible and operational changes.

## Breaking changes

List breaking changes or state `None`.

## Configuration changes

List new, removed, or changed configuration keys or state `None`.

## Migrations

Describe fresh-install and upgrade behavior. Confirm that the previous stable
backend can still run after this release's migrations. A one-phase incompatible
change must be marked `manual` and cannot use normal promotion.

## Rollback

Describe application rollback constraints and any separate downtime restore
requirements. Do not rely on automatic `migration:revert`.

## Release checklist

- [ ] `VERSION`, backend/frontend package versions, and package locks match
- [ ] `CHANGELOG.md` contains all required sections and migration classification
- [ ] Required configuration is represented in the release manifest inputs
- [ ] Fresh migration, previous-schema upgrade, and previous-backend compatibility pass
- [ ] Backup/restore drill and `release-gate` pass
