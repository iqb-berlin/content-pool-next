#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
COMMON_SH="${SCRIPT_DIR}/deploy-common.sh"
[[ -f "$COMMON_SH" ]] || {
  printf 'Error: scripts/deploy-common.sh is required next to update.sh\n' >&2
  exit 1
}
. "$COMMON_SH"

usage() {
  cat <<'USAGE'
Usage: scripts/update.sh [options]

Deploy a verified ContentPool release with backups, digest pinning, health and
version checks, and application-only rollback.

Options:
  --mode server|traefik             Deployment mode (default: detect from .env)
  --environment staging|production  Target environment (default: .env)
  --release VERSION                 Release or candidate to deploy
  --manifest FILE|URL               Alternate release-manifest.json source
  --rollback-to VERSION             Explicitly permit a downgrade to VERSION
  --adopt-current VERSION           Pin currently running legacy images as a baseline
  --backup-dir DIR                  Backup root (default: ./backups)
  --no-backup                       Skip backups (intentional maintenance only)
  --allow-incomplete-backup         Continue if a backup source is not running
  --backup-only                     Create a complete backup and exit
  --keycloak-realm REALM            Realm for user-count verification (default: iqb)
  --no-keycloak-user-check          Skip Keycloak user-count verification
  --no-pull                         Skip docker compose pull
  --no-health-check                 Skip post-update health/version checks
  --repo OWNER/REPO                 Release repository
  --yes                             Do not prompt
  --dry-run                         Validate arguments and print planned actions
  -h, --help                        Show this help
USAGE
}

is_tty() { [[ -t 0 && -t 1 ]]; }

run_compose() {
  docker compose "${CONTENT_POOL_COMPOSE_ARGS[@]}" "$@"
}

running_image_digest() {
  local container="$1"
  local image_id repo_digest
  image_id="$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null)" || return 1
  repo_digest="$(docker image inspect "$image_id" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null | head -n 1)"
  [[ "$repo_digest" =~ @sha256:[0-9a-f]{64}$ ]] || return 1
  printf '%s' "$repo_digest"
}

validate_env_safety() {
  local key value failures=0
  [[ "$(cp_env_get .env DB_SYNCHRONIZE)" != "true" ]] || \
    cp_die "DB_SYNCHRONIZE=true is unsafe for managed deployments"
  if [[ "$(cp_env_get .env DB_RUN_MIGRATIONS)" != "true" ]]; then
    cp_warn "DB_RUN_MIGRATIONS is not true; schema migrations will not run"
  fi
  for key in CORS_ORIGIN OIDC_PUBLIC_ISSUER_URL OIDC_REDIRECT_URI; do
    value="$(cp_env_get .env "$key")"
    if cp_env_is_placeholder "$value"; then
      cp_warn "${key} still looks like a placeholder (${value:-empty})"
      failures=$((failures + 1))
    fi
  done
  if [[ "$MODE" == "traefik" ]]; then
    for key in CONTENT_POOL_HOST CONTENT_POOL_AUTH_HOST KEYCLOAK_HOSTNAME; do
      value="$(cp_env_get .env "$key")"
      if cp_env_is_placeholder "$value"; then
        cp_warn "${key} still looks like a placeholder (${value:-empty})"
        failures=$((failures + 1))
      fi
    done
  fi
  [[ "$failures" -eq 0 ]] || cp_die "Refusing deployment with placeholder URL/OIDC values"
}

create_backup_dir() {
  local root="${1%/}" candidate suffix=1
  [[ ! -e "$root" || -d "$root" ]] || cp_die "Backup root is not a directory: $root"
  mkdir -m 700 -p "$root"
  candidate="${root}/update_$(date +%Y%m%d_%H%M%S)"
  while ! mkdir -m 700 "$candidate" 2>/dev/null; do
    candidate="${root}/update_$(date +%Y%m%d_%H%M%S)_${suffix}"
    suffix=$((suffix + 1))
  done
  printf '%s' "$candidate"
}

backup_database() {
  local container="$1" user="$2" database="$3" output="$4"
  if cp_has_running_container "$container"; then
    cp_info "Backing up ${database} from ${container}"
    if ! docker exec "$container" pg_dump --format=custom -U "$user" "$database" > "$output"; then
      command rm -f "$output"
      cp_die "Database backup failed for ${container}/${database}"
    fi
  elif [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 0 ]]; then
    cp_die "Container ${container} is not running; backup would be incomplete"
  else
    cp_warn "Container ${container} is not running; database backup skipped"
  fi
}

