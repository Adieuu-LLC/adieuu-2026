# AWS deployment (Adieuu)

This document captures the agreed target architecture and operational choices for running Adieuu on AWS. It is written so a **public clone** of the repo can deploy in another account without leaking your secrets: **only examples and variables belong in git**; real credentials and connection strings stay in private state or secret stores.

## Components and mapping

| Piece | In this repo | AWS shape |
|-------|----------------|-----------|
| Web UI | `apps/web` — Vite + React (static after `pnpm build`) | **S3** origin + **CloudFront** (custom domain + ACM in `us-east-1` for CloudFront) |
| HTTP API | `apps/api` — Bun (`Bun.serve`) | **ECS Fargate** service + **ALB** (HTTPS, ACM on ALB) |
| Real-time chat | `apps/chat` — Node + **uWebSockets.js** (`/ws/chat`), Redis pub/sub, Mongo | **Separate ECS Fargate** service + same or separate **ALB** listener rules (WebSocket upgrade supported by ALB) |
| MongoDB | Driver in API/chat | **MongoDB Atlas** (external); optional **VPC peering** with app VPC for private routing and cost predictability |
| Redis | `ioredis` in API/chat | **ElastiCache** (Redis/Valkey-compatible) in **private subnets**; security groups allow only API + chat SGs |

Desktop and mobile apps are **not** deployed as server workloads; they consume the same public API/WebSocket URLs you configure for production.

## Network (minimal but viable)

- **2–3 Availability Zones** for ALB and subnet redundancy.
- **Public subnets**: Application Load Balancer(s), NAT gateway(s).
- **Private subnets**: ECS tasks, ElastiCache.
- **NAT**: Outbound from private subnets (images, patches, Atlas if not fully private yet). **One NAT** minimizes cost; **one NAT per AZ** improves availability (common for production).
- **Security groups**: ALB allows `443` from the internet or from CloudFront-only patterns; ECS tasks accept traffic **only** from the ALB; Redis only from application security groups.

## ECS, scaling, and load balancing

- **ECS on Fargate** for both API and chat (no EC2 cluster to manage).
- **Two ECS services** (separate task definitions): **API** and **chat**, so you can **scale and deploy independently**.
- **Autoscaling**: Per-service ECS Service Auto Scaling via Application Auto Scaling — target tracking on **CPU and memory** (defaults in Terraform); add **request-based** or **custom** metrics later (e.g. WebSocket connection counts for chat).
- **ALB**: Path- or host-based rules to route HTTP API traffic vs WebSocket upgrade traffic; long-lived connections stick to a target until disconnect; use **rolling / connection-draining** deploys to avoid mass drops.
- **Redis pub/sub** in chat supports **multiple chat tasks**; clients still hold one WebSocket per session to a specific target until reconnect.

## Edge security (WAF vs Cloudflare)

- **AWS WAF** can attach to **CloudFront** (static site) and/or **ALB** (API/WebSocket), with managed rule groups and rate limits.
- **Cloudflare** in front is optional: strong DDoS/WAF UX, but you must design **TLS** (Cloudflare to origin), **origin allowlisting** (e.g. only Cloudflare IPs to ALB), and avoid double-caching mistakes.
- Using **both** WAF and Cloudflare is possible; prefer one clear edge story first to limit complexity.

## IaC: Terraform vs CloudFormation (vs both)

| Approach | Notes |
|----------|--------|
| **Terraform** | One language (HCL), large AWS community, **variables + modules** fit a **public template** repo well. **Recommended** for this project’s “optional self-deploy” story. |
| **CloudFormation / CDK** | First-class on AWS; CDK can be attractive if everything is TypeScript. More verbose or another toolchain for contributors who only want Terraform. |
| **Both** | Rarely needed unless organizational policy mandates CloudFormation; otherwise duplicate maintenance. |

The repository includes **Terraform** under `infra/aws/terraform/` as the single source of truth for AWS resources we automate here. Add CloudFormation only if you have a hard requirement.

### What the Terraform stack creates

