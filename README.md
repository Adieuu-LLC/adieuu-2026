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

GitHub Actions runs lint/typecheck, API tests, and required regression gates before build/release paths proceed.

Key regression commands:
- `pnpm test:fs` (forward secrecy regression suite)
- `pnpm test:security` (security/privacy regression suite)

### Required PR checks

The following GitHub Actions jobs should be green before merge:
- `lint-and-typecheck`
- `test-api`
- `test-fs`
- `test-security`

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
