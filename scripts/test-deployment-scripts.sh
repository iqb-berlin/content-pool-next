#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
for script in "$ROOT_DIR"/scripts/*.sh; do
  bash -n "$script"
done

grep -q 'up -d --wait --wait-timeout 120' "$ROOT_DIR/scripts/restore.sh" || {
  echo "restore does not wait for both PostgreSQL services" >&2
  exit 1
}
grep -q 'up -d --wait --wait-timeout 180' "$ROOT_DIR/scripts/restore.sh" || {
  echo "restore does not wait for the complete application stack" >&2
  exit 1
}
[[ "$(grep -c 'run_compose up -d --wait --wait-timeout 180' "$ROOT_DIR/scripts/update.sh")" -eq 3 ]] || {
  echo "not every managed update/rollback start waits for stack readiness" >&2
  exit 1
}
grep -q 'HEALTH_CHECK_ATTEMPTS="${HEALTH_CHECK_ATTEMPTS:-24}"' "$ROOT_DIR/scripts/update.sh" || {
  echo "managed updates do not enable bounded health-check retries" >&2
  exit 1
}
grep -q 'HEALTH_CHECK_ATTEMPTS="${HEALTH_CHECK_ATTEMPTS:-24}"' "$ROOT_DIR/scripts/restore.sh" || {
  echo "managed restores do not enable bounded health-check retries" >&2
  exit 1
}

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

health_bin="$temp_dir/health-bin"
mkdir -p "$health_bin"
cat > "$health_bin/docker" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat > "$health_bin/curl" <<'SH'
#!/usr/bin/env bash
set -eu

url=""
output_file=""
write_format=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o)
      output_file="$2"
      shift 2
      ;;
    -w)
      write_format="$2"
      shift 2
      ;;
    http://*|https://*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

[[ -n "$url" ]] || exit 2
current_attempt="$(cat "$HEALTH_TEST_STATE" 2>/dev/null || true)"
current_attempt="${current_attempt:-0}"
if [[ "$url" == *"/.well-known/openid-configuration" ]]; then
  current_attempt=$((current_attempt + 1))
  printf '%s\n' "$current_attempt" >"$HEALTH_TEST_STATE"
fi
current_attempt="${current_attempt:-1}"

status=200
version=0.3.0
case "$HEALTH_TEST_SCENARIO" in
  transient)
    if [[ "$current_attempt" -eq 1 && "$url" == *"/.well-known/openid-configuration" ]]; then
      status=503
    fi
    ;;
  persistent)
    if [[ "$url" == *"/.well-known/openid-configuration" ]]; then
      status=503
    fi
    ;;
  identity-mismatch)
    if [[ "$url" == */version || "$url" == */version.json ]]; then
      version=0.2.0
    fi
    ;;
  mixed-then-current)
    if [[ "$current_attempt" -eq 1 && "$url" == */version.json ]]; then
      version=0.2.0
    fi
    ;;
esac

if [[ "$url" == */version || "$url" == */version.json ]]; then
  printf '{"version":"%s","commit":"%s","builtAt":"2026-07-31T12:25:34Z"}\n' \
    "$version" "$HEALTH_TEST_COMMIT" >"$output_file"
elif [[ -n "$write_format" ]]; then
  printf '%s' "$status"
fi
SH
chmod +x "$health_bin/docker" "$health_bin/curl"

health_commit=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
health_state="$temp_dir/health-state"
health_log="$temp_dir/health.log"

run_health_test() {
  local scenario="$1"
  local attempts="$2"
  : >"$health_state"
  HEALTH_TEST_SCENARIO="$scenario" \
  HEALTH_TEST_STATE="$health_state" \
  HEALTH_TEST_COMMIT="$health_commit" \
  HEALTH_CHECK_ATTEMPTS="$attempts" \
  HEALTH_CHECK_INTERVAL_SECONDS=0 \
  HEALTH_CHECK_CONNECT_TIMEOUT_SECONDS=1 \
  HEALTH_CHECK_MAX_TIME_SECONDS=1 \
  PATH="$health_bin:$PATH" \
    "$ROOT_DIR/scripts/check-health.sh" server \
      https://auth.example/realms/iqb https://content.example/api https://content.example \
      0.3.0 "$health_commit" >"$health_log" 2>&1
}

run_health_test transient 3
test "$(cat "$health_state")" = 2
grep -q 'Health check attempt 2/3' "$health_log"

if run_health_test persistent 3; then
  echo "health check accepted a persistent external failure" >&2
  exit 1