- **VPC** — public and private subnets across your chosen AZs, NAT gateway(s), DNS hostnames (via the [terraform-aws-modules/vpc](https://registry.terraform.io/modules/terraform-aws-modules/vpc/aws) module).
- **ECR** — two repositories (`api`, `chat`) with a simple “keep last 10 images” lifecycle rule.
- **ALB** — HTTP **:80** (redirects to HTTPS when `route53_zone_name` is set) and HTTPS **:443** with **ACM** for **`api_domain_name`**. Path rules: **`/api/*`** → API; **`/ws/*`**, **`/ready`**, **`/health`** → chat; default **404**. With a custom domain, rules also match **`Host: api.<zone>`**. Idle timeout is high for WebSockets.
- **ECS Fargate** — one cluster, two task definitions, two services (API on port 4000, chat on 9001). Tasks use **private subnets** and **no** public IP; outbound traffic uses the NAT gateway.
- **ElastiCache** — in-VPC **Valkey** (default **`redis_engine_version` = `8.2`**, Redis-compatible wire protocol). Terraform injects **`REDIS_URL`** into API and chat tasks. The apps **require** a Redis-compatible cache for production (sessions, OTP, rate limits, chat pub/sub, etc.); this stack targets an ElastiCache endpoint, not `localhost`.

**Also configured in Terraform (when `route53_zone_name` is set):**

- **Route 53** — **A alias** for **`api_domain_name`** → ALB; **`app_domain_name`** → **CloudFront** (not the ALB). **Apex** (`adieuu.com`) and marketing DNS stay outside this stack.
- **ACM** — separate certificates: **API** in the **ALB region**; **app** in **`us-east-1`** (required for CloudFront). DNS validation records in your public zone.
- **S3 + CloudFront** — private bucket + OAC, SPA-friendly error routing to `index.html`, **`app_domain_name`** on the distribution.
- **WAFv2** — optional **`enable_waf`** (default **true**): **REGIONAL** ACL on the ALB + **CLOUDFRONT**-scoped ACL in `us-east-1` on the distribution (managed rule groups; tune if APIs/WebSockets are blocked).

**Also configured in Terraform (typical):**

- **Secrets Manager** — set `api_container_secrets` / `chat_container_secrets` to map environment variable names to **ARN-style `valueFrom`** strings (including `:JsonKey::` for JSON secrets). The **ECS task execution role** is granted `secretsmanager:GetSecretValue` (and optional `kms:Decrypt` for CMKs via `secretsmanager_kms_key_arns`). Secret **values** are not stored in Terraform state—only ARNs in your `tfvars`. Recommended keys and non-sensitive env names: [ecs-environment.md](./ecs-environment.md).

**Still not in this stack** (typical next steps): **Route 53** for apex/marketing (managed elsewhere). MongoDB remains **Atlas**; supply **`MONGODB_URI`** via Secrets Manager or plain env as above.

**ECS autoscaling**, **VPC interface endpoints**, and **CloudWatch → SNS operational alarms** are configured in Terraform (`ecs_autoscaling.tf`, `vpc_endpoints.tf`, `alarms.tf`).

**Web deploy:** after `pnpm build` for `apps/web`, sync artifacts to **`terraform output web_s3_bucket_id`** and run a CloudFront invalidation (`cloudfront_distribution_id`).

**Operational order:** run `terraform apply`, note **ECR** URLs from `terraform output`, **build and push** `linux/amd64` images, create **Secrets Manager** secrets in the console/CLI, then add their ARNs to `api_container_secrets` / `chat_container_secrets` and **`terraform apply`** again.

## Public repository: safety and customization

- **Never commit**: real `terraform.tfvars`, `*.auto.tfvars`, `.env` with secrets, AWS keys, Atlas connection strings with passwords, Redis auth strings, session signing keys.
- **Do commit**: `terraform.tfvars.example` (placeholders only), `variables.tf` descriptions, and documentation.
- **Ignore** (see root `.gitignore`): `terraform.tfvars`, local `*.auto.tfvars`, `.terraform/`, `*.tfstate` (or use a **remote S3 backend** with encryption and locking for teams).
- **Secrets at runtime**: Prefer **AWS Secrets Manager** or **SSM Parameter Store** (SecureString) for DB URLs and keys; IAM task roles for ECS — no static AWS keys in containers.
- **Per-environment names**: Use variables for `project_name`, `environment`, `aws_region`, domain names, and CIDRs so another user’s VPC does not collide with yours.

## Bootstrap: `deploy-wizard.sh`

`scripts/deploy-wizard.sh` creates a **local** `terraform.tfvars` from the example file if missing and prints next steps. It does **not** echo or store secrets; you still edit `terraform.tfvars` with your values or use environment-specific files outside git.

For more interactive flows later (e.g. prompting for region and bucket name), extend the script or add a small CLI; keep anything that touches secrets **opt-in** and **off** by default in logs.

## Local containers before cloud

Before relying on ECS:

1. Add **Dockerfiles** for `apps/api` (Bun) and `apps/chat` (Node; match **linux/amd64** or **arm64** to Fargate platform).
2. `docker build` / `docker run` locally with the same env vars you will inject in ECS (non-secret via env, secrets via Secrets Manager in AWS).
3. Push images to **ECR**; point Terraform task definitions at image URIs + tags (often via variables).

The web app does not need a server container: `pnpm build` in `apps/web` produces static files for S3 sync + CloudFront invalidation.

## MongoDB Atlas VPC peering (optional Terraform)

The stack can create an Atlas **network container**, request **VPC peering** into this VPC, **accept** the peering in AWS, **enable DNS resolution** on the accepter side, and add **private routes** from each private route table to the Atlas CIDR (`atlas_peering.tf`).

**Requirements**

- Atlas cluster in the **same AWS region** as `var.aws_region`, tier **M10+** (or dedicated) so VPC peering is supported.
- **`atlas_network_cidr_block`** must be a **non-overlapping** RFC1918 CIDR (e.g. `10.43.0.0/16`) versus **`vpc_cidr`**.
- If Atlas already has a **network container** for this region in the project, **import** it into `mongodbatlas_network_container` instead of letting Terraform create a second one.

**Terraform inputs** (see `terraform.tfvars.example`)

- `enable_mongodb_atlas_peering` — turn on the resources.
- `atlas_project_id` — Project Settings in Atlas.
- `atlas_network_cidr_block` — container CIDR for the Atlas side.
- **Atlas API keys** — Terraform `mongodb/mongodbatlas` provider: set **`atlas_api_public_key`** / **`atlas_api_private_key`** or environment variables **`MONGODB_ATLAS_PUBLIC_KEY`** / **`MONGODB_ATLAS_PRIVATE_KEY`** (prefer env over committed tfvars).

**After apply**

1. In Atlas **Network Access**, confirm peering is **ACTIVE** and the cluster is attached to the peered network.
2. Use the **private** connection string (SRV) for **`MONGODB_URI`** in Secrets Manager (or plain env) for API and chat.
3. **Tighten** the Atlas IP access list (e.g. allow only `vpc_cidr` or remove public `0.0.0.0/0` once verified).

**Alternatives** — Atlas **Private Endpoint** / PrivateLink is a different model; this stack only automates **VPC peering**.

**Outputs** — `terraform output mongodb_atlas_peering_followup` for a short checklist.

## Related paths in the repo

- `infra/aws/README.md` — Terraform quick start
- `infra/aws/terraform/terraform.tfvars.example` — placeholder variables only
