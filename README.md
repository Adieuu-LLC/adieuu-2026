# Adieuu
[![CI](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/ci.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/ci.yml)
[![Release](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/release.yml/badge.svg)](https://github.com/Adieuu-LLC/adieuu-26/actions/workflows/release.yml)
[![codecov](https://codecov.io/github/Adieuu-LLC/adieuu-26/graph/badge.svg?token=2MI5WRYO9K)](https://codecov.io/github/Adieuu-LLC/adieuu-26)

Cross-platform application with web, desktop (Electron), and mobile (Capacitor) targets.

## Stack

| Target | Tech |
|--------|------|
| Web | Vite + React + React Router |
| Desktop | Electron |
| Mobile | Capacitor (iOS/Android) |
| API | Fastify |
| Shared | TypeScript + Zod schemas |

## Structure

```
apps/
  web/        # Vite + React web app
  api/        # Fastify backend API
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

# Start development
pnpm dev:web    # Web app at http://localhost:3000
pnpm dev:api    # API at http://localhost:4000
pnpm dev:desktop # Electron app (loads web dev server)
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

## Mobile Development

See [apps/mobile/README.md](apps/mobile/README.md) for iOS/Android setup.

## CI/CD

GitHub Actions runs lint/typecheck, API tests, and regression suites on every run. SBOM generation runs after tests; it is best-effort (does not block merges).

- **PRs** targeting `development` or `main`, or **pushes** to branches other than `main`: lint, typecheck, tests, then SBOM (no web/API/desktop artifact or package jobs).
- **PRs** targeting `main` only: also builds web/API/desktop artifacts and packages Electron before SBOM.
- **Pushes** to `main`: full CI including product builds; on success, the [Release](.github/workflows/release.yml) workflow runs (version bump, GitHub Release, desktop binaries, SBOM attach).

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

### Deployment Targets

- **Web**: AWS S3 + CloudFront (or ECS/Fargate for SSR)
- **API**: AWS ECS/Fargate or Lambda
- **Desktop**: GitHub Releases (auto-update via Electron)
- **Mobile**: App Store Connect / Google Play Console

## Future Considerations

- [ ] Consider migrating from Electron to Tauri for smaller binaries
- [ ] Add tRPC for end-to-end type safety
- [ ] Add Prisma + PostgreSQL for database
- [ ] Add authentication (OAuth/OIDC + PKCE)
