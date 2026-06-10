#!/usr/bin/env bash

CONTENT_POOL_REPO_DEFAULT="iqb-berlin/content-pool-next"

cp_info() {
  printf '==> %s\n' "$*"
}

cp_warn() {
  printf 'Warning: %s\n' "$*" >&2
}

cp_die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cp_require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || cp_die "Required command not found: $cmd"
}

cp_require_docker_compose() {
  cp_require_cmd docker
  docker compose version >/dev/null 2>&1 || cp_die "Docker Compose v2 is required (docker compose version failed)"
}

cp_abs_path() {
  local path="$1"
  mkdir -p "$path"
  (cd "$path" && pwd -P)
}

cp_env_get() {
  local file="$1"
  local key="$2"
  local line
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 0

  local value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value#\"}"
    value="${value%\"}"
  elif [[ "$value" == \'* && "$value" == *\' ]]; then
    value="${value#\'}"
    value="${value%\'}"
  fi
  printf '%s' "$value"
}

cp_env_set() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp

  touch "$file"
  tmp="$(mktemp "${TMPDIR:-/tmp}/content-pool-env.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { replaced = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      replaced = 1
      next
    }
    { print }
    END {
      if (replaced == 0) {
        print key "=" value
      }
    }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

cp_env_is_placeholder() {
  local value="$1"
  case "$value" in
    ""|change-me*|*example.com*|*YOUR_SERVER_IP*|hostname.de)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

cp_env_set_if_placeholder() {
  local file="$1"
  local key="$2"
  local value="$3"
  local current

  current="$(cp_env_get "$file" "$key")"
  if cp_env_is_placeholder "$current"; then
    cp_env_set "$file" "$key" "$value"
  fi
}

cp_random_secret() {
  local length="${1:-48}"
  cp_require_cmd openssl
  openssl rand -hex "$(( (length + 1) / 2 ))" | cut -c "1-${length}"
}

cp_validate_mode() {
  local mode="$1"
  case "$mode" in
    server|traefik)
      ;;
    *)
      cp_die "Unsupported deployment mode: $mode (expected: server or traefik)"
      ;;
  esac
}

cp_set_compose_args() {
  local mode="$1"
  cp_validate_mode "$mode"
  CONTENT_POOL_COMPOSE_ARGS=(-f docker-compose.server.yml)
  if [[ "$mode" == "traefik" ]]; then
    CONTENT_POOL_COMPOSE_ARGS+=(-f docker-compose.traefik.yml)
  fi
}

cp_detect_mode() {
  local env_file="${1:-.env}"
  local content_host
  content_host="$(cp_env_get "$env_file" CONTENT_POOL_HOST)"
  if [[ -f docker-compose.traefik.yml ]] && ! cp_env_is_placeholder "$content_host"; then
    printf 'traefik'
  else
    printf 'server'
  fi
}

cp_download_source() {
  local repo="$1"
  local ref="$2"
  local temp_dir tarball source_dir

  cp_require_cmd curl
  cp_require_cmd tar

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/content-pool-source.XXXXXX")"
  tarball="${temp_dir}/source.tar.gz"

  cp_info "Downloading ${repo}@${ref}" >&2
  curl -fsSL "https://github.com/${repo}/archive/${ref}.tar.gz" -o "$tarball"
  tar -xzf "$tarball" -C "$temp_dir"

  source_dir="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [[ -n "$source_dir" ]] || cp_die "Downloaded archive did not contain a source directory"
  printf '%s' "$source_dir"
}

cp_copy_file_if_present() {
  local source_root="$1"
  local target_root="$2"
  local path="$3"
  local target_file target_dir tmp_file

  if [[ -f "${source_root}/${path}" ]]; then
    target_file="${target_root}/${path}"
    target_dir="$(dirname "$target_file")"
    mkdir -p "$target_dir"
    tmp_file="$(mktemp "${target_dir}/.$(basename "$path").XXXXXX")"
    command cp -f "${source_root}/${path}" "$tmp_file"
    command mv -f "$tmp_file" "$target_file"
  fi
}

cp_copy_tree_if_present() {
  local source_root="$1"
  local target_root="$2"
  local path="$3"

  if [[ -d "${source_root}/${path}" ]]; then
    mkdir -p "${target_root}"
    (cd "$source_root" && tar -cf - "$path") | (cd "$target_root" && tar -xf -)
  fi
}

cp_install_runtime_artifacts() {
  local source_root="$1"
  local target_root="$2"
  local source_abs target_abs

  source_abs="$(cd "$source_root" && pwd -P)"
  target_abs="$(cp_abs_path "$target_root")"

  if [[ "$source_abs" == "$target_abs" ]]; then
    cp_info "Using current repository as deployment directory"
    return 0
  fi

  cp_info "Installing deployment artifacts into ${target_abs}"

  local file
  for file in \
    .env.example \
    docker-compose.server.yml \
    docker-compose.traefik.yml \
    nginx.server.conf
  do
    cp_copy_file_if_present "$source_abs" "$target_abs" "$file"
  done

  cp_copy_tree_if_present "$source_abs" "$target_abs" keycloak

  mkdir -p "${target_abs}/scripts/make"
  for file in \
    scripts/check-health.sh \
    scripts/build-keycloak-altcha.sh \
    scripts/configure-keycloak-registration.sh \
    scripts/configure-keycloak-smtp.sh \
    scripts/configure-hu-postfix-relay.sh \
    scripts/init-keycloak.sh \
    scripts/deploy-common.sh \
    scripts/install.sh \
    scripts/update.sh \
    scripts/make/server.mk
  do
    cp_copy_file_if_present "$source_abs" "$target_abs" "$file"
  done

  if [[ -f "${source_abs}/scripts/make/server.mk" ]] && [[ ! -d "${target_abs}/backend" || ! -d "${target_abs}/frontend" ]]; then
    command cp -f "${source_abs}/scripts/make/server.mk" "${target_abs}/Makefile"
  elif [[ -f "${source_abs}/Makefile" && ! -f "${target_abs}/Makefile" ]]; then
    command cp -f "${source_abs}/Makefile" "${target_abs}/Makefile"
  fi

  chmod +x "${target_abs}"/scripts/*.sh 2>/dev/null || true
}

cp_has_running_container() {
  local name="$1"
  docker ps --format '{{.Names}}' | grep -Fx "$name" >/dev/null 2>&1
}
