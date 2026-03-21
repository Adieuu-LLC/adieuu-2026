# Container images (API + chat)

Production-oriented Dockerfiles live next to each service. Builds use the **repository root** as context so pnpm workspaces and `turbo.json` resolve correctly.

## Build

From the repo root:

```bash
docker build -f apps/api/Dockerfile -t adieuu-api:local .
docker build -f apps/chat/Dockerfile -t adieuu-chat:local .
```

For AWS Fargate, build for the task CPU architecture (often `linux/amd64`):

```bash
docker build --platform linux/amd64 -f apps/api/Dockerfile -t adieuu-api:local .
docker build --platform linux/amd64 -f apps/chat/Dockerfile -t adieuu-chat:local .
```

## Runtime

| Image | Base | Process | Default port |
|-------|------|---------|----------------|
| **API** | `oven/bun:1.2-slim` | `bun run dist/index.js` (bundled output from `bun build`) | `4000` (`PORT`) |
| **Chat** | `node:25-trixie-slim` | `node dist/index.mjs` (esbuild bundle + external `node_modules`) | `9001` (`CHAT_PORT`) |

The chat image uses **Debian Trixie** (not Bookworm) because `uWebSockets.js` distributes native addons that expect a recent **glibc** (e.g. 2.38+). If you change the base image, verify the uWS binary loads at runtime.

Both images run as a non-root user (uid/gid `65532`) and expose HTTP health endpoints suitable for load balancers:

- API: `GET /api/health/live` (liveness)
- Chat: `GET /health`

Configuration is **environment variables** only (see each app’s `src/config`). Do not bake secrets into images; inject them at deploy time (ECS task definition, Secrets Manager, etc.).

## Implementation notes

- **Root `.dockerignore`** excludes `node_modules`, build artifacts, and `.env` files to keep contexts small and avoid leaking local secrets.
- **API builder** uses **Node 25** (Bookworm slim) + `npm install -g pnpm` (more reliable than `corepack` on slim/cross-arch builds) and copies the `bun` binary from `oven/bun:1.2` so `bun build` matches local behavior.
- **Chat production bundle** uses `esbuild` (`--target=node25`) with `--packages=external` so application code is one ESM file while native modules such as `uWebSockets.js` stay in `node_modules`. This avoids Node’s ESM limitation on directory imports from plain `tsc` output.
- Both Dockerfiles align with the repo’s **`engines.node >= 25`** policy for the Node-based build stages; the API **runtime** image remains Bun-only.

## Run locally (example)

With dependencies reachable from the container (adjust hostnames for Docker networking):

```bash
docker run --rm -p 4000:4000 \
  -e NODE_ENV=development \
  -e REQUIRE_DATABASE=false \
  adieuu-api:local
```

```bash
docker run --rm -p 9001:9001 \
  -e NODE_ENV=development \
  -e REQUIRE_DATABASE=false \
  adieuu-chat:local
```

For a realistic stack, attach the containers to the same Docker network as Redis and MongoDB (or use host URLs on Linux).

See also [aws.md](./aws.md) for where these images fit in ECS.
