# AWS infrastructure (Terraform)

Terraform code for Adieuu on AWS lives in `terraform/`. It is intended to be **safe to use from a public clone**: copy `terraform.tfvars.example` to `terraform.tfvars`, fill in **your** account-specific values, and **never commit** secrets.

## Prerequisites

- [Terraform](https://www.terraform.io/downloads) `>= 1.5`
- AWS credentials (e.g. `aws configure` or environment variables)
- Docker images for **API** and **chat** built and pushed to **ECR** (or another registry) before wiring full ECS services

## Quick start

From the repository root:

```bash
./scripts/deploy-wizard.sh
cd infra/aws/terraform
terraform init
terraform plan
```

Review the plan, then `terraform apply` when ready.

## Files

| File | Purpose |
|------|---------|
| `terraform.tfvars.example` | **Committed** — placeholder variable values only |
| `terraform.tfvars` | **Local / private** — your real values; gitignored |
| `*.tf` | Resource definitions (grow this directory as modules are added) |

## Backend state

By default Terraform uses **local state** (`terraform.tfstate`) in this directory — suitable for experiments. For teams, configure a **remote S3 backend** with DynamoDB locking (variables for bucket/table names can be added later). Keep state files private.

## Related documentation

- [docs/deployment/aws.md](../../docs/deployment/aws.md) — architecture, scaling, edge security, Atlas peering
