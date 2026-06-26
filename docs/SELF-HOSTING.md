# Self-Hosting Guide

This guide walks through deploying Adieuu on your own infrastructure. It assumes basic familiarity with AWS, Terraform, and Docker. Make sure you read and understand how this code is licensed.

While this guide and the referenced code is a good indication of how we *generally* deploy, we do have some local tooling and configuration that may differ (e.g. this won't be quite 1:1 with what we've deployed, especially w.r.t WAF, ALBs, and some networking & security configs).

> Looking for a two-line Docker run-and-gun? Sorry to disappoint. This isn't a tiny app - you are deploying a *platform*. Minimum AWS cost with current stack, all optionals disabled and no traffic (as of early 2026) is ~$170 USD/mo on-demand. We don't currently have plans to support other cloud providers, or offering minimal footprint options (though we'll accept PRs that might better suit community needs).

For detailed architecture documentation, see [docs/deployment/aws.md](deployment/aws.md).

## Prerequisites

- **AWS account** with admin access (or scoped IAM for Terraform)
- **Terraform** 1.5+
- **Node.js** 26+ and **pnpm** 10+
- **Docker** (for building API and chat images)
- **MongoDB** (Atlas M10+ recommended, or self-hosted)
- **Font Awesome Pro** license (for icons — see [Font Awesome Setup](#font-awesome-pro-setup) below)
- A registered domain with DNS you control

## Font Awesome Pro Setup

This project uses Font Awesome Pro icons (Sharp DuoTone Solid). The source code imports from `@adieuu-llc/fa-*`, which is an internal caching mirror. Self-hosters remap these to the official Font Awesome packages using pnpm overrides.

### 1. Add pnpm overrides to `package.json`

Add to the root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "@adieuu-llc/fa-sharp-duotone-solid-svg-icons": "npm:@fortawesome/sharp-duotone-solid-svg-icons@^7.2.0",
      "@adieuu-llc/fa-fontawesome-svg-core": "npm:@fortawesome/fontawesome-svg-core@^7.2.0"
    }
  }
}
```

### 2. Configure `.npmrc` for Font Awesome

Replace the `@adieuu-llc` registry line in `.npmrc` with your Font Awesome token:

```ini
# Comment out or remove:
# @adieuu-llc:registry=https://npm.pkg.github.com
# //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}

# Add your Font Awesome Pro registry:
@fortawesome:registry=https://npm.fontawesome.com
//npm.fontawesome.com/:_authToken=${FONTAWESOME_TOKEN}
```

Set `FONTAWESOME_TOKEN` in your environment (from your [Font Awesome account](https://fontawesome.com/account)).

### 3. Install

```bash
pnpm install
```

## Clone and Build

```bash
git clone https://github.com/Adieuu-LLC/adieuu-2026.git
cd adieuu-2026

# Apply Font Awesome overrides (see above), then:
pnpm install
pnpm build
```

## Infrastructure (Terraform)

The full AWS stack is defined in `infra/aws/terraform/`. It creates: VPC, ECS Fargate (API + chat), ALB, ElastiCache Redis, S3 + CloudFront (web, media, downloads), WAF, and optional LiveKit EC2.

### 1. Bootstrap variables

```bash
cd infra/aws/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
aws_region   = "us-east-1"
project_name = "myapp"
environment  = "production"

# Your domains
route53_zone_name = "example.com"
api_domain_name   = "api.example.com"
app_domain_name   = "app.example.com"

# VPC
vpc_cidr                = "10.42.0.0/16"
availability_zone_count = 2
enable_nat_gateway      = true
single_nat_gateway      = true
```

See `terraform.tfvars.example` for the full list of options (autoscaling, media stack, LiveKit, downloads CDN, GitHub Actions OIDC, etc.).

### 2. Apply

```bash
terraform init
terraform plan
terraform apply
```

### 3. Note outputs

After apply, `terraform output` provides ECR repository URLs, ALB DNS, CloudFront distribution IDs, and other values needed for deployment.

## Secrets Manager

Sensitive values are stored in AWS Secrets Manager and injected into ECS tasks at runtime. Create a JSON secret (e.g. `myapp/production/api`) with these keys:

| Key | Description |
|-----|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `CSRF_SECRET` | `openssl rand -base64 32` |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `OTP_SECRET` | `openssl rand -base64 32` |
| `ACCOUNT_HASH_SECRET` | `openssl rand -base64 32` (non-rotatable) |
| `TOKEN_SIGNING_KEY` | `openssl rand -base64 32` |
| `AWS_ACCESS_KEY_ID` | IAM user for SES/S3 |
| `AWS_SECRET_ACCESS_KEY` | IAM user for SES/S3 |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `LIVEKIT_API_SECRET` | LiveKit API secret (if calls enabled) |

Optional keys: `TEXTMAGIC_USERNAME`, `TEXTMAGIC_API_KEY`, `KLIPY_API_KEY`, `IPLOCATE_API_KEY`, `VERIFYMY_API_KEY`, `VERIFYMY_API_SECRET`, `CYBERTIPLINE_USERNAME`, `CYBERTIPLINE_PASSWORD`.

Set the secret ARN(s) in `terraform.tfvars` under `api_container_secrets` and `chat_container_secrets`. See [docs/deployment/ecs-environment.md](deployment/ecs-environment.md) for the full inventory.

## Build and Deploy

### Docker images (API + Chat)

```bash
# Build (default Terraform uses ARM64/Graviton — match the platform)
docker build --platform linux/arm64 -f apps/api/Dockerfile -t myapp-api .
docker build --platform linux/arm64 -f apps/chat/Dockerfile -t myapp-chat .

