#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
COMMON_SH="${SCRIPT_DIR}/deploy-common.sh"
[[ -f "$COMMON_SH" ]] || {
  printf 'Error: scripts/deploy-common.sh is required next to update.sh\n' >&2
  exit 1
}

# shellcheck source=deploy-common.sh
. "$COMMON_SH"

usage() {
  cat <<'USAGE'
Usage: scripts/update.sh [options]

Safely update a ContentPool server deployment. The default workflow creates
backups, validates the Compose configuration, pulls images, restarts the stack,
and runs a health check.

Options:
  --mode server|traefik        Deployment mode (default: detect from .env)
  --image-version VERSION      Use IMAGE_VERSION for this update and persist it after restart
  --backup-dir DIR             Backup root directory (default: ./backups)
  --no-backup                  Skip database/config/upload backups
  --allow-incomplete-backup    Continue when a backup source container is not running
  --backup-only                Create backups and exit
  --keycloak-realm REALM       Realm used for Keycloak user-count verification (default: iqb)
  --no-keycloak-user-check     Skip pre/post Keycloak user-count verification
  --no-pull                    Skip docker compose pull
  --no-health-check            Skip post-update health check
  --refresh-artifacts          Download deploy files from GitHub before update
  --ref REF                    GitHub ref/tag for --refresh-artifacts (default: master)
  --repo OWNER/REPO            GitHub repository (default: iqb-berlin/content-pool-next)
  --yes                        Do not ask for interactive confirmation
  --dry-run                    Print planned actions without changing anything
  -h, --help                   Show this help
USAGE
}

is_tty() {
  [[ -t 0 && -t 1 ]]
}

confirm_or_exit() {
  local mode="$1"
  local image_version="$2"
  local refresh="$3"
  local answer

  if [[ "$YES" -eq 1 ]] || ! is_tty; then
    return 0
  fi

  printf 'ContentPool update plan:\n'
  printf '  mode: %s\n' "$mode"
  if [[ -n "$image_version" ]]; then
    printf '  image version: %s\n' "$image_version"
  else
    printf '  image version: %s\n' "$(cp_env_get .env IMAGE_VERSION)"
  fi
  printf '  refresh deploy artifacts: %s\n' "$([[ "$refresh" -eq 1 ]] && printf yes || printf no)"
  printf '  backups: %s\n' "$([[ "$BACKUP" -eq 1 ]] && printf yes || printf no)"
  if [[ "$BACKUP" -eq 1 ]]; then
    printf '  allow incomplete backup: %s\n' "$([[ "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]] && printf yes || printf no)"
  fi
  printf '  Keycloak user check: %s\n' "$([[ "$KEYCLOAK_USER_CHECK" -eq 1 ]] && printf "%s" "$KEYCLOAK_REALM" || printf no)"
  read -r -p 'Continue? [y/N]: ' answer
  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      cp_die "Update aborted"
      ;;
  esac
}

validate_env_safety() {
  local key value sync migrations failures=0

  sync="$(cp_env_get .env DB_SYNCHRONIZE)"
  if [[ "$sync" == "true" ]]; then
    cp_die "DB_SYNCHRONIZE=true is unsafe for production updates. Set DB_SYNCHRONIZE=false before updating."
  fi

  migrations="$(cp_env_get .env DB_RUN_MIGRATIONS)"
  if [[ "${migrations:-true}" != "true" ]]; then
    cp_warn "DB_RUN_MIGRATIONS is not true; schema migrations will not run on backend startup"
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

  if [[ "$failures" -gt 0 ]]; then
    cp_die "Refusing to update while production URL/OIDC values still look like placeholders"
  fi
}

safe_tar_config() {
  local backup_dir="$1"
  local paths=()
  local path

  for path in \
    .env \
    docker-compose.server.yml \
    docker-compose.traefik.yml \
    nginx.server.conf \
    Makefile \
    keycloak \
    scripts
  do
    [[ -e "$path" ]] && paths+=("$path")
  done

  if [[ "${#paths[@]}" -gt 0 ]]; then
    tar -czf "${backup_dir}/config.tgz" "${paths[@]}"
  fi
}