keycloak_user_count() {
  local user="$1" database="$2" realm="$3" count
  count="$(docker exec -i keycloak-db psql -qAt -v ON_ERROR_STOP=1 \
    -v realm_name="$realm" -U "$user" -d "$database" <<'SQL'
select count(*)
from user_entity u
join realm r on r.id = u.realm_id
where r.name = :'realm_name';
SQL
  )" || return 1
  count="${count//[[:space:]]/}"
  [[ "$count" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$count"
}

capture_keycloak_users() {
  [[ "$KEYCLOAK_USER_CHECK" -eq 1 ]] || return 0
  if ! cp_has_running_container keycloak-db; then
    [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]] || cp_die "keycloak-db is not running"
    cp_warn "Keycloak user check skipped because keycloak-db is not running"
    KEYCLOAK_USER_CHECK=0
    return 0
  fi
  KEYCLOAK_USERS_BEFORE="$(keycloak_user_count \
    "$(cp_env_get_default .env KEYCLOAK_DB_USER keycloak)" \
    "$(cp_env_get_default .env KEYCLOAK_DB_NAME keycloak)" \
    "$KEYCLOAK_REALM")" || cp_die "Could not count Keycloak users"
  export KEYCLOAK_USERS_BEFORE
}

create_backup() {
  local backup_dir old_umask paths=() path
  old_umask="$(umask)"
  umask 077
  backup_dir="$(create_backup_dir "$BACKUP_ROOT")"
  LAST_BACKUP_DIR="$backup_dir"
  for path in .env .release-manifest.json docker-compose.server.yml docker-compose.traefik.yml nginx.server.conf Makefile keycloak scripts; do
    [[ -e "$path" ]] && paths+=("$path")
  done
  [[ "${#paths[@]}" -eq 0 ]] || tar -czf "${backup_dir}/config.tgz" "${paths[@]}"
  backup_database content-pool-db \
    "$(cp_env_get_default .env POSTGRES_USER content_pool)" \
    "$(cp_env_get_default .env POSTGRES_DB content_pool)" \
    "${backup_dir}/content-pool-db.dump"
  backup_database keycloak-db \
    "$(cp_env_get_default .env KEYCLOAK_DB_USER keycloak)" \
    "$(cp_env_get_default .env KEYCLOAK_DB_NAME keycloak)" \
    "${backup_dir}/keycloak-db.dump"
  if cp_has_running_container content-pool-api; then
    docker exec content-pool-api tar -C /app -czf - uploads > "${backup_dir}/uploads.tgz" || \
      cp_die "Upload backup failed"
  elif [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 0 ]]; then
    cp_die "content-pool-api is not running; upload backup would be incomplete"
  fi
  {
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'release=%s\n' "$(cp_env_get .env RELEASE_VERSION)"
    printf 'backend_image=%s\n' "${PREVIOUS_BACKEND_IMAGE:-}"
    printf 'frontend_image=%s\n' "${PREVIOUS_FRONTEND_IMAGE:-}"
    printf 'mode=%s\n' "$MODE"
    printf 'environment=%s\n' "$ENVIRONMENT"
    printf 'keycloak_realm=%s\n' "$KEYCLOAK_REALM"
    printf 'keycloak_users_before=%s\n' "${KEYCLOAK_USERS_BEFORE:-}"
  } > "${backup_dir}/manifest.txt"
  chmod 700 "$backup_dir"
  find "$backup_dir" -type f -exec chmod 600 {} \;
  umask "$old_umask"
  cp_info "Backup complete: ${backup_dir}"
}

