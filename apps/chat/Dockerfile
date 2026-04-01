# syntax=docker/dockerfile:1
# Build from repository root: docker build -f apps/chat/Dockerfile .
# uWebSockets.js ships native binaries; build target platform should match runtime (e.g. linux/arm64 for Fargate Graviton).

# Trixie (or newer glibc) is required: uWebSockets.js ships native binaries that need GLIBC >= 2.38 (Bookworm is too old).
FROM node:25-trixie-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# corepack is not always present on slim images or cross-platform builds.
RUN npm install -g pnpm@9.15.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages ./packages
COPY apps ./apps

ARG FONTAWESOME_TOKEN
ENV FONTAWESOME_TOKEN=${FONTAWESOME_TOKEN}

RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@adieuu/chat
RUN pnpm --filter @adieuu/chat deploy --prod /out

FROM node:25-trixie-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV CHAT_HOST=0.0.0.0

RUN groupadd --system --gid 65532 app && useradd --system --uid 65532 --gid app app

COPY --from=builder --chown=app:app /out/package.json ./
COPY --from=builder --chown=app:app /out/node_modules ./node_modules
COPY --from=builder --chown=app:app /out/dist ./dist

USER app
EXPOSE 9001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.CHAT_PORT||9001;fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.mjs"]
