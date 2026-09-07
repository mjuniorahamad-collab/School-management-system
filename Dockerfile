# syntax=docker/dockerfile:1

# ────────────────────────────────────────────────────────────────────────────
# School Management System — single-container production image.
#
# Deployment topology: ONE school per self-hosted container. The same process
# serves the built frontend (dist/) and the API (server/dist/). The application
# itself remains multi-tenant by design; this image is a deployment shape, not
# an architectural conversion.
#
# NOTE: This Dockerfile was authored and statically reviewed on a machine
# without Docker. Build it on a Docker-enabled environment before trusting it
# in production (see README "Deployment (container)").
# ────────────────────────────────────────────────────────────────────────────

# Debian-slim (glibc) rather than Alpine (musl) to avoid Prisma client binary
# mismatches on Alpine.
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm run build:server

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

# node_modules is copied wholesale from the builder: it already contains the
# Prisma-generated client and matching engine binaries. Runtime never needs
# dev tooling, but re-running prisma generate here would require the CLI; the
# size trade-off is acceptable for a single-school self-hosted deployment.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
# Schema + migrations ship with the image so the deploy step can run
# `prisma migrate deploy` against the container (never on app boot).
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/.env.example ./.env.example

USER node

EXPOSE 4000

# Migrations are applied as an explicit deployment step (prisma migrate deploy),
# not on boot, so a failed migration never half-starts a healthy-looking server.
CMD ["node", "server/dist/server.js"]