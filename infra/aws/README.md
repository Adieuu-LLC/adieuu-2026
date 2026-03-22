# AWS infrastructure (Terraform)

Terraform code for Adieuu on AWS lives in `terraform/`. It is intended to be **safe to use from a public clone**: copy `terraform.tfvars.example` to `terraform.tfvars`, fill in **your** account-specific values, and **never commit** secrets.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) `>= 1.5`
- AWS credentials (e.g. `aws configure` or environment variables)
- **Docker images** for API and chat built for **`linux/amd64`** (Fargate in this stack uses `X86_64`) and **pushed to ECR** after the repositories exist (`terraform apply` creates the repos; push tags such as `latest` or your release tag)

## Quick start

From the repository root:

```bash
./scripts/deploy-wizard.sh
cd infra/aws/terraform
terraform init
terraform plan
```

Review the plan, then `terraform apply` when ready.

After apply:

```bash
terraform output
```

Use `ecr_api_repository_url` and `ecr_chat_repository_url` to tag and push images, for example:

```bash
AWS_REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

docker tag adieuu-api:local "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/adieuu-staging-api:latest"
docker push "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/adieuu-staging-api:latest"
# repeat for chat with the chat repository name from terraform output / ECR console
```

Replace `adieuu-staging-api` with the repository name shown in the AWS console or `terraform output` (it follows the pattern `{project}-{environment}-api`).

## Layout

| File / pattern | Purpose |
|----------------|---------|
| `main.tf` | Data sources (caller identity, region, AZs) |
| `locals.tf` | Naming, subnet CIDR math |
| `variables.tf` | Inputs (VPC, ECS sizing, env maps) |
| `vpc.tf` | VPC module |
| `ecr.tf` | ECR repositories + lifecycle |
| `iam_ecs.tf` | ECS execution + task roles; optional `GetSecretValue` / `kms:Decrypt` for container secrets |
| `security_groups.tf` | ALB and ECS task security groups |
| `alb.tf` | ALB, target groups, listener rules (HTTP + HTTPS when custom domain) |
| `dns.tf` | Route 53 aliases + ACM DNS validation (API + app certs) |
| `cloudfront.tf` | S3 web bucket (OAC) + CloudFront for `app_domain_name` |
| `waf.tf` | WAFv2 for ALB + CloudFront (`enable_waf`) |
| `cloudwatch.tf` | Log groups for ECS |
| `ecs.tf` | ECS cluster, task definitions, services |
| `elasticache.tf` | In-VPC ElastiCache **Valkey** (`redis_engine_version`, default `8.2`); injects `REDIS_URL` for API/chat |
| `ecs_autoscaling.tf` | Application Auto Scaling for API + chat (CPU/memory target tracking) |
| `vpc_endpoints.tf` | Interface VPC endpoints (ECR, logs, secrets, STS, KMS) + S3 gateway (optional via `enable_vpc_interface_endpoints`) |
| `alarms.tf` | SNS + CloudWatch alarms (ALB/ECS/ElastiCache) |
| `atlas_peering.tf` | Optional MongoDB Atlas network container + VPC peering, routes, DNS resolution on the peering |
| `outputs.tf` | ALB DNS, ECR URLs, subnet IDs, optional Redis endpoint, SNS topic for alarms |
| `terraform.tfvars.example` | **Committed** — placeholders; commented env/secrets templates (see [ecs-environment.md](../../docs/deployment/ecs-environment.md)) |
| `terraform.tfvars` | **Local / private** — gitignored |

## Backend state

By default Terraform uses **local state** (`terraform.tfstate`) in this directory — suitable for experiments. For teams, configure a **remote S3 backend** with DynamoDB locking in `versions.tf`. Keep state files private.

## Related documentation

- [docs/deployment/aws.md](../../docs/deployment/aws.md) — architecture, what Terraform covers, secrets
- [docs/deployment/ecs-environment.md](../../docs/deployment/ecs-environment.md) — sensitive vs non-sensitive env vars, Secrets Manager keys, `terraform.tfvars` maps
- [docs/deployment/containers.md](../../docs/deployment/containers.md) — building API/chat images
