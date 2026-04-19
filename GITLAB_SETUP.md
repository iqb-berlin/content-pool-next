# GitLab CI Setup Guide (GitHub Repository)

This project stays on GitHub and runs CI in GitLab.

Pipeline files:
- `.gitlab-ci.yml`: full pipeline with GitLab dependency scanning include.
- `.gitlab-ci.no-ultimate.yml`: same pipeline without Ultimate-only dependency scanning include/jobs.

Use this guide to set up everything once and get PR statuses in GitHub from GitLab.

## 1) Choose Pipeline Variant

1. If your GitLab plan supports dependency scanning the way configured, use:
   - `.gitlab-ci.yml`
2. If not, use:
   - `.gitlab-ci.no-ultimate.yml`

To switch to the no-Ultimate variant:

```bash
cp .gitlab-ci.no-ultimate.yml .gitlab-ci.yml
git add .gitlab-ci.yml
git commit -m "ci: use no-Ultimate GitLab pipeline variant"
```

## 2) Create GitLab Project for External Repository CI

In GitLab:

1. `Create new project/repository`
2. `Run CI/CD for external repository`
3. Choose `GitHub`
4. Connect `iqb-berlin/content-pool-next`

Result:
- GitLab subscribes to GitHub push and pull_request events.
- Pipelines can run with `CI_PIPELINE_SOURCE=external_pull_request_event`.
- Known limitation: external PR pipelines from fork repositories are ignored.

## 3) Configure GitHub Integration in GitLab Project

In GitLab project:

1. Open `Settings > Integrations > GitHub`
2. Enable integration (`Active`)
3. Set repository URL:
   - `https://github.com/iqb-berlin/content-pool-next`
4. Provide GitHub token for commit statuses.
5. Keep static status check names enabled.
6. Test settings and save.

### GitHub token requirements

Option A (classic PAT):
- scope: `repo:status`

Option B (fine-grained PAT):
- repository: `iqb-berlin/content-pool-next`
- permission: `Commit statuses: Read and write`

## 4) Configure GitLab CI/CD Variables

In GitLab project:

1. Open `Settings > CI/CD > Variables`
2. Add:
   - `GHCR_USERNAME`
   - `GHCR_TOKEN`

Recommended flags:
- Masked: enabled
- Protected: depends on your policy (see below)

Variable protection tradeoff:
- If `Protected` is enabled, variables are available only on protected refs.
- External PR pipelines usually run on unprotected source branches.
- Result: Docker jobs that push images in PR pipelines cannot access `GHCR_*` and fail.
- If you want PR image-build jobs to run, keep `GHCR_*` unprotected (but masked), or remove/disable PR image push jobs.

### GHCR token requirements

The token user must be able to push:
- `ghcr.io/iqb-berlin/content-pool-backend`
- `ghcr.io/iqb-berlin/content-pool-frontend`

For a classic token this usually means:
- `write:packages`
- `read:packages`

If image repositories are private and package permission checks are strict, add:
- `repo`

## 5) Configure GitLab Runner (Docker-in-Docker)

The pipeline builds and pushes Docker images, so jobs need a runner that supports `docker:dind`.

Runner requirements:
- Docker executor
- privileged mode enabled
- network/service support enabled

Example `config.toml` excerpt:

```toml
[[runners]]
  name = "content-pool-docker-runner"
  url = "https://gitlab.com/"
  token = "REDACTED"
  executor = "docker"
  [runners.docker]
    image = "docker:27"
    privileged = true
    volumes = ["/cache"]
```

## 6) Branch and Tag Strategy in This Pipeline

This repository currently uses:
- default branch: `master`
- long-lived branch: `develop`

Pipeline behavior:

1. PR to `develop`:
   - build/test/lint/audit + DB migration check
2. PR to `master`:
   - same quality jobs + container build jobs for PR validation
3. Commit to `develop`:
   - build and push images tagged:
     - `${CI_COMMIT_SHA}`
     - `develop`
4. Commit to `master`:
   - build and push images tagged:
     - `${CI_COMMIT_SHA}`
     - `master`
     - `latest`
5. Pre-release tags:
   - supports `v1.2.3-alpha.1` and `1.2.3-alpha.1`
6. Release tags:
   - supports `v1.2.3` and `1.2.3`
   - retags SHA image to release tag and `latest`

## 7) Configure GitHub Branch Protection

In GitHub repository settings:

1. Create or edit protection rule for `master`
2. Create or edit protection rule for `develop`
3. Enable required status checks
4. Select GitLab check contexts from recent runs

Tip:
- Trigger one PR pipeline first so the GitLab status checks appear in the GitHub UI.

## 8) First Validation Run

After setup:

1. Open a test PR from a feature branch to `develop`
2. Confirm GitLab receives external PR event and starts pipeline
3. Confirm status check appears in GitHub PR
4. Merge test PR
5. Push one commit to `develop`
6. Confirm image tags in GHCR:
   - `develop`
   - commit SHA

Then:

1. Open PR to `master`
2. Merge to `master`
3. Confirm image tags:
   - `master`
   - `latest`
   - commit SHA

## 9) Optional: Avoid Duplicate CI

If GitLab is your primary CI, disable overlapping GitHub Actions workflows to avoid duplicate compute and conflicting checks.

Current GitHub workflow files:
- `.github/workflows/ci.yml`
- `.github/workflows/docker.yml`
- `.github/workflows/security.yml`

Possible strategy:
- Keep GitHub security schedule only.
- Move PR and image pipelines fully to GitLab.

## 10) Common Failure Points

1. No PR pipelines are created:
   - GitLab project was not created as external repository CI project.
   - GitHub integration in GitLab is incomplete.
2. Docker jobs fail to connect to daemon:
   - runner not privileged or wrong Docker executor setup.
3. Image push fails:
   - `GHCR_USERNAME` / `GHCR_TOKEN` missing or insufficient package permissions.
4. Required checks do not block merge:
   - GitHub branch protection does not require the GitLab contexts yet.
5. Dependency scanning job errors on lower GitLab tiers:
   - use `.gitlab-ci.no-ultimate.yml` as active `.gitlab-ci.yml`.
