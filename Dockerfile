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

# Prisma Client must be generated from the committed schema before the server
# is type-checked/compiled. The placeholder DATABASE_URL only satisfies schema
# env resolution at generate time (no connection is ever made); the real value
# is injected by the deployment at runtime, and this builder-stage ENV never
# reaches the runtime image.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run generate:prisma && npm run build && npm run build:server

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

# node_modules is copied wholesale from the builder: it already contains the
# Prisma-generated client (from the builder's `prisma generate` step) and
# matching engine binaries. Runtime never needs dev tooling, but re-running
# prisma generate here would require the CLI; the size trade-off is acceptable
# for a single-school self-hosted deployment.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist
# Schema + migrations and the compiled guarded migration wrapper ship with the
# image. The wrapper is the deployment entry point, never the app boot path.
COPY --from=builder /app/server/prisma ./server/prisma
# The production bootstrap/seed commands run their TypeScript entry points with
# tsx, so keep the server source next to the Prisma scripts. The compiled app
# itself still boots from server/dist.
COPY --from=builder /app/server/src ./server/src
COPY --from=builder /app/.env.example ./.env.example

USER node

EXPOSE 4000

# Migrations are an explicit deployment step, not app boot:
#   node server/dist/scripts/guarded-migrate.js deploy \
#     --confirm-host <host> --confirm-port <port> --confirm-database <db>
# (production-equivalent also requires --allow-production). The wrapper rejects
# pooled URLs unless MIGRATION_DATABASE_URL supplies the direct endpoint.
# A failed migration never half-starts a healthy-looking server.
CMD ["node", "server/dist/server.js"]