# Tag and push to ECR (use URLs from terraform output)
docker tag myapp-api:latest <account-id>.dkr.ecr.<region>.amazonaws.com/myapp-production-api:latest
docker tag myapp-chat:latest <account-id>.dkr.ecr.<region>.amazonaws.com/myapp-production-chat:latest

aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/myapp-production-api:latest
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/myapp-production-chat:latest
```

### Web (static Vite build)

```bash
# Set build-time env vars for your domains
export VITE_API_ORIGIN=https://api.example.com
export VITE_API_BASE_URL=https://api.example.com
export VITE_CHAT_WS_URL=wss://api.example.com/ws/chat
export VITE_APP_ORIGIN=https://app.example.com
export VITE_DOWNLOADS_BASE_URL=https://downloads.example.com
export VITE_MEDIA_ORIGIN=https://media.example.com
export VITE_E2E_MEDIA_ORIGIN=https://e2e-media.example.com
export VITE_LIVEKIT_URL=wss://livestream.example.com

pnpm --filter @adieuu/web build

# Upload to S3 (from terraform output)
aws s3 sync apps/web/dist/ s3://<web-bucket>/ --delete
```

### ECS deployment

After pushing images, force a new deployment:

```bash
aws ecs update-service --cluster myapp-production --service myapp-production-api --force-new-deployment
aws ecs update-service --cluster myapp-production --service myapp-production-chat --force-new-deployment
```

## DNS and TLS

Terraform creates ACM certificates and Route53 records when `route53_zone_name` is set. Ensure your domain's nameservers point to the Route53 hosted zone.

Required DNS records (created automatically by Terraform):
- `api.example.com` → ALB
- `app.example.com` → CloudFront (web)
- `media.example.com` → CloudFront (media, if enabled)
- `downloads.example.com` → CloudFront (desktop updates, if enabled)
- `livestream.example.com` → LiveKit EC2 (if enabled)

## Desktop App (Optional)

To build the desktop app for your instance:

```bash
cd apps/desktop

# Set environment for your deployment
export VITE_API_URL=https://api.example.com
export VITE_CHAT_WS_URL=wss://api.example.com/ws/chat
export VITE_APP_ORIGIN=https://app.example.com
export VITE_DOWNLOADS_BASE_URL=https://downloads.example.com
export ADIEUU_APP_ORIGIN=https://app.example.com
export ADIEUU_UPDATE_SERVER_URL=https://downloads.example.com/latest

pnpm build
pnpm dist  # Produces platform installers
```

Note: You'll need to update `apps/desktop/package.json` → `build.publish.url` to point to your downloads CDN for auto-updates.

## Optional Services

### LiveKit (Voice/Video Calls)

Set `livekit_enabled = true` in `terraform.tfvars` along with `livekit_domain` and `livekit_api_key`. Store the API secret in Secrets Manager. See `terraform.tfvars.example` for full configuration.

### Media Stack (Uploads, Avatars, Attachments)

Set `enable_media_stack = true` with `media_domain_name`. This creates S3 buckets, CloudFront distributions, and Lambda processors for image/video handling and CSAM hash moderation.

### Desktop Update Server

Set `enable_downloads_stack = true` with `downloads_domain_name`. This creates an S3 + CloudFront distribution for hosting desktop release binaries and update manifests.

## Environment Variable Reference

### Build-time (VITE_ prefix, baked into web/desktop at build)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_ORIGIN` | `https://api.adieuu.com` | API origin for CSP |
| `VITE_API_BASE_URL` | (same-origin) | API base URL for runtime requests (web) |
| `VITE_API_URL` | `https://api.adieuu.com` | API URL (desktop renderer) |
| `VITE_APP_ORIGIN` | `https://adieuu.com` | External link base, injected as `__APP_ORIGIN__` |
| `VITE_CHAT_WS_URL` | (derived from host) | Chat WebSocket URL |
| `VITE_DOWNLOADS_BASE_URL` | `https://downloads.adieuu.com` | Downloads CDN for release manifests |
| `VITE_MEDIA_ORIGIN` | `https://media.adieuu.com` | Media CDN for CSP |
| `VITE_E2E_MEDIA_ORIGIN` | `https://e2e-media.adieuu.com` | E2E media CDN for CSP |
| `VITE_LIVEKIT_URL` | `wss://livestream.adieuu.com` | LiveKit signaling for CSP + client |

### Desktop main-process (runtime, not VITE_ prefixed)

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADIEUU_APP_ORIGIN` | `https://app.adieuu.com` | WebAuthn bridge origin, cookie Origin rewrite |
| `ADIEUU_ALLOWED_NAVIGATION_HOSTS` | `adieuu.com,api.adieuu.com,...` | In-app navigation allowlist (comma-separated) |
| `ADIEUU_COOKIE_BRIDGE_HOSTS` | `api.adieuu.com,ws.adieuu.com,...` | Cookie bridge host allowlist (replaces defaults) |
| `ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS` | (none) | Additional hosts merged with defaults |
| `ADIEUU_UPDATE_SERVER_URL` | (from package.json) | Desktop auto-update server URL |

## Local Development

For running locally without AWS, see the main [README.md](../README.md). Local dev uses Docker Compose for Mongo, Redis, and LiveKit with `localhost` URLs — no cloud infrastructure required.

## Further Reading

- [AWS Architecture](deployment/aws.md) — full infrastructure design
- [ECS Environment](deployment/ecs-environment.md) — complete env var inventory for API and chat
- [Containers](deployment/containers.md) — Docker build details
- [GitHub Actions Deploy](deployment/github-actions-aws.md) — CI/CD with OIDC
- [Desktop Updates](deployment/desktop-updates-s3-cf.md) — S3 + CloudFront for auto-updates
