# Adieuu
[![CI](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/ci.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/ci.yml)
[![Release](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/release.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-2026/actions/workflows/release.yml)
[![codecov](https://codecov.io/gh/Adieuu-LLC/adieuu-2026/graph/badge.svg?token=2MI5WRYO9K)](https://codecov.io/gh/Adieuu-LLC/adieuu-2026)
![Service Status](https://adieuu.openstatus.dev/badge/v2)

## What is Adieuu?
Adieuu is a privacy-focused social platform that aims to make online conversation more human, accountable, and transparent without compromising on individual privacy. At our foundation, and somewhat unique to Adieuu, is a cryptographic separation between user's private data (their Account) and their messages and activity (their Aliases): even in the event of a database exfil, it's difficult to trace an Alias back to its owner (and continues to grow more difficult as we further refine stored metadata).

With that foundation now established, our goal is now to combine some of the best community-focused aspect from the older (90s-2Ks) internet with some of the best from modern day. In a world of dead internet theory and bots increasingly conversing with (mostly) other bots, we have a few ideas that we think might make at least some of the internet more human again. 

### Adieuu vs Other Encrypted Apps:
Other apps encrypt your data with various levels of utility (we support full E2EE by default in Conversations and Spaces, with optional forward secrecy + PQC preparation), but in nearly all of them, a database observer can still say "This user with X email/phone send Y messages to another user." Because Adieuu separates Accounts from Aliases, this is fundamentally not possible without compromising all of our stack: an observer can know that two Aliases communicate (though even that will later be difficult), but they don't know what Accounts the Aliases are connected to.

### Age Verification
Age and ID verification on social media and messaging apps (and the internet as a whole) is a hot topic right now. Adieuu is an outlier among other options: our architecture enables us to be the first platform that can verify your age without it in any way tracing to your posts/activity (due to our cryptographic separation of Accounts and Aliases). This ensures we can be compliant with age verification initiatives globally, while still maintaining your privacy.

### Current & Planned Features
Adieuu is currently in closed beta and in active development. Check out our [live roadmap](https://app.adieuu.com/about/roadmap) to see current progress, planned features, etc. Email us at [access@adieuu.com](mailto:access@adieuu.com)

### Radical Transparency
As part of our commitment to radical transparency, we're publishing all source code; we intend to begin publicly publishing our financial data in the near future (see our live roadmap to track progress). We will happily answer any questions in the meantime - contact us in the app or via [say@adieuu.com](mailto:say@adieuu.com)


### AI and LLM Usage
Please see our Privacy Policy (and other relevant policies) for full details, but in general: we do not today offer any AI functionality within the app; we do not send any user data to any AI providers, nor to any partners that use AI in the services they provide to us. Our team does use LLMs in local development, with the stipulation that all code and other contributions must be reviewed by humans and all humans are responsible for anything submitted under their name. LLMs are just one of many tools in an engineer's toolkit, no different than an IDE or a good keyboard: it's how we use it that determines its safety and effectiveness. When used appropriately they can improve productivity: we do not use them as a replacement for quality or standards. Please reach out if you have any questions or concerns about our usage of LLMs in development: we know this is a (valid and scary) topic for some and are happy to chat about it. (By the way, all of this intro section and most of this README was hand-written by a human).


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
- [Contributing](#contributing)
- [Security](#security)
- [Licensing](#licensing)

## Stack

| Layer | Tech |
|-------|------|
| Web | Vite + React + React Router |
| Desktop | Electron |
| Mobile | Capacitor (iOS/Android) |
| API | Bun (`Bun.serve()`) + TypeScript |
| Chat (WebSocket) | Node + uWebSockets.js, Redis pub/sub |
| Database | MongoDB |
| Cache / Pub-Sub | Redis (ElastiCache in production) |
| Crypto | `@noble/*` primitives, custom `@adieuu/crypto` package |
| Auth | WebAuthn (passkeys), OTP/TOTP, session cookies |
| Calls | LiveKit (self-hosted SFU) |
| Media | S3 + CloudFront + Lambda processors |
| Billing | Stripe |
| Infrastructure | AWS (ECS Fargate, ALB, VPC, WAF, CloudFront), Terraform |
| CI/CD | GitHub Actions w/ provenance attestations, CDX SBOMs |
| Shared | TypeScript + Zod schemas, monorepo via pnpm + Turborepo |

## Structure

```
apps/
  web/        # Vite + React web app
  api/        # Bun HTTP API server
  chat/       # Node WebSocket chat service (uWebSockets.js)
  desktop/    # Electron desktop shell
  mobile/     # Capacitor mobile config

packages/
  shared/     # Shared types, schemas, utilities
  ui/         # Shared React components + icons
  crypto/     # E2EE, key management, moderation hashing
  tsconfig/   # Shared TypeScript configs

infra/
  aws/terraform/  # Full AWS infrastructure (VPC, ECS, ALB, S3, CloudFront, WAF, Lambda)
  aws/lambda/     # Media processing Lambda functions

docs/
  deployment/     # AWS architecture, ECS env, CI/CD, containers
  SELF-HOSTING.md # Getting started with self-hosting
```

## Prerequisites for Local Runs
(This is targeted at local dev runs - see [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) if you're looking for Self-Hosting setup)

- Node.js 26+
- pnpm 10+
- **Font Awesome Pro:** This project uses Font Awesome Pro icons. Internal contributors authenticate with GitHub Packages (`export NODE_AUTH_TOKEN=$(gh auth token)` with `read:packages`). External contributors and self-hosters: see [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md#font-awesome-pro-setup) for how to use pnpm overrides with your own FA Pro license.

## Super Basic - Local Dev w/ Defaults

```bash
# Install dependencies
pnpm install

# Build shared packages (or build all by omitting filters)
pnpm build --filter @adieuu/shared --filter @adieuu/ui

# Start Mongo, Redis, and LiveKit via Docker (omit if running locally)
pnpm services:up

# Start development
pnpm dev   # Starts the web-app, API, and chat service. Make sure you check the API example .env
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
| `pnpm test` | Run all test suites (optionally accepts a --force flag) |
| `pnpm --filter @adieuu/api test` | API unit tests (main suite + isolated `*.edge.manual.ts` files; see [apps/api/README.md](apps/api/README.md)) |

## Mobile Development
Mobile apps **will** arrive later, but we're deferring in favor of web/desktop for now to get core featureset moving. That said, the web app should be largely responsive (and we're consistently working on refining that). Dedicated (and ideally fully native) mobile apps are on the roadmap.

## CI/CD

GitHub Actions runs lint/typecheck, unit test suites, and regression suites on every run. SBOM generation runs (non-blocking) after tests. SBOMs are publicly available (as are the other build attestations); we also transmit our SBOMs to Manifest Cyber for vuln analysis and license compatibility: we intend to make all results from Manifest public, too, though likely behind a brief delay so we have time to address new vulns as they come up.

- **PRs** targeting `development` or `main`: lint, typecheck, tests, then SBOM. PRs into `main` also build web/API/desktop artifacts before SBOM.
- **Merge to `main`**: [Release](.github/workflows/release.yml) runs on push (version bump, selective AWS deploy, GitHub Release, desktop binaries, SBOM attach). PR CI must pass before merge (branch protection); CI does not re-run on push to `main`.
- Manual full release: Release workflow (`workflow_dispatch`). Manual AWS redeploy only: [Deploy AWS](.github/workflows/deploy-aws.yml).

Key regression commands:
- `pnpm test:fs` (forward secrecy regression suite)
- `pnpm test:security` (security/privacy regression suite)

### Required PR checks

Configure branch protection so these jobs are required (adjust for `development` vs `main` if you use different rules):
- `lint-and-typecheck`
- `test-api`
- `test-chat`
- `test-web`
- `test-desktop`
- `test-ui`
- `test-crypto`
- `test-a11y`
- `test-fs`
- `test-security`
- For PRs into `main`, also require `build-web`, `build-api`, and `build-desktop-dist`.

Local pre-PR verification:
- `pnpm test:fs`
- `pnpm test:security`

### Deployment

**Self-hosting?** See [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md) for a complete getting-started guide.

For detailed AWS architecture (VPC, ECS, S3/CloudFront, Atlas, WAF), see [docs/deployment/README.md](docs/deployment/README.md) and [infra/aws/README.md](infra/aws/README.md) for Terraform. Bootstrap local variables with `./scripts/deploy-wizard.sh` (never commit real secrets or `terraform.tfvars`). Wire GitHub (OIDC role, secrets, variables) using [docs/deployment/github-actions-aws.md](docs/deployment/github-actions-aws.md).

| Target | Typical hosting |
|--------|-----------------|
| **Web** | S3 + CloudFront (static Vite build) |
| **API** | ECS Fargate + ALB |
| **Chat (WebSockets)** | Separate ECS Fargate service + ALB |
| **Desktop** | GitHub Releases (+ auto-update in-app) |

## Contributing

We welcome bug fixes, security patches, and documentation improvements. Feature requests should be submitted via the in-app feedback tool — we prioritize work from there.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

## Security

Found a vulnerability? Please report it privately to [security@adieuu.com](mailto:security@adieuu.com). Do not open a public issue.

See [SECURITY.md](SECURITY.md) for our full disclosure policy, scope, and recognition program.

## Licensing

This project is Source Available under the [PolyForm Noncommercial License 1.0.0](LICENSE). Personal use and self-hosting are permitted; commercial use and redistribution are prohibited.