write_deployment_record() {
  local status="$1" message="${2:-}" ended_at="" record
  mkdir -p deployments
  [[ "$status" == "started" ]] || ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  record="${DEPLOYMENT_RECORD:-deployments/$(date -u +%Y%m%dT%H%M%SZ)-${TARGET_RELEASE//[^a-zA-Z0-9._-]/_}.json}"
  DEPLOYMENT_RECORD="$record"
  python3 - "$record" "$status" "$message" "$ENVIRONMENT" "$MODE" \
    "${PREVIOUS_RELEASE:-}" "$TARGET_RELEASE" "${PREVIOUS_BACKEND_IMAGE:-}" \
    "${TARGET_BACKEND_IMAGE:-}" "${PREVIOUS_FRONTEND_IMAGE:-}" \
    "${TARGET_FRONTEND_IMAGE:-}" "${LAST_BACKUP_DIR:-}" "$DEPLOYMENT_STARTED_AT" "$ended_at" <<'PY'
import json, os, sys
from pathlib import Path

(path, status, message, environment, mode, previous_release, target_release,
 previous_backend, target_backend, previous_frontend, target_frontend,
 backup, started_at, ended_at) = sys.argv[1:]
data = {
    "schemaVersion": 1,
    "status": status,
    "message": message,
    "environment": environment,
    "mode": mode,
    "operator": os.environ.get("SUDO_USER") or os.environ.get("USER") or "unknown",
    "startedAt": started_at,
    "endedAt": ended_at or None,
    "previous": {"release": previous_release or None, "backendImage": previous_backend or None, "frontendImage": previous_frontend or None},
    "target": {"release": target_release, "backendImage": target_backend or None, "frontendImage": target_frontend or None},
    "backupDirectory": backup or None,
    "checks": {
        "backup": os.environ.get("DEPLOY_CHECK_BACKUP", "not-run"),
        "compose": os.environ.get("DEPLOY_CHECK_COMPOSE", "not-run"),
        "imageDigests": os.environ.get("DEPLOY_CHECK_IMAGES", "not-run"),
        "start": os.environ.get("DEPLOY_CHECK_START", "not-run"),
        "healthAndVersion": os.environ.get("DEPLOY_CHECK_HEALTH", "not-run"),
        "keycloakUsers": os.environ.get("DEPLOY_CHECK_KEYCLOAK", "not-run"),
    },
    "keycloakUserCount": {
        "before": int(os.environ["KEYCLOAK_USERS_BEFORE"]) if os.environ.get("KEYCLOAK_USERS_BEFORE") else None,
        "after": int(os.environ["KEYCLOAK_USERS_AFTER"]) if os.environ.get("KEYCLOAK_USERS_AFTER") else None,
    },
}
Path(path).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
PY
}

run_health_check() {
  local keycloak_url api_url frontend_url content_host
  [[ "$HEALTH_CHECK" -eq 1 ]] || return 0
  if [[ "$MODE" == "traefik" ]]; then
    content_host="$(cp_env_get .env CONTENT_POOL_HOST)"
    keycloak_url="$(cp_env_get .env OIDC_PUBLIC_ISSUER_URL)"
    api_url="https://${content_host}/api"
    frontend_url="https://${content_host}"
  else
    keycloak_url="$(cp_env_get .env OIDC_PUBLIC_ISSUER_URL)"
    api_url="http://localhost/api"
    frontend_url="http://localhost"
  fi
  ./scripts/check-health.sh "$MODE" "$keycloak_url" "$api_url" "$frontend_url" \
    "$TARGET_APPLICATION_VERSION" "$TARGET_COMMIT"
}

restore_previous_application() {
  cp_warn "Restoring previous runtime files and image references; database migrations are not reverted"
  if [[ -n "$LAST_BACKUP_DIR" && -f "${LAST_BACKUP_DIR}/config.tgz" ]]; then
    tar -xzf "${LAST_BACKUP_DIR}/config.tgz" -C .
    cp_set_compose_args "$MODE"
    if run_compose up -d; then
      cp_warn "Previous application release restarted"
    else
      cp_warn "Previous application restart failed"
    fi
  else
    cp_warn "No configuration backup is available for automatic application rollback"
  fi
  run_compose stop nginx >/dev/null 2>&1 || true
}

fail_deployment() {
  local message="$1"
  restore_previous_application
  write_deployment_record failed "$message"
  DEPLOYMENT_ACTIVE=0
  cp_die "$message; inspect ${LAST_BACKUP_DIR:-the latest backup} before reopening traffic"
}

cleanup_update() {
  local status="$?"
  if [[ -n "${RELEASE_WORK_DIR:-}" && -d "$RELEASE_WORK_DIR" ]]; then
    command rm -rf "$RELEASE_WORK_DIR"
  fi
  if [[ "${DEPLOYMENT_ACTIVE:-0}" -eq 1 && "$status" -ne 0 ]]; then
    set +e
    write_deployment_record failed "Deployment aborted before completion"
  fi
  exit "$status"
}