fi
test "$(cat "$health_state")" = 3

if run_health_test identity-mismatch 2; then
  echo "health check accepted a persistent release identity mismatch" >&2
  exit 1
fi
test "$(cat "$health_state")" = 2

run_health_test mixed-then-current 2
test "$(cat "$health_state")" = 2

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
  cp "$ROOT_DIR/.env.example" "$fixture_dir/legacy.env"
  cp_env_set "$fixture_dir/legacy.env" COMPOSE_PROJECT_NAME legacy-content-pool
  cp_apply_manifest_env "$fixture_dir/legacy.env" "$fixture_dir/release-manifest.json" \
    staging "$ROOT_DIR/scripts/release_manifest.py"
  test "$(cp_env_get "$fixture_dir/legacy.env" COMPOSE_PROJECT_NAME)" = legacy-content-pool

  cp "$ROOT_DIR/.env.example" "$fixture_dir/fresh.env"
  cp_apply_manifest_env "$fixture_dir/fresh.env" "$fixture_dir/release-manifest.json" \
    staging "$ROOT_DIR/scripts/release_manifest.py"
  test "$(cp_env_get "$fixture_dir/fresh.env" COMPOSE_PROJECT_NAME)" = content-pool-staging

  mkdir -p "$fixture_dir/backup-check"
  printf 'backup fixture\n' >"$fixture_dir/backup-check/probe.txt"
  cp_write_sha256s "$fixture_dir/backup-check" probe.txt
  cp_verify_sha256s "$fixture_dir/backup-check"
  printf 'corrupt\n' >>"$fixture_dir/backup-check/probe.txt"
  if cp_verify_sha256s "$fixture_dir/backup-check" >/dev/null 2>&1; then
    echo "backup checksum verification accepted corrupted data" >&2
    exit 1
  fi
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

adopt_dir="$temp_dir/adopt"
mkdir -p "$adopt_dir/scripts"
cp "$ROOT_DIR/.env.example" "$adopt_dir/.env"
cp "$ROOT_DIR/scripts/update.sh" "$ROOT_DIR/scripts/deploy-common.sh" "$adopt_dir/scripts/"
cat > "$temp_dir/bin/docker" <<'SH'
#!/usr/bin/env bash
set -eu
if [[ "${1:-}" == compose ]]; then
  if [[ "${2:-}" == version ]]; then exit 0; fi
  service="${*: -1}"
  case "$service" in
    content-pool-api) printf 'legacy-api-id\n' ;;
    nginx) printf 'legacy-nginx-id\n' ;;
  esac
  exit 0
fi
if [[ "${1:-}" == inspect ]]; then
  container="${2:-}"
  case "$*" in
    *State.Running*) printf 'true\n' ;;
    *com.docker.compose.project*) printf 'legacy-project\n' ;;
    *.Image*)
      case "$container" in
        legacy-api-id) printf 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' ;;
        legacy-nginx-id) printf 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' ;;
      esac
      ;;
  esac
  exit 0
fi
if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then
  case "${3:-}" in
    sha256:aaaaaaaa*) printf 'ghcr.io/example/backend@sha256:%064d\n' 1 ;;
    sha256:bbbbbbbb*) printf 'ghcr.io/example/frontend@sha256:%064d\n' 2 ;;
  esac
  exit 0
fi
exit 0
SH
chmod +x "$temp_dir/bin/docker"
(
  cd "$adopt_dir"
  PATH="$temp_dir/bin:$PATH" ./scripts/update.sh \
    --mode server --environment production --adopt-current v0.1.3 >/dev/null
  # shellcheck source=deploy-common.sh
  . ./scripts/deploy-common.sh
  test "$(cp_env_get .env COMPOSE_PROJECT_NAME)" = legacy-project
  test "$(cp_env_get .env RELEASE_VERSION)" = v0.1.3
  cp_verify_sha256s baselines/v0.1.3
  rollback_plan="$(PATH="$temp_dir/bin:$PATH" ./scripts/update.sh \
    --mode server --environment production --rollback-to v0.1.3 --dry-run)"
  grep -q 'Would use local legacy baseline' <<<"$rollback_plan"
  python3 - baselines/v0.1.3/manifest.json <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
assert data["composeProject"] == "legacy-project"
assert data["images"]["backend"].endswith("@sha256:" + "0" * 63 + "1")
assert data["images"]["frontend"].endswith("@sha256:" + "0" * 63 + "2")
assert data["runtime"]["archive"] == "runtime.tgz"
PY
)

echo "Deployment script checks passed"
