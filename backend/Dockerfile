# =============================================================================
# Production Dockerfile for the Faculty Management backend.
# - Multi-stage: build with dev deps, ship only prod deps + dist.
# - Runs as the unprivileged `node` user.
# =============================================================================

# ---- Stage 1: build --------------------------------------------------------
FROM node:20-bullseye-slim AS builder

WORKDIR /app/backend

# Install ALL deps (including dev) so tsc + tsx are available
COPY backend/package*.json ./
RUN npm install --include=dev

# Copy sources and tsconfig
COPY backend/tsconfig*.json ./
COPY backend/src ./src

RUN npm run build

# ---- Stage 2: runtime -----------------------------------------------------
FROM node:20-bullseye-slim

# Production-only system packages: tini for proper signal handling, wget
# for the healthcheck, and ca-certificates for outbound TLS (SMTP, etc.)
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=5000

# Copy package.json + lockfile and install only prod deps
COPY backend/package*.json ./
RUN npm install --omit=dev \
    && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/backend/dist ./dist

# Ensure the `node` user owns everything we ship, including the runtime
# directories we'll write to. The image already contains a `node` user.
RUN mkdir -p /app/backend/uploads /app/backend/logs \
    && chown -R node:node /app/backend

# The `node` user (UID 1000) is created by the official node image.
USER node

EXPOSE 5000

# Use tini as PID 1 so SIGTERM is delivered to node and graceful shutdown
# can run.
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "dist/server.js"]

# Healthcheck: hits our /health endpoint. The endpoint pings the DB.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -q -O- http://localhost:5000/health || exit 1
