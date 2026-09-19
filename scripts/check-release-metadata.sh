#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"

version="$(tr -d '[:space:]' < VERSION)"
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  printf 'VERSION must contain stable SemVer without a v prefix: %s\n' "$version" >&2
  exit 1
}

python3 - "$version" <<'PY'
import json
import sys
from pathlib import Path

version = sys.argv[1]
for path in (Path("backend/package.json"), Path("frontend/package.json")):
    actual = json.loads(path.read_text(encoding="utf-8"))["version"]
    if actual != version:
        raise SystemExit(f"{path}: version {actual} does not match VERSION {version}")
for path in (Path("backend/package-lock.json"), Path("frontend/package-lock.json")):
    lock = json.loads(path.read_text(encoding="utf-8"))
    if lock.get("version") != version or lock.get("packages", {}).get("", {}).get("version") != version:
        raise SystemExit(f"{path}: root versions do not match VERSION {version}")

changelog = Path("CHANGELOG.md").read_text(encoding="utf-8")
if f"## [{version}]" not in changelog:
    raise SystemExit(f"CHANGELOG.md has no section for {version}")

section = changelog.split(f"## [{version}]", 1)[1]
section = section.split("\n## [", 1)[0]
for heading in ("Changes", "Breaking changes", "Configuration", "Database migrations", "Rollback"):
    if f"### {heading}" not in section:
        raise SystemExit(f"CHANGELOG.md {version} section is missing '{heading}'")
classifications = ("none", "backward-compatible", "manual")
matches = [item for item in classifications if f"Classification: `{item}`" in section]
if len(matches) != 1:
    raise SystemExit(f"CHANGELOG.md {version} section must have exactly one migration classification")
PY

previous_tag="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | grep -Ev -- '-rc\.' | head -n 1 || true)"
if [[ -n "$previous_tag" ]] && ! git diff --quiet "$previous_tag" -- backend/src/database/migrations; then
  migration_section="$version"
  if [[ "$previous_tag" == "v${version}" ]]; then
    migration_section="Unreleased"
  fi

  migration_classification="$(python3 - "$migration_section" <<'PY'
from pathlib import Path
import sys

text = Path("CHANGELOG.md").read_text(encoding="utf-8")
section_name = sys.argv[1]
marker = f"## [{section_name}]"
if marker not in text:
    raise SystemExit(f"CHANGELOG.md has no section for {section_name}")
section = text.split(marker, 1)[1].split("\n## [", 1)[0]
classifications = ("none", "backward-compatible", "manual")
matches = [item for item in classifications if f"Classification: `{item}`" in section]
if len(matches) != 1:
    raise SystemExit(
        f"CHANGELOG.md {section_name} section must have exactly one migration classification"
    )
print(matches[0])
PY
  )"
  if [[ "$migration_classification" == "none" ]]; then
    printf 'Migration files changed since %s but changelog section %s is classified as none\n' "$previous_tag" "$migration_section" >&2
    exit 1
  fi
fi

if rg -n 'IMAGE_VERSION=latest|\$\{IMAGE_VERSION:-latest\}' .env.example docker-compose.server.yml >/dev/null; then
  printf 'Managed deployment files must not default to latest\n' >&2
  exit 1
fi

printf 'Release metadata is consistent for %s\n' "$version"