adopt_current() {
  local baseline="$1" backend frontend compose_project
  [[ "$baseline" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || cp_die "--adopt-current requires stable vMAJOR.MINOR.PATCH"
  cp_has_running_container content-pool-api || cp_die "content-pool-api is not running"
  cp_has_running_container content-pool-nginx || cp_die "content-pool-nginx is not running"
  backend="$(running_image_digest content-pool-api)" || cp_die "Cannot resolve running backend RepoDigest"
  frontend="$(running_image_digest content-pool-nginx)" || cp_die "Cannot resolve running frontend RepoDigest"
  compose_project="$(docker inspect content-pool-api \
    --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null)" || \
    cp_die "Cannot determine the legacy Compose project"
  [[ -n "$compose_project" ]] || cp_die "Running backend has no Compose project label"
  cp_env_set .env DEPLOYMENT_ENV "$ENVIRONMENT"
  cp_env_set .env COMPOSE_PROJECT_NAME "$compose_project"
  cp_env_set .env RELEASE_VERSION "$baseline"
  cp_env_set .env APPLICATION_VERSION "${baseline#v}"
  cp_env_set .env RELEASE_COMMIT 0000000000000000000000000000000000000000
  cp_env_set .env RELEASE_BUILT_AT 1970-01-01T00:00:00Z
  cp_env_set .env CONTENT_POOL_BACKEND_IMAGE "$backend"
  cp_env_set .env CONTENT_POOL_FRONTEND_IMAGE "$frontend"
  mkdir -p deployments
  python3 - "$baseline" "$ENVIRONMENT" "$compose_project" "$backend" "$frontend" > "deployments/baseline-${baseline}.json" <<'PY'
import json, sys
print(json.dumps({
    "schemaVersion": 1,
    "type": "legacy-baseline",
    "release": sys.argv[1],
    "environment": sys.argv[2],
    "composeProject": sys.argv[3],
    "images": {"backend": sys.argv[4], "frontend": sys.argv[5]},
}, indent=2))
PY
  cp_info "Adopted ${baseline} with immutable running image digests"
}

MODE="${CONTENT_POOL_DEPLOY_MODE:-}"
ENVIRONMENT="${DEPLOYMENT_ENV:-}"
RELEASE=""
ROLLBACK_TO=""
ADOPT_CURRENT=""
MANIFEST_SOURCE=""
REPO="${CONTENT_POOL_REPO:-$CONTENT_POOL_REPO_DEFAULT}"
BACKUP_ROOT=backups
BACKUP=1
BACKUP_ONLY=0
ALLOW_INCOMPLETE_BACKUP=0
KEYCLOAK_REALM="${KEYCLOAK_REALM:-iqb}"
KEYCLOAK_USER_CHECK=1
KEYCLOAK_USERS_BEFORE=""
KEYCLOAK_USERS_AFTER=""
LAST_BACKUP_DIR=""
PULL=1
HEALTH_CHECK=1
YES=0
DRY_RUN=0
export DEPLOY_CHECK_BACKUP=not-run
export DEPLOY_CHECK_COMPOSE=not-run
export DEPLOY_CHECK_IMAGES=not-run
export DEPLOY_CHECK_START=not-run
export DEPLOY_CHECK_HEALTH=not-run
export DEPLOY_CHECK_KEYCLOAK=not-run

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --mode=*) MODE="${1#*=}"; shift ;;
    --environment) ENVIRONMENT="$2"; shift 2 ;;
    --environment=*) ENVIRONMENT="${1#*=}"; shift ;;
    --release) RELEASE="$2"; shift 2 ;;
    --release=*) RELEASE="${1#*=}"; shift ;;
    --rollback-to) ROLLBACK_TO="$2"; shift 2 ;;
    --rollback-to=*) ROLLBACK_TO="${1#*=}"; shift ;;
    --adopt-current) ADOPT_CURRENT="$2"; shift 2 ;;
    --adopt-current=*) ADOPT_CURRENT="${1#*=}"; shift ;;
    --manifest) MANIFEST_SOURCE="$2"; shift 2 ;;
    --manifest=*) MANIFEST_SOURCE="${1#*=}"; shift ;;
    --repo) REPO="$2"; shift 2 ;;
    --repo=*) REPO="${1#*=}"; shift ;;
    --backup-dir) BACKUP_ROOT="$2"; shift 2 ;;
    --backup-dir=*) BACKUP_ROOT="${1#*=}"; shift ;;
    --no-backup) BACKUP=0; shift ;;
    --allow-incomplete-backup) ALLOW_INCOMPLETE_BACKUP=1; shift ;;
    --backup-only) BACKUP_ONLY=1; shift ;;
    --keycloak-realm) KEYCLOAK_REALM="$2"; shift 2 ;;
    --keycloak-realm=*) KEYCLOAK_REALM="${1#*=}"; shift ;;
    --no-keycloak-user-check) KEYCLOAK_USER_CHECK=0; shift ;;
    --no-pull) PULL=0; shift ;;
    --no-health-check) HEALTH_CHECK=0; shift ;;
    --yes) YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --image-version|--refresh-artifacts|--ref|--image-version=*|--ref=*)
      cp_die "$1 is obsolete; use --release and a verified release manifest"
      ;;
    -h|--help) usage; exit 0 ;;
    *) cp_die "Unknown option: $1" ;;
  esac
