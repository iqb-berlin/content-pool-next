#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/configure-github-release-settings.sh --reviewer USER [options]

Configure master branch protection and the protected production environment.
Run only after the workflow containing the release-gate job is merged.

Options:
  --repo OWNER/REPO  Repository (default: current gh repository)
  --branch NAME      Protected release branch (default: master)
  --reviewer USER    Different GitHub user who may approve production (required)
USAGE
}

repo=""
branch=master
reviewer=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --repo=*) repo="${1#*=}"; shift ;;
    --branch) branch="$2"; shift 2 ;;
    --branch=*) branch="${1#*=}"; shift ;;
    --reviewer) reviewer="$2"; shift 2 ;;
    --reviewer=*) reviewer="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[[ -n "$repo" ]] || repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
[[ -n "$reviewer" ]] || { echo "--reviewer USER is required" >&2; exit 1; }

actor="$(gh api user --jq .login)"
[[ "$reviewer" != "$actor" ]] || {
  echo "Production approval must be assigned to a second person" >&2
  exit 1
}
reviewer_id="$(gh api "users/${reviewer}" --jq .id)"

workflow="$(gh api -H 'Accept: application/vnd.github.raw+json' \
  "repos/${repo}/contents/.github/workflows/ci.yml?ref=${branch}")"
grep -Eq '^    name: release-gate$' <<<"$workflow" || {
  echo "release-gate is not present on ${branch}; merge the workflow first" >&2
  exit 1
}

temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/content-pool-github-settings.XXXXXX")"
trap 'rm -rf "$temp_dir"' EXIT
if gh api "repos/${repo}/branches/${branch}/protection" >"${temp_dir}/current.json" 2>/dev/null; then
  jq '{
    required_status_checks: {strict: true, contexts: ["release-gate"]},
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: (.required_pull_request_reviews.dismiss_stale_reviews // false),
      require_code_owner_reviews: (.required_pull_request_reviews.require_code_owner_reviews // false),
      required_approving_review_count: 1,
      require_last_push_approval: (.required_pull_request_reviews.require_last_push_approval // false)
    },
    restrictions: (if .restrictions == null then null else {
      users: [.restrictions.users[].login],
      teams: [.restrictions.teams[].slug],
      apps: [.restrictions.apps[].slug]
    } end),
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  }' "${temp_dir}/current.json" >"${temp_dir}/branch.json"
else
  jq -n '{
    required_status_checks: {strict: true, contexts: ["release-gate"]},
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
      require_last_push_approval: false
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  }' >"${temp_dir}/branch.json"
fi

gh api --method PUT "repos/${repo}/branches/${branch}/protection" \
  --input "${temp_dir}/branch.json" >/dev/null
jq -n --argjson reviewer_id "$reviewer_id" '{
  wait_timer: 0,
  prevent_self_review: true,
  reviewers: [{type: "User", id: $reviewer_id}],
  deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}
}' >"${temp_dir}/environment.json"
gh api --method PUT "repos/${repo}/environments/production" \
  --input "${temp_dir}/environment.json" >/dev/null

echo "Configured ${repo}:${branch} protection and production approval by ${reviewer}"
