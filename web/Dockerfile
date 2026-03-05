# The Companion — server image
# Multi-stage build: builder compiles the frontend, runtime serves it.
#
# Build:  docker build -t the-companion -f web/Dockerfile web/
# Run:    docker compose up  (see docker-compose.yml at repo root)

# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Install all deps (including devDeps needed for the build)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build the frontend
COPY . .
RUN bun run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
# node:22-slim provides Node + npm (needed for `npm install -g @anthropic-ai/claude-code`).
# Bun is copied as a single binary — no curl required.
FROM node:22-slim AS runtime

WORKDIR /app

# Copy Bun binary from the official image
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun

# Minimal system packages: git (sessions), ca-certificates (HTTPS)
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI — installs `claude` to /usr/local/bin (on PATH via fallback)
RUN npm install -g @anthropic-ai/claude-code

# Production dependencies only
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Application source and pre-built frontend
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY bin ./bin

ENV NODE_ENV=production
# Tells bin/cli.ts where to find server/ and dist/
ENV __COMPANION_PACKAGE_ROOT=/app

EXPOSE 3456

CMD ["bun", "server/index.ts"]
