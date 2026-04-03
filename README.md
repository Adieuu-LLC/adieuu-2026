# Adieuu
[![CI](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/ci.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/ci.yml)
[![Release](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/release.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/release.yml)

Cross-platform application with web, desktop (Electron), and mobile (Capacitor) targets. 

## Table of Contents 

- [Stack](#stack)
- [Structure](#structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Scripts](#scripts)
- [Mobile Development](#mobile-development)
- [CI/CD](#cicd)
  - [Required PR checks](#required-pr-checks)
  - [Deployment](#deployment)
- [Licensing](#licensing)

## Stack

| Target | Tech |
|--------|------|
| Web | Vite + React + React Router |
| Desktop | Electron |
| Mobile | Capacitor (iOS/Android) |
| API | Bun (`Bun.serve()`) |
| Shared | TypeScript + Zod schemas |

## Structure

```
apps/
  web/        # Vite + React web app
  api/        # Bun HTTP API (tests: apps/api/README.md)
  desktop/    # Electron desktop shell
  mobile/     # Capacitor mobile config

packages/
  shared/     # Shared types, schemas, utilities
  ui/         # Shared React components
  tsconfig/   # Shared TypeScript configs
```

## Prerequisites

- Node.js 25+
- pnpm 9+
- For iOS: macOS + Xcode 15+
- For Android: Android Studio + SDK 34+

## Getting Started

```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm build --filter @adieuu/shared --filter @adieuu/ui

# Start Mongo and Redis via Docker (omit if running locally)
pnpm services:up

# Start development
pnpm dev   # Starts the web-app, API, and chat service
pnpm dev:proxy    # Starts Caddy, makes app available at https://localhost
pnpm dev:desktop # Run the desktop app
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm dev:web` | Start web app only |
| `pnpm dev:api` | Start API server only |
| `pnpm dev:desktop` | Start Electron app |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Clean all build outputs |
| `pnpm --filter @adieuu/api test` | API unit tests (main suite + isolated `*.edge.manual.ts` files; see [apps/api/README.md](apps/api/README.md)) |

## Mobile Development
Mobile apps are expected around launch, but we're deferring in favor of web/desktop for now to get core featureset moving. It's very much planned/roadmapped.

See [apps/mobile/README.md](apps/mobile/README.md) for iOS/Android setup.

## CI/CD

GitHub Actions runs lint/typecheck, API tests, and regression suites on every run. SBOM generation runs after tests; it is best-effort (does not block merges).

- **PRs** targeting `development` or `main`, or **pushes** to branches other than `main`: lint, typecheck, tests, then SBOM (no web/API/desktop artifact or package jobs).
- **PRs** targeting `main` only: also builds web/API/desktop artifacts and packages Electron before SBOM.
- **Pushes** to `main`: full CI including product builds; on success, the [Release](.github/workflows/release.yml) workflow runs (version bump, AWS deploy from `main`, GitHub Release, desktop binaries, SBOM attach). Manual AWS redeploys: [Deploy AWS](.github/workflows/deploy-aws.yml) (`workflow_dispatch`).

Key regression commands:
- `pnpm test:fs` (forward secrecy regression suite)
- `pnpm test:security` (security/privacy regression suite)

### Required PR checks

Configure branch protection so these jobs are required (adjust for `development` vs `main` if you use different rules):
- `lint-and-typecheck`
- `test-api`
- `test-fs`
- `test-security`
- For PRs into `main`, also require `build-web`, `build-api`, and `build-desktop` (artifact + package jobs).

Local pre-PR verification:
- `pnpm test:fs`
- `pnpm test:security`

### Deployment

See [docs/deployment/README.md](docs/deployment/README.md) for AWS architecture (VPC, ECS, S3/CloudFront, Atlas, WAF) and [infra/aws/README.md](infra/aws/README.md) for Terraform. Bootstrap local variables with `./scripts/deploy-wizard.sh` (never commit real secrets or `terraform.tfvars`). Wire GitHub (OIDC role, secrets, variables) using [docs/deployment/github-actions-aws.md](docs/deployment/github-actions-aws.md).

| Target | Typical hosting |
|--------|-----------------|
| **Web** | S3 + CloudFront (static Vite build) |
| **API** | ECS Fargate + ALB |
| **Chat (WebSockets)** | Separate ECS Fargate service + ALB |
| **Desktop** | GitHub Releases (Electron auto-update) |
| **Mobile** | App Store / Google Play |

## Licensing
This project is Source Available. It is licensed under the Polyform Non-Commercial License 1.0.0. Personal use and self-hosting are permitted; commercial use and redistribution are prohibited.