# Adieuu API

HTTP API served with `Bun.serve()` (see `src/index.ts`).

## Development

From the repo root:

```bash
pnpm dev:api
```

Or from this directory:

```bash
pnpm run dev
```

## Tests

Run these from `apps/api` (or via `pnpm --filter @adieuu/api <script>` from the repo root).

| Script | What it runs |
|--------|----------------|
| `test` | `scripts/run-tests.sh`: main `bun test` suite, then every `src/**/*.edge.manual.ts` in its own process. |
| `test:coverage` | `scripts/run-tests-with-coverage.sh`: same as above with coverage; merges LCOV when `lcov` is on `PATH`. |
| `test:ci` | Coverage + JUnit report at `junit.xml` (used by GitHub Actions). |

### Normal tests

Files matching Bun’s default patterns (e.g. `*.test.ts`, `*.spec.ts`) are picked up by `bun test` with no extra configuration.

### Isolated edge tests (`*.edge.manual.ts`)

Some suites replace or wrap global modules (for example `crypto`). In Bun, `mock.module` applies for the whole process, so those tests **must not** run in the same process as the rest of the suite.

**Convention:** name files `*.edge.manual.ts` anywhere under `src/`. They are **not** included in the default `bun test` glob; `scripts/run-tests.sh` and `scripts/run-tests-with-coverage.sh` discover them with `find` and run each as:

```bash
bun test ./src/path/to/file.edge.manual.ts
```

**Adding a new edge test:** create `src/.../your-case.edge.manual.ts` and implement tests with `bun:test`. You do **not** need to edit `package.json`.

### Coverage merge

- **CI:** installs `lcov` and merges `coverage/main/lcov.info` with each edge run into `coverage/lcov.info` for Codecov.
- **Local:** install `lcov` (e.g. Fedora `dnf install lcov`, Debian/Ubuntu `apt install lcov`) so `test:coverage` performs the same merge. If `lcov` is missing, the script keeps the main-suite LCOV only and prints a warning (edge-only lines will not appear in the merged file).

### Script requirements

The runners are **bash** scripts (`scripts/run-tests.sh`, `scripts/run-tests-with-coverage.sh`). Use Linux, macOS, or Git Bash on Windows.

## IP Geolocation

The API can resolve the requesting client's jurisdiction (country + US/CA state) from their IP address using [IPLocate.io](https://www.iplocate.io/).

### Quick start

1. Obtain an IPLocate API key and set `IPLOCATE_API_KEY` in your `.env`.
2. Enable lookups: set `GEO_LOOKUP_ENABLED=true` or flip the `platform-geo-lookup-enabled` platform setting via the admin UI.
3. In production, `TRUST_PROXY_HEADERS=true` is **required** or lookups will be silently skipped. Your reverse proxy must strip/overwrite `X-Forwarded-For` and `X-Real-IP` from untrusted hops.

### Environment variables

| Variable | Default | Notes |
|---|---|---|
| `IPLOCATE_API_KEY` | _(empty)_ | Server-side only; never exposed to the client. |
| `IPLOCATE_BASE_URL` | `https://www.iplocate.io/api/lookup` | Override for testing against a stub server. |
| `IPLOCATE_TIMEOUT_MS` | `2500` | Per-request timeout. |
| `GEO_LOOKUP_ENABLED` | `false` | The platform setting takes precedence when set. |
| `GEO_CACHE_TTL_SECONDS` | `86400` | How long a positive IP lookup stays in Redis. |
| `GEO_RECHECK_INTERVAL_DAYS` | `30` | Per-user staleness window. |
| `TRUST_PROXY_HEADERS` | `false` | Must be `true` in production for reliable IP extraction. |

### Rate limits

IPLocate's free tier allows 1,000 lookups per day. With the 24-hour Redis cache and the 30-day per-user check, typical traffic stays well within that budget. If you approach the limit, either upgrade the plan or extend `GEO_RECHECK_INTERVAL_DAYS`.
