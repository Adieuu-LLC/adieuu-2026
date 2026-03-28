# syntax=docker/dockerfile:1
# Build from repository root: docker build -f apps/api/Dockerfile .

FROM node:25-bookworm-slim AS builder
WORKDIR /app

COPY --from=oven/bun:1.2 /usr/local/bin/bun /usr/local/bin/bun

# corepack is not always present on slim images or cross-platform builds (e.g. linux/amd64 from ARM).
RUN npm install -g pnpm@9.15.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .npmrc ./
COPY packages ./packages
COPY apps ./apps

ARG FONTAWESOME_TOKEN
ENV FONTAWESOME_TOKEN=${FONTAWESOME_TOKEN}

# Install devDependencies (turbo, typescript, etc.); do not set NODE_ENV=production here.
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@adieuu/api

FROM oven/bun:1.2-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0

RUN groupadd --system --gid 65532 app && useradd --system --uid 65532 --gid app app

COPY --from=builder --chown=app:app /app/apps/api/dist/index.js ./dist/index.js

USER app
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "const p=process.env.PORT||4000;fetch('http://127.0.0.1:'+p+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "dist/index.js"]
