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
  read -r -p 'Continue? [y/N]: ' answer
  case "$answer" in
    y|Y|yes|YES)
      ;;
    *)
      cp_die "Update aborted"
      ;;
  esac
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

create_backup() {
  local backup_root="$1"
  local backup_dir
  local postgres_user postgres_db keycloak_user keycloak_db
  local old_umask

  old_umask="$(umask)"
  umask 077
  backup_dir="$(create_backup_dir "$backup_root")"

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
cp_require_docker_compose

confirm_or_exit "$MODE" "$IMAGE_VERSION_TARGET" "$REFRESH_ARTIFACTS"

if [[ "$DRY_RUN" -eq 1 ]]; then
  cp_info "Dry run only"
  cp_info "Would update mode: ${MODE}"
  [[ -n "$IMAGE_VERSION_TARGET" ]] && cp_info "Would use IMAGE_VERSION=${IMAGE_VERSION_TARGET}"
  [[ "$BACKUP" -eq 1 ]] && cp_info "Would create backup under ${BACKUP_ROOT}"
  [[ "$BACKUP" -eq 1 && "$ALLOW_INCOMPLETE_BACKUP" -eq 1 ]] && cp_warn "Would allow incomplete backup sources"
  [[ "$REFRESH_ARTIFACTS" -eq 1 ]] && cp_info "Would refresh artifacts from ${REPO}@${REF}"
  exit 0
fi

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

if [[ -n "$IMAGE_VERSION_TARGET" ]]; then
  cp_info "Persisting IMAGE_VERSION=${IMAGE_VERSION_TARGET}"
  cp_env_set .env IMAGE_VERSION "$IMAGE_VERSION_TARGET"
fi

if [[ "$HEALTH_CHECK" -eq 1 ]]; then
  cp_info "Running health check"
  run_health_check
fi

cp_info "Update complete"
