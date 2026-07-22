#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
for script in "$ROOT_DIR"/scripts/*.sh; do
  bash -n "$script"
done

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/content-pool-script-test.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
mkdir -p "$temp_dir/scripts" "$temp_dir/bin"
cp "$ROOT_DIR/.env.example" "$temp_dir/.env"
cp "$ROOT_DIR/scripts/update.sh" "$ROOT_DIR/scripts/deploy-common.sh" "$temp_dir/scripts/"

cat > "$temp_dir/bin/docker" <<'SH'
#!/usr/bin/env bash
if [[ "${1:-}" == compose && "${2:-}" == version ]]; then exit 0; fi
exit 0
SH
chmod +x "$temp_dir/bin/docker"

(
  cd "$temp_dir"
  PATH="$temp_dir/bin:$PATH" ./scripts/update.sh \
    --environment staging --release v0.2.0-rc.1 --dry-run >/dev/null
)

if (
  cd "$temp_dir"
  PATH="$temp_dir/bin:$PATH" ./scripts/update.sh \
    --environment production --release v0.2.0-rc.1 --dry-run >/dev/null 2>&1
); then
  echo "production accepted a release candidate" >&2
  exit 1
fi

fixture_dir="$temp_dir/release-fixture"
mkdir -p "$fixture_dir/source"
printf 'verified runtime\n' >"$fixture_dir/source/probe.txt"
tar -C "$fixture_dir/source" -czf "$fixture_dir/runtime.tar.gz" probe.txt
runtime_sha="$(sha256sum "$fixture_dir/runtime.tar.gz" | awk '{print $1}')"
"$ROOT_DIR/scripts/release_manifest.py" create \
  --release v0.2.0-rc.1 \
  --application-version 0.2.0 \
  --commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --built-at 2026-07-22T10:00:00Z \
  --backend-image "ghcr.io/example/backend@sha256:$(printf 'b%.0s' {1..64})" \
  --frontend-image "ghcr.io/example/frontend@sha256:$(printf 'c%.0s' {1..64})" \
  --runtime-archive runtime.tar.gz \
  --runtime-sha256 "$runtime_sha" \
  --migration-classification none \
  --output "$fixture_dir/release-manifest.json"
(
  cd "$fixture_dir"
  sha256sum runtime.tar.gz release-manifest.json >SHA256SUMS
)
(
  # shellcheck source=deploy-common.sh
  . "$ROOT_DIR/scripts/deploy-common.sh"
  cp_prepare_release example/repository v0.2.0-rc.1 staging \
    "$fixture_dir/release-manifest.json" "$fixture_dir/prepared" >/dev/null
  test -f "$fixture_dir/prepared/runtime/probe.txt"
)

printf 'corrupt\n' >>"$fixture_dir/runtime.tar.gz"
if (
  . "$ROOT_DIR/scripts/deploy-common.sh"
  cp_prepare_release example/repository v0.2.0-rc.1 staging \
    "$fixture_dir/release-manifest.json" "$fixture_dir/corrupt" >/dev/null 2>&1
); then
  echo "release preparation accepted a checksum mismatch" >&2
  exit 1
fi

if (
  cd "$temp_dir"
  PATH="$temp_dir/bin:$PATH" ./scripts/update.sh \
    --environment staging \
    --release v0.2.0-rc.1 \
    --manifest "$fixture_dir/release-manifest.json" \
    --no-backup \
    --no-keycloak-user-check \
    --yes >/dev/null 2>&1
); then
  echo "managed update accepted a corrupt release bundle" >&2
  exit 1
fi
record="$(find "$temp_dir/deployments" -type f -name '*.json' | head -n 1)"
python3 - "$record" <<'PY'
import json
import sys

record = json.load(open(sys.argv[1], encoding="utf-8"))
assert record["status"] == "failed"
assert record["environment"] == "staging"
assert record["target"]["release"] == "v0.2.0-rc.1"
PY

echo "Deployment script checks passed"
