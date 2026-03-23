# GitHub Actions: AWS deploy (main)

Production deploys from this repository use the [Deploy AWS](../../.github/workflows/deploy-aws.yml) workflow: **push to `main`** (path-filtered) or **`workflow_dispatch`** (full redeploy).

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
| `DEPLOY_ECR_API_REPOSITORY_URL_ADIEUU` | `ecr_api_repository_url` |
| `DEPLOY_ECR_CHAT_REPOSITORY_URL_ADIEUU` | `ecr_chat_repository_url` |
| `DEPLOY_ECS_CLUSTER_NAME_ADIEUU` | `ecs_cluster_name` |
| `DEPLOY_ECS_SERVICE_API_ADIEUU` | `ecs_service_api_name` |
| `DEPLOY_ECS_SERVICE_CHAT_ADIEUU` | `ecs_service_chat_name` |

If `DEPLOY_WEB_S3_BUCKET_ADIEU` or `DEPLOY_CLOUDFRONT_DISTRIBUTION_ID` is unset, the web deploy job is skipped (e.g. stack without `route53_zone_name`). Container jobs are skipped if their ECR/ECS variables are incomplete.

## Behavior

- **Paths** — Web changes under `apps/web/`, `packages/shared/`, `packages/ui/`. API under `apps/api/`, `packages/crypto/`, `packages/shared/`. Chat under `apps/chat/`. Changes to `pnpm-lock.yaml`, root `package.json`, `pnpm-workspace.yaml`, or `turbo.json` trigger **all** deploys.
- **Images** — Each service is tagged with the commit SHA and `latest`; ECR moves `latest` to the new digest on push. ECS uses **`force-new-deployment`** so tasks pull the updated `latest` image.
- **Branch** — The IAM role trust policy allows only `refs/heads/main` for the configured repository.

## Staging

A second environment (e.g. staging) will use a separate Terraform workspace or stack, different repository variables, and optionally a dedicated IAM role with a narrower trust policy or environment-based GitHub `sub` claims when you add that workflow.
