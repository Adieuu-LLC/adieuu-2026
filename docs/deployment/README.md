# Deployment documentation

Self-hosted and cloud deployment notes for Adieuu.

| Document | Description |
|----------|-------------|
| [AWS (ECS, VPC, edge)](./aws.md) | Target AWS architecture, Terraform vs alternatives, public-repo safety, customization |
| [Containers (Docker)](./containers.md) | Building and running API and chat images locally |
| [Terraform (`infra/aws/terraform`)](../../infra/aws/README.md) | VPC, ECR, ALB, ECS Fargate — see `terraform output` after apply |

## Order of operations

1. **Containers** — Build and run **API** (Bun) and **chat** (Node + uWebSockets.js) as local Docker images; push to a registry (e.g. ECR) before wiring ECS task definitions to real images.
2. **Infrastructure** — Apply Terraform (or your IaC) with values from `terraform.tfvars` (never commit real secrets).
3. **Frontends** — Build `apps/web` (Vite) and publish static assets to S3 + CloudFront (separate from ECS).

See `infra/aws/README.md` for the Terraform layout and `scripts/deploy-wizard.sh` for a guided `tfvars` bootstrap.