create_backup_dir() {
  local backup_root="$1"
  local backup_root_dir base candidate suffix

  backup_root_dir="${backup_root%/}"
  if [[ -e "$backup_root_dir" && ! -d "$backup_root_dir" ]]; then
    cp_die "Backup root exists but is not a directory: ${backup_root_dir}"
  elif [[ ! -e "$backup_root_dir" ]]; then
    mkdir -m 700 -p "$backup_root_dir"
  fi

  base="${backup_root_dir}/update_$(date +%Y%m%d_%H%M%S)"
  candidate="$base"
  suffix=1

  while ! mkdir -m 700 "$candidate" 2>/dev/null; do
    if [[ ! -e "$candidate" ]]; then
      cp_die "Could not create backup directory: ${candidate}"
    fi
    candidate="${base}_${suffix}"
    suffix=$((suffix + 1))
  done

  printf '%s' "$candidate"
}

backup_database() {
  local container="$1"
  local user="$2"
  local database="$3"
  local output="$4"

  if cp_has_running_container "$container"; then
    cp_info "Backing up ${database} from ${container}"
    if ! docker exec "$container" pg_dump --format=custom -U "$user" "$database" > "$output"; then
      rm -f "$output"
      cp_die "Database backup failed for ${container}/${database}; update aborted"
    fi
  else
    if [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]]; then
      cp_warn "Container ${container} is not running; database backup skipped"
    else
      cp_die "Container ${container} is not running; backup would be incomplete. Start the stack, use --no-backup, or pass --allow-incomplete-backup explicitly."
    fi
  fi
}

backup_uploads() {
  local backup_dir="$1"

  if cp_has_running_container content-pool-api; then
    cp_info "Backing up uploads from content-pool-api"
    if ! docker exec content-pool-api tar -C /app -czf - uploads > "${backup_dir}/uploads.tgz"; then
      rm -f "${backup_dir}/uploads.tgz"
      cp_die "Upload backup failed; update aborted"
    fi
  else
    if [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]]; then
      cp_warn "Container content-pool-api is not running; upload backup skipped"
    else
      cp_die "Container content-pool-api is not running; upload backup would be incomplete. Start the stack, use --no-backup, or pass --allow-incomplete-backup explicitly."
    fi
  fi
}

