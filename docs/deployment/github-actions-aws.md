# GitHub Actions: AWS deploy (main)

Production deploys are **invoked from the [Release](../../.github/workflows/release.yml) workflow** (job `deploy-aws`) so they run **once per merge**, **after** the `release` job finishes: either the **version bump is on `main`** (`released=true`) or we still ship **without** a new tag when the tag already exists (`tag_exists` path). That matches **web `package.json` / `version.json`** to the commit on **`main`**, avoids racing the release bump, and avoids a **second** deploy from the follow-up CI run on `chore(release):` commits.

Manual redeploys use [Deploy AWS](../../.github/workflows/deploy-aws.yml) (**`workflow_dispatch`** only), which calls the reusable workflow [deploy-aws-reusable.yml](../../.github/workflows/deploy-aws-reusable.yml) and deploys **current `main`** (full web + API + chat when variables are set).

## Prerequisites

1. **OIDC provider** — Terraform **creates** the account-level GitHub OIDC provider (`token.actions.githubusercontent.com`) when `github_oidc_provider_arn` is left empty. If that provider **already exists** in this account (e.g. from marketing or another stack), set `github_oidc_provider_arn` in `terraform.tfvars` to that ARN so Terraform does not try to create a duplicate (`EntityAlreadyExists`).

2. **Terraform** — Apply the stack so `github_actions_deploy_role_arn` exists (`enable_github_actions_deploy_role` defaults to `true`). Override `github_actions_repository` if the repo name differs.

3. **GitHub configuration** — Add the following.

### Repository secret

| Name | Value |
|------|--------|
| `AWS_DEPLOY_ROLE_ARN_ADIEUU` | Output `github_actions_deploy_role_arn` from `terraform output` |

### Repository variables

Copy from `terraform output` (non-secret; using variables keeps them out of workflow YAML).

| Variable | Terraform output |
|----------|------------------|
| `AWS_REGION` | `aws_region` (optional; workflow defaults to `us-east-1`) |
| `DEPLOY_WEB_S3_BUCKET_ADIEUU` | `web_s3_bucket_name` (requires public DNS + TLS / CloudFront stack) |
| `DEPLOY_CLOUDFRONT_DISTRIBUTION_ID_ADIEUU` | `cloudfront_distribution_id` |
| `DEPLOY_WEB_VITE_API_BASE_URL_ADIEUU` | Not from Terraform: public API origin for the Vite build, e.g. `https://api.adieuu.com` (align with `api_domain_name` and API `CORS_ORIGINS`). |
| `DEPLOY_WEB_VITE_CHAT_WS_URL_ADIEUU` | Not from Terraform: chat WebSocket URL for the web build, e.g. `wss://api.adieuu.com/ws/chat` (ALB routes `/ws/*` on the API host). |
| `DEPLOY_ECR_API_REPOSITORY_URL_ADIEUU` | `ecr_api_repository_url` |
| `DEPLOY_ECR_CHAT_REPOSITORY_URL_ADIEUU` | `ecr_chat_repository_url` |
| `DEPLOY_ECS_CLUSTER_NAME_ADIEUU` | `ecs_cluster_name` |
| `DEPLOY_ECS_SERVICE_API_ADIEUU` | `ecs_service_api_name` |
| `DEPLOY_ECS_SERVICE_CHAT_ADIEUU` | `ecs_service_chat_name` |

If `DEPLOY_WEB_S3_BUCKET_ADIEUU` or `DEPLOY_CLOUDFRONT_DISTRIBUTION_ID_ADIEUU` is unset, the web deploy job is skipped (e.g. stack without `route53_zone_name`). Container jobs are skipped if their ECR/ECS variables are incomplete.

### Downloads stack (optional; after Terraform with `enable_downloads_stack = true`)

When the **dedicated downloads** stack exists (`downloads.adieuu.com` -- dual-origin S3 + CloudFront for desktop update mirror, SBOMs, and `releases.json`), add variables from `terraform output`. The [release workflow](../../.github/workflows/release.yml) `sync-downloads-mirror` job uses these to sync desktop artifacts, manifests, and SBOMs. If the variables are unset, the job is skipped gracefully.

See [desktop-updates-s3-cf.md](./desktop-updates-s3-cf.md) for the full architecture (dual-origin CloudFront with private manifest bucket).

| Variable | Terraform output |
|----------|------------------|
| `DEPLOY_DOWNLOADS_S3_BUCKET_ADIEUU` | `downloads_s3_bucket_name` |
| `DEPLOY_RELEASE_MANIFESTS_S3_BUCKET_ADIEUU` | `release_manifests_s3_bucket_name` |
| `DEPLOY_DOWNLOADS_CLOUDFRONT_DISTRIBUTION_ID_ADIEUU` | `downloads_cloudfront_distribution_id` |
| `DEPLOY_DOWNLOADS_DOMAIN_ADIEUU` | Domain only from `downloads_base_url`, e.g. `downloads.adieuu.com`. Used in `releases.json` download URLs. Falls back to `downloads.adieuu.com` if unset. |

GitHub Releases remain the **source of truth**; the downloads stack is an additional public mirror.

## Behavior

- **Order** — Automatic deploys run **inside the Release workflow** after the **`release`** job (not in parallel with the version bump). They do **not** use path filters: each deploy builds **full** web + API + chat from **`main`** at that moment so release-only commits (version bumps across `package.json` files) still produce correct images and `version.json`.
- **When deploy runs** — `deploy_aws` is true if **`released`** is true (new version pushed) **or** if the new tag **already existed** (`tag_exists`): we still deploy the merged code at **`main`**. Release skips (chore commit, stale CI) set `deploy_aws` to false.
- **Images** — Each service is tagged with the commit SHA and `latest`; ECR moves `latest` to the new digest on push. ECS uses **`force-new-deployment`** so tasks pull the updated `latest` image.
- **Branch** — The IAM role trust policy allows only `refs/heads/main` for the configured repository.

## Staging

A second environment (e.g. staging) will use a separate Terraform workspace or stack, different repository variables, and optionally a dedicated IAM role with a narrower trust policy or environment-based GitHub `sub` claims when you add that workflow.