done

[[ -f .env ]] || cp_die ".env not found; run scripts/install.sh first"
[[ -n "$MODE" ]] || MODE="$(cp_detect_mode .env)"
cp_validate_mode "$MODE"
[[ -n "$ENVIRONMENT" ]] || ENVIRONMENT="$(cp_env_get .env DEPLOYMENT_ENV)"
cp_validate_environment "$ENVIRONMENT"
cp_require_docker_compose
cp_require_cmd python3
cp_set_compose_args "$MODE"

if [[ -n "$ADOPT_CURRENT" ]]; then
  [[ -z "$RELEASE" && -z "$ROLLBACK_TO" ]] || cp_die "--adopt-current cannot be combined with a release"
  [[ "$DRY_RUN" -eq 0 ]] || { cp_info "Would adopt current deployment as ${ADOPT_CURRENT}"; exit 0; }
  adopt_current "$ADOPT_CURRENT"
  exit 0
fi

PREVIOUS_RELEASE="$(cp_env_get .env RELEASE_VERSION)"
PREVIOUS_BACKEND_IMAGE="$(running_image_digest content-pool-api 2>/dev/null || cp_env_get .env CONTENT_POOL_BACKEND_IMAGE)"
PREVIOUS_FRONTEND_IMAGE="$(running_image_digest content-pool-nginx 2>/dev/null || cp_env_get .env CONTENT_POOL_FRONTEND_IMAGE)"

if [[ "$BACKUP_ONLY" -eq 1 ]]; then
  capture_keycloak_users
  create_backup
  exit 0
fi

[[ -z "$RELEASE" || -z "$ROLLBACK_TO" ]] || cp_die "Use either --release or --rollback-to"
TARGET_RELEASE="${ROLLBACK_TO:-$RELEASE}"
[[ -n "$TARGET_RELEASE" ]] || cp_die "--release vX.Y.Z[-rc.N] is required"
cp_validate_release_for_environment "$TARGET_RELEASE" "$ENVIRONMENT"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cp_info "Would deploy ${TARGET_RELEASE} to ${ENVIRONMENT} using mode ${MODE}"
  cp_info "Would use manifest: ${MANIFEST_SOURCE:-GitHub release asset}"
  cp_info "Would create backup: $([[ "$BACKUP" -eq 1 ]] && printf yes || printf no)"
  exit 0
fi

DEPLOYMENT_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOYMENT_RECORD=""
DEPLOYMENT_ACTIVE=1
RELEASE_WORK_DIR=""
write_deployment_record started
trap cleanup_update EXIT

RELEASE_WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/content-pool-update.XXXXXX")"
MANIFEST_TOOL="$(cp_prepare_release "$REPO" "$TARGET_RELEASE" "$ENVIRONMENT" "$MANIFEST_SOURCE" "$RELEASE_WORK_DIR")"
TARGET_MANIFEST="${RELEASE_WORK_DIR}/release-manifest.json"
TARGET_BACKEND_IMAGE="$(cp_manifest_get "$MANIFEST_TOOL" "$TARGET_MANIFEST" images.backend)"
TARGET_FRONTEND_IMAGE="$(cp_manifest_get "$MANIFEST_TOOL" "$TARGET_MANIFEST" images.frontend)"
TARGET_COMMIT="$(cp_manifest_get "$MANIFEST_TOOL" "$TARGET_MANIFEST" sourceCommit)"
TARGET_APPLICATION_VERSION="$(cp_manifest_get "$MANIFEST_TOOL" "$TARGET_MANIFEST" applicationVersion)"
MIGRATION_CLASSIFICATION="$(cp_manifest_get "$MANIFEST_TOOL" "$TARGET_MANIFEST" migrations.classification)"
write_deployment_record started
if [[ "$ENVIRONMENT" == "production" && "$MIGRATION_CLASSIFICATION" == "manual" ]]; then
  cp_die "Manual/incompatible migrations require a separate reviewed maintenance procedure"