keycloak_user_count() {
  local user="$1"
  local database="$2"
  local realm="$3"
  local count

  count="$(
    docker exec -i keycloak-db psql \
      -qAt \
      -v ON_ERROR_STOP=1 \
      -v realm_name="$realm" \
      -U "$user" \
      -d "$database" <<'SQL'
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

reject_started_update() {
  local reason="$1"
  local recovery_hint="${2:-}"
  local previous_version backup_hint

  backup_hint="${LAST_BACKUP_DIR:-the latest verified backup}"
  if [[ -z "$recovery_hint" ]]; then
    recovery_hint="Inspect the failed update using ${backup_hint} before reopening traffic."
  fi
  cp_warn "$reason"

  if [[ -n "$IMAGE_VERSION_TARGET" ]]; then
    previous_version="$(cp_env_get .env IMAGE_VERSION)"
    cp_warn "Attempting to redeploy previous IMAGE_VERSION=${previous_version:-latest}"
    COMPOSE_ENV=()
    if run_compose up -d; then
      cp_warn "Previous image version redeployed"
    else
      cp_warn "Automatic redeploy of the previous image version failed"
    fi
  else
    cp_warn "No explicit image target was used; automatic image rollback is not available"
  fi

  cp_warn "Stopping nginx so the failed update is not served publicly"
  if run_compose stop nginx; then
    cp_warn "nginx stopped; restart it only after the failed update has been inspected or restored"
  else
    cp_warn "Could not stop nginx automatically; stop it manually before continuing"
  fi

  cp_die "${reason} ${recovery_hint}"
}

capture_keycloak_users_before() {
  local keycloak_user keycloak_db count

  [[ "$KEYCLOAK_USER_CHECK" -eq 1 ]] || return 0

  if ! cp_has_running_container keycloak-db; then
    if [[ "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]]; then
      cp_warn "Container keycloak-db is not running; Keycloak user-count verification skipped"
      KEYCLOAK_USER_CHECK=0
      return 0
    fi
    cp_die "Container keycloak-db is not running; cannot verify Keycloak users. Start the stack or pass --no-keycloak-user-check explicitly."
  fi

  keycloak_user="$(cp_env_get .env KEYCLOAK_DB_USER)"
  keycloak_db="$(cp_env_get .env KEYCLOAK_DB_NAME)"
  if ! count="$(keycloak_user_count "${keycloak_user:-keycloak}" "${keycloak_db:-keycloak}" "$KEYCLOAK_REALM")"; then
    cp_die "Could not count Keycloak users in realm '${KEYCLOAK_REALM}'. Pass --no-keycloak-user-check only for an intentional maintenance exception."
  fi

  KEYCLOAK_USERS_BEFORE="$count"
  cp_info "Keycloak realm '${KEYCLOAK_REALM}' users before update: ${KEYCLOAK_USERS_BEFORE}"
}

verify_keycloak_users_after() {
  local keycloak_user keycloak_db count

  [[ "$KEYCLOAK_USER_CHECK" -eq 1 ]] || return 0
  [[ -n "$KEYCLOAK_USERS_BEFORE" ]] || return 0

  keycloak_user="$(cp_env_get .env KEYCLOAK_DB_USER)"
  keycloak_db="$(cp_env_get .env KEYCLOAK_DB_NAME)"
  if ! count="$(keycloak_user_count "${keycloak_user:-keycloak}" "${keycloak_db:-keycloak}" "$KEYCLOAK_REALM")"; then
    reject_started_update \
      "Could not count Keycloak users after update." \
      "Restore or verify the Keycloak database from ${LAST_BACKUP_DIR:-the latest verified backup} before reopening traffic."
  fi

  KEYCLOAK_USERS_AFTER="$count"
  if [[ -n "$LAST_BACKUP_DIR" && -f "${LAST_BACKUP_DIR}/manifest.txt" ]]; then
    printf 'keycloak_users_after=%s\n' "$KEYCLOAK_USERS_AFTER" >> "${LAST_BACKUP_DIR}/manifest.txt"
  fi

  cp_info "Keycloak realm '${KEYCLOAK_REALM}' users after update: ${KEYCLOAK_USERS_AFTER}"
  if (( KEYCLOAK_USERS_AFTER < KEYCLOAK_USERS_BEFORE )); then
    reject_started_update \
      "Keycloak user count decreased from ${KEYCLOAK_USERS_BEFORE} to ${KEYCLOAK_USERS_AFTER}." \
      "Restore or verify the Keycloak database from ${LAST_BACKUP_DIR:-the latest verified backup} before reopening traffic."
  fi
}

create_backup() {
  local backup_root="$1"
  local backup_dir
  local postgres_user postgres_db keycloak_user keycloak_db
  local old_umask

  old_umask="$(umask)"
  umask 077
  backup_dir="$(create_backup_dir "$backup_root")"
  LAST_BACKUP_DIR="$backup_dir"

  cp_info "Creating backup in ${backup_dir}"
  safe_tar_config "$backup_dir"

  postgres_user="$(cp_env_get .env POSTGRES_USER)"
  postgres_db="$(cp_env_get .env POSTGRES_DB)"
  keycloak_user="$(cp_env_get .env KEYCLOAK_DB_USER)"
  keycloak_db="$(cp_env_get .env KEYCLOAK_DB_NAME)"

  backup_database content-pool-db "${postgres_user:-content_pool}" "${postgres_db:-content_pool}" "${backup_dir}/content-pool-db.dump"
  backup_database keycloak-db "${keycloak_user:-keycloak}" "${keycloak_db:-keycloak}" "${backup_dir}/keycloak-db.dump"
  backup_uploads "$backup_dir"

  {
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'image_version=%s\n' "$(cp_env_get .env IMAGE_VERSION)"
    printf 'mode=%s\n' "$MODE"
    printf 'keycloak_realm=%s\n' "$KEYCLOAK_REALM"
    if [[ -n "$KEYCLOAK_USERS_BEFORE" ]]; then
      printf 'keycloak_users_before=%s\n' "$KEYCLOAK_USERS_BEFORE"
    fi
  } > "${backup_dir}/manifest.txt"

  chmod 700 "$backup_dir"
  find "$backup_dir" -type f -exec chmod 600 {} \;
  umask "$old_umask"

  cp_info "Backup complete: ${backup_dir}"
}

validate_traefik_network() {
  local network

  [[ "$MODE" == "traefik" ]] || return 0
  network="$(cp_env_get .env TRAEFIK_DOCKER_NETWORK)"
  network="${network:-ingress-net}"

  docker network inspect "$network" >/dev/null 2>&1 || \
    cp_die "Traefik Docker network '${network}' does not exist. Start Traefik first or create the external network."
}

refresh_artifacts() {
  local repo="$1"
  local ref="$2"
  local source_root

  source_root="$(cp_download_source "$repo" "$ref")"
  cp_install_runtime_artifacts "$source_root" "$PWD"
}

run_health_check() {
  local keycloak_url api_url frontend_url content_host

  [[ -x ./scripts/check-health.sh ]] || {
    cp_warn "scripts/check-health.sh is missing or not executable; health check skipped"
    return 0
  }

  if [[ "$MODE" == "traefik" ]]; then
    content_host="$(cp_env_get .env CONTENT_POOL_HOST)"
    keycloak_url="$(cp_env_get .env OIDC_PUBLIC_ISSUER_URL)"
    api_url="https://${content_host}/api"
    frontend_url="https://${content_host}"
    ./scripts/check-health.sh server-traefik "$keycloak_url" "$api_url" "$frontend_url"
  else
    keycloak_url="$(cp_env_get .env OIDC_PUBLIC_ISSUER_URL)"
    api_url="http://localhost/api"
    frontend_url="http://localhost"
    ./scripts/check-health.sh server "$keycloak_url" "$api_url" "$frontend_url"
  fi
}

run_compose() {
  if [[ "${#COMPOSE_ENV[@]}" -gt 0 ]]; then
    env "${COMPOSE_ENV[@]}" docker compose "${CONTENT_POOL_COMPOSE_ARGS[@]}" "$@"
  else
    docker compose "${CONTENT_POOL_COMPOSE_ARGS[@]}" "$@"
  fi
}

MODE="${CONTENT_POOL_DEPLOY_MODE:-}"
IMAGE_VERSION_TARGET=""
COMPOSE_ENV=()
BACKUP_ROOT="backups"
BACKUP=1
ALLOW_INCOMPLETE_BACKUP=0
BACKUP_ONLY=0
KEYCLOAK_REALM="${KEYCLOAK_REALM:-iqb}"
KEYCLOAK_USER_CHECK=1
KEYCLOAK_USERS_BEFORE=""
KEYCLOAK_USERS_AFTER=""
LAST_BACKUP_DIR=""
PULL=1
HEALTH_CHECK=1
REFRESH_ARTIFACTS=0
REF="${CONTENT_POOL_REF:-master}"
REPO="${CONTENT_POOL_REPO:-$CONTENT_POOL_REPO_DEFAULT}"
YES=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="$2"
      shift 2
      ;;
    --mode=*)
      MODE="${1#*=}"
      shift
      ;;
    --image-version)
      IMAGE_VERSION_TARGET="$2"
      shift 2
      ;;
    --image-version=*)
      IMAGE_VERSION_TARGET="${1#*=}"
      shift
      ;;
    --backup-dir)
      BACKUP_ROOT="$2"
      shift 2
      ;;
    --backup-dir=*)
      BACKUP_ROOT="${1#*=}"
      shift
      ;;
    --no-backup)
      BACKUP=0
      shift
      ;;
    --allow-incomplete-backup)
      ALLOW_INCOMPLETE_BACKUP=1
      shift
      ;;
    --backup-only)
      BACKUP_ONLY=1
      shift
      ;;
    --keycloak-realm)
      KEYCLOAK_REALM="$2"
      shift 2
      ;;
    --keycloak-realm=*)
      KEYCLOAK_REALM="${1#*=}"
      shift
      ;;
    --no-keycloak-user-check)
      KEYCLOAK_USER_CHECK=0
      shift
      ;;
    --no-pull)
      PULL=0
      shift
      ;;
    --no-health-check)
      HEALTH_CHECK=0
      shift
      ;;
    --refresh-artifacts)
      REFRESH_ARTIFACTS=1
      shift
      ;;
    --ref)
      REF="$2"
      shift 2
      ;;
    --ref=*)
      REF="${1#*=}"
      shift
      ;;
    --repo)
      REPO="$2"
      shift 2
      ;;
    --repo=*)
      REPO="${1#*=}"
      shift
      ;;
    --yes)
      YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      cp_die "Unknown option: $1"
      ;;
  esac