fi

if [[ -n "$PREVIOUS_RELEASE" && -z "$ROLLBACK_TO" ]]; then
  comparison="$(python3 "$MANIFEST_TOOL" compare --current "$PREVIOUS_RELEASE" --target "$TARGET_RELEASE")" || \
    cp_die "Cannot compare current and target releases; adopt the legacy deployment first"
  [[ "$comparison" != "older" ]] || cp_die "Downgrade requires --rollback-to ${TARGET_RELEASE}"
fi

validate_env_safety
if [[ "$YES" -eq 0 ]] && is_tty; then
  printf 'Deploy %s to %s using %s? [y/N]: ' "$TARGET_RELEASE" "$ENVIRONMENT" "$MODE"
  read -r answer
  [[ "$answer" =~ ^([yY]|yes|YES)$ ]] || cp_die "Deployment aborted"
fi

capture_keycloak_users
if [[ "$BACKUP" -eq 1 ]]; then
  create_backup
  export DEPLOY_CHECK_BACKUP=passed
else
  export DEPLOY_CHECK_BACKUP=skipped
fi
write_deployment_record started

if ! cp_install_runtime_artifacts "${RELEASE_WORK_DIR}/runtime" "$PWD"; then
  fail_deployment "Installing runtime artifacts failed"
fi
if ! cp_apply_manifest_env .env "$TARGET_MANIFEST" "$ENVIRONMENT" "$MANIFEST_TOOL"; then
  fail_deployment "Applying release metadata failed"
fi
if ! cp_validate_required_configuration .env "$TARGET_MANIFEST"; then
  fail_deployment "Required release configuration is missing"
fi

if [[ "$MODE" == "traefik" ]]; then
  network="$(cp_env_get .env TRAEFIK_DOCKER_NETWORK)"
  docker network inspect "${network:-ingress-net}" >/dev/null 2>&1 || fail_deployment "Traefik network is missing"
fi

run_compose config >/dev/null || fail_deployment "Docker Compose validation failed"
export DEPLOY_CHECK_COMPOSE=passed
if [[ "$PULL" -eq 1 ]]; then
  run_compose pull || fail_deployment "Pulling release images failed"
fi
docker image inspect "$TARGET_BACKEND_IMAGE" >/dev/null 2>&1 || \
  fail_deployment "Pulled backend image does not match the manifest digest"
docker image inspect "$TARGET_FRONTEND_IMAGE" >/dev/null 2>&1 || \
  fail_deployment "Pulled frontend image does not match the manifest digest"
export DEPLOY_CHECK_IMAGES=passed
run_compose up -d || fail_deployment "Starting the release failed"
export DEPLOY_CHECK_START=passed
run_health_check || fail_deployment "Health or version check failed"
export DEPLOY_CHECK_HEALTH=$([[ "$HEALTH_CHECK" -eq 1 ]] && printf passed || printf skipped)

if [[ "$KEYCLOAK_USER_CHECK" -eq 1 ]]; then
  users_after="$(keycloak_user_count \
    "$(cp_env_get_default .env KEYCLOAK_DB_USER keycloak)" \
    "$(cp_env_get_default .env KEYCLOAK_DB_NAME keycloak)" \
    "$KEYCLOAK_REALM")" || fail_deployment "Could not count Keycloak users after deployment"
  (( users_after >= KEYCLOAK_USERS_BEFORE )) || fail_deployment "Keycloak user count decreased"
  KEYCLOAK_USERS_AFTER="$users_after"
  export KEYCLOAK_USERS_AFTER
  if [[ -n "$LAST_BACKUP_DIR" && -f "${LAST_BACKUP_DIR}/manifest.txt" ]]; then
    printf 'keycloak_users_after=%s\n' "$KEYCLOAK_USERS_AFTER" >>"${LAST_BACKUP_DIR}/manifest.txt"
  fi
  export DEPLOY_CHECK_KEYCLOAK=passed
else
  export DEPLOY_CHECK_KEYCLOAK=skipped
fi

command cp -f "$TARGET_MANIFEST" .release-manifest.json
write_deployment_record succeeded
DEPLOYMENT_ACTIVE=0
cp_info "Deployment complete: ${TARGET_RELEASE} (${ENVIRONMENT})"
cp_info "Record: ${DEPLOYMENT_RECORD}"