done

[[ -f .env ]] || cp_die ".env not found. Run scripts/install.sh first or copy .env.example to .env."

if [[ -z "$MODE" ]]; then
  MODE="$(cp_detect_mode .env)"
fi
cp_validate_mode "$MODE"
[[ -n "$KEYCLOAK_REALM" ]] || cp_die "--keycloak-realm must not be empty"
cp_require_docker_compose
validate_env_safety

confirm_or_exit "$MODE" "$IMAGE_VERSION_TARGET" "$REFRESH_ARTIFACTS"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cp_info "Dry run only"
  cp_info "Would update mode: ${MODE}"
  [[ -n "$IMAGE_VERSION_TARGET" ]] && cp_info "Would use IMAGE_VERSION=${IMAGE_VERSION_TARGET}"
  [[ "$BACKUP" -eq 1 ]] && cp_info "Would create backup under ${BACKUP_ROOT}"
  [[ "$BACKUP" -eq 1 && "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]] && cp_warn "Would allow incomplete backup sources"
  [[ "$KEYCLOAK_USER_CHECK" -eq 1 ]] && cp_info "Would verify Keycloak user count for realm ${KEYCLOAK_REALM}"
  [[ "$REFRESH_ARTIFACTS" -eq 1 ]] && cp_info "Would refresh artifacts from ${REPO}@${REF}"
  exit 0
fi

capture_keycloak_users_before

if [[ "$BACKUP" -eq 1 ]]; then
  create_backup "$BACKUP_ROOT"
fi

if [[ "$BACKUP_ONLY" -eq 1 ]]; then
  cp_info "Backup-only mode complete"
  exit 0
fi

if [[ "$REFRESH_ARTIFACTS" -eq 1 ]]; then
  refresh_artifacts "$REPO" "$REF"
fi

if [[ -n "$IMAGE_VERSION_TARGET" ]]; then
  cp_info "Using IMAGE_VERSION=${IMAGE_VERSION_TARGET} for this update"
  COMPOSE_ENV=(IMAGE_VERSION="$IMAGE_VERSION_TARGET")
fi

validate_traefik_network

cp_info "Validating Docker Compose configuration"
cp_set_compose_args "$MODE"
run_compose config >/dev/null

if [[ "$PULL" -eq 1 ]]; then
  cp_info "Pulling images"
  run_compose pull
fi

cp_info "Starting updated stack"
run_compose up -d

if [[ "$HEALTH_CHECK" -eq 1 ]]; then
  cp_info "Running health check"
  if ! run_health_check; then
    reject_started_update "Health check failed after update."
  fi
fi

verify_keycloak_users_after

if [[ -n "$IMAGE_VERSION_TARGET" ]]; then
  cp_info "Persisting IMAGE_VERSION=${IMAGE_VERSION_TARGET}"
  cp_env_set .env IMAGE_VERSION "$IMAGE_VERSION_TARGET"
fi

cp_info "Update complete"
