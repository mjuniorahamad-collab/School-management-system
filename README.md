# School Management System

A premium, production-oriented School Management System for a real school client
(current placeholder brand: **Bright Future International School**).
Completed: **engineering foundation** — premium admin dashboard, Express API, a real
authentication + RBAC layer (DB-backed login, opaque refresh/access cookie sessions,
roles + permissions), the first end-to-end domain module (**Students**: directory, academic placement,
guardians, CSV export), and the **Dashboard real-data milestone** (the home screen now reads
tenant-scoped, read-only aggregations under `/api/v1/dashboard`). Additional domain
modules come next, each with its own written specification.

## Stack

- Frontend: React 19 + Vite + TypeScript · Tailwind CSS 4 + shadcn/ui (Radix) ·
  React Router 7 · TanStack Query 5 · Recharts 3 · Lucide icons
- Backend: Node.js (>= 22.18) + Express 5 + TypeScript · Prisma (PostgreSQL) ·
  zod · helmet · cors
- Auth: Node built-in `crypto` (scrypt, randomBytes, sha256, timingSafeEqual) —
  no auth library
- Tooling: npm · ESLint 9 + typescript-eslint · `tsx watch` (dev) · `tsc` (build) ·
  vitest + supertest (DB-free tests)

## Structure

```
src/            Frontend
  app/          Application composition: providers, route tree
  auth/         Auth context, useAuth, can() + identity types (real RBAC UI)
  routes/       Route tree, ProtectedRoute, navigation (single source of truth)
  components/
    layout/     Shell: sidebar, header, containers
    dashboard/  Dashboard widgets
    charts/     Recharts wrappers
    dialogs/    Workflow dialogs
    ui/         shadcn/ui primitives (PROTECTED — do not hand-edit)
  pages/        Route pages (incl. LoginPage)
  data/         TEMPORARY mock data (clearly labeled, never in UI components)
  services/     Service facade — components talk to this, never to mock data
                (authService → real API · dashboardService → real API)
  hooks/        Data/composition hooks
  types/        Domain types + API envelope types (src/types/api.ts)
  lib/          Utilities (formatting, cn, apiClient.ts)
server/         Express + TypeScript + Prisma (PostgreSQL) API
  src/
    config/     Typed environment (zod)
    auth/       Password scrypt, token/cookie primitives, hasPermission
permissions/ Canonical permission catalog (120 codes, 10 roles)
    controllers/  HTTP handlers
    middleware/   requireAuth / requirePermission / error handling / 404s
    routes/       Routers mounted under /api/v1 (auth.* under /api/v1/auth)
    services/     Business logic (auth/permission/student services)
    lib/          ApiError, response envelope, logger, lazy Prisma client
    types/        API envelope types (+ Express Request augmentation)
    app.ts        createApp() factory (no listen — testable)
    server.ts     Entry point + graceful shutdown
  prisma/       schema.prisma (School, AcademicSession, User, Role, Permission,
                Session, Student, Guardian, StudentGuardian, StudentEnrollment)
                + seed.ts + migrations/
  tests/        vitest + supertest (DB-free; integration tests opt in via
                TEST_DATABASE_URL)
```

## Data architecture

```
UI components
   └─ hooks → services (authService · dashboardService → real REST API)
         └─ data layer (real DB rows via /api/v1 — the only remaining
            src/data artifact is moduleMeta.ts placeholder metadata)
```

Components never import mock data or call `fetch` directly. Module data flows
through `src/lib/apiClient.ts` → `/api/v1`. The only remaining `src/data` artifact
is `moduleMeta.ts` (placeholder-page metadata for the planned Payroll/Hostel/Backups
modules), labeled TEMPORARY MOCK and consumed only through `@/data/moduleMeta` for
placeholder pages — never wrapped in fake HTTP.

## Dashboard real-data (Insights Foundation)

The home screen is powered by real, tenant-scoped, read-only aggregations under
`/api/v1/dashboard` (guarded by `dashboard:view`): headline stats with creation-based
trends, attendance today/week/month, fee analytics + active-session fee status,
top-performing classes (ranked within one comparable finalized-exam context),
recent students, upcoming events, published notices, recent creates, and birthdays.
No schema changes were required. Spec: [`docs/dashboard-real-data.md`](docs/dashboard-real-data.md).

## Students module (implemented)

The first real domain module, used as the template for every future module:

- **Models** (`server/prisma/schema.prisma`): `Student`, `Guardian`,
  `StudentGuardian` (join with `relationshipType`, `isPrimary`,
  `isEmergencyContact`), and `StudentEnrollment` (one per student per academic
  session; placement edits move the student's current ACTIVE session record). A
  `School.admissionCounter` powers server-generated admission numbers
  (`ADM-YYYY-NNNN`).
- **API** (`/api/v1/students`): list with pagination/search/filters, create,
  update (placement + status + guardians), detail, metadata (`/meta`), CSV export
  (`/export`). No delete endpoint by design. All endpoints school-scoped and
  RBAC-guarded (`students:view/create/update/export`).
- **Frontend**: `src/pages/students/*`, wired through the service seam
  (`src/services/studentsService.ts` → real API) with TanStack Query hooks and a
  validated form (`src/components/students/StudentForm.tsx`).
- **Movies**: admission number generation, guardian primary rules, query
  validation, and CSV building are covered by unit tests; DB-backed integration
  tests run against a test database. See `server/tests/students.*`.

## Authentication & RBAC

- **Real, DB-backed.** Email/password login (scrypt-hashed), opaque access/refresh
  tokens stored hashed in the `Session` table, `sms.access`/`sms.refresh`
  httpOnly cookies with refresh rotation. No JWTs, no auth library, nothing fake.
- **Roles & permissions.** 120 permission codes across 10 roles. The super admin
  (SUPER_ADMIN) bypasses checks by role. Server enforces via route middleware;
  the frontend `can()` only hides UI.
- **Sign in** at `http://localhost:5173/login`. After `npm run db:seed`, log in
  with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from your `.env`.
- Endpoint contract under `/api/v1/auth/*`: login, refresh, logout, me.

## Environment

Copy `.env.example` to `.env` for local development. The single root `.env` serves
both sides. The API boots without a database; auth endpoints return a clean error
until `DATABASE_URL` is set.

### Local database (pick ONE)

**Option A — Docker (if available):** `docker compose up -d`, then
`DATABASE_URL="postgresql://school:school@localhost:5432/school_management"`.

**Option B — user-space PostgreSQL (no Docker, no admin):** the EDB Windows
binaries and data live under `C:\sms-pg` (outside the synced repo — see the
warning below): `npm run db:local:start`, then
`DATABASE_URL="postgresql://school@127.0.0.1:5433/school_management"`.
Stop it with `npm run db:local:stop`. Data lives in `C:\sms-pg\data`.
With the user-space database, `npm run dev` handles PostgreSQL start/stop for you.

> **Keep the PostgreSQL install off cloud-synced storage.** Never place the
> binaries or data directory under OneDrive (or any synced/network folder).
> Files On-Demand can dehydrate them mid-run and crash every backend process
> with `0xC0000142` (`STATUS_DLL_INIT_FAILED`), taking the whole cluster down.
> The local, non-synced root is `C:\sms-pg` (paths in `scripts/pg-local-paths.ts`).
> The old `.data/postgres` cluster is retained **only as a rollback copy** — do
> not run it.

After either option:
1. `npm run generate:prisma`
2. `npm run db:migrate`
3. `npm run db:seed` (needs `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`) — idempotent

## Scripts

| Command                      | Purpose                                          |
| ---------------------------- | ------------------------------------------------ |
| `npm run dev`                | **Start everything**: PostgreSQL → API → Vite   |
| `npm run dev:vite`           | Vite dev server only (proxies `/api` → :4000)    |
| `npm run dev:server`         | API dev server only (`tsx watch`)                |
| `npm run build`              | Frontend type-check + production build           |
| `npm run build:server`       | API production build (`server/dist`)             |
| `npm run start:server`       | Run the built API (`node server/dist/server.js`) |
| `npm run typecheck`          | Type-check frontend + server                     |
| `npm run lint`               | ESLint (frontend + server)                       |
| `npm test` / `npm run test:watch` | vitest (DB-free by default; DB-backed when configured) |
| `npm run generate:prisma`    | Generate Prisma Client (needed after install)    |
| `npm run db:migrate`         | Guarded deploy migration (remote needs exact CLI confirmations) |
| `npm run db:migrate:dev`     | `prisma migrate dev`, loopback/socket databases only |
| `npm run db:migrate:runtime` | Compiled guarded migration wrapper for production images |
| `npm run db:seed`            | Idempotent seed (remote needs `-- --allow-non-local`; production always refused) |
| `npm run db:local:start`     | Start user-space PostgreSQL (`C:\sms-pg`)        |
| `npm run db:local:stop`      | Stop user-space PostgreSQL                       |

### One-command development (`npm run dev`)

Run **`npm run dev` once** and the whole local stack comes up:

1. **PostgreSQL** (`C:\sms-pg`, port 5433) — started only if not already
   running; an already-running instance is detected and reused.
2. **API server** (`tsx watch`, port 4000) — skipped if port 4000 is already in
   use (i.e. a backend is already running).
3. **Vite** dev server (port 5173 or next free port) — proxies `/api` → :4000.

Open `http://localhost:5173` in the browser. On `Ctrl+C`, the orchestrator stops
Vite and the API, and also stops PostgreSQL **only if it started it** — an
instance that was already running before `npm run dev` is left untouched. Escalate
to — a fresh `npm run dev:server`, `dev:vite`, `db:local:start`, or `db:local:stop`
for the individual pieces.

Fresh clone: `npm install`, then follow the database + seed steps above. Health
checks:

- `GET http://localhost:4000/api/v1/live` — process liveness; does not query PostgreSQL.
- `GET http://localhost:4000/api/v1/ready` — database readiness; returns 503 when unavailable.
- `GET http://localhost:4000/api/v1/health` — legacy hybrid response retained for compatibility.

### Tests against a real database

`npm test` runs DB-free by default. To also run the DB-backed integration tests
(students, dashboard, auth, …), create a dedicated test database and export its URL:

```
createdb school_management_test   # your usual tooling
$env:TEST_DATABASE_URL="postgresql://.../@127.0.0.1:5433/school_management_test"; npm test
```

**This database is destroyed, not tidied.** Global setup applies migrations once
at the start of the run, then each suite calls the shared transactional reset
(`server/tests/helpers/reset-test-database.ts`), which deletes every row in every
core table — schools, users, roles, permissions, classes, students — rather than
only the rows the suite created. Treat the target as disposable and never point
it at a database you care about.

The URL must use a **direct, unpooled endpoint** because migrations run against it.
`npm test` refuses to start the integration suites unless `TEST_DATABASE_URL`
satisfies one of two contracts:

- **Loopback** target — `127.0.0.0/8`, `localhost`, `::1`, or a Unix socket —
  whose database **name contains `test`**; or
- **Remote** target, proven by exact endpoint identity rather than by name (a
  remote provider may use a database name that carries no `test` marker, e.g.
  Neon's default `neondb`). This requires all six of
  `ALLOW_REMOTE_TEST_DATABASE=1`, `EXPECTED_TEST_DATABASE_HOST`,
  `PRODUCTION_DATABASE_HOST`, `PRODUCTION_DATABASE_NAME`,
  `EXPECTED_TEST_DATABASE_NAME`, and `EXPECTED_TEST_DATABASE_USER`. The target
  host must equal `EXPECTED_TEST_DATABASE_HOST` and must differ from
  `PRODUCTION_DATABASE_HOST`, and the identity the connected database reports
  (`current_database()` and `current_user`) must match the two expected identity
  values; any missing or mismatched value — including the two hosts being
  identical — fails closed.

A mistyped value fails the run with an explanation instead of quietly deleting
data. The check lives in `server/tests/helpers/test-database-guard.ts` and runs at
vitest config load, before any worker can be given a `DATABASE_URL`. It reads
these variables from the process environment; the six non-secret identity values
are forwarded to workers so the worker-side guards see the same target. Pooled
Neon hosts are canonicalized only for comparison; they are still rejected for
test execution.

On top of that static check, global setup
(`server/tests/helpers/test-database-identity.global-setup.ts`, registered in both
`vitest.config.ts` and `vitest.timezone.config.ts`) connects with the exact
`TEST_DATABASE_URL`, verifies the direct endpoint and the server-reported
`current_database()`/`current_user` identity, then runs one
`prisma migrate deploy` for the whole run. It returns before creating a Prisma
client when `TEST_DATABASE_URL` is unset. A worker setup file
(`server/tests/helpers/verify-worker-db-url.setup.ts`) also fails the run if the
`DATABASE_URL` injected into a worker does not equal `TEST_DATABASE_URL`.

If a test database is unavailable, leave `TEST_DATABASE_URL` unset — the unit
tests still cover the rules.

### Deployment (container)

The initial production topology is **one school per self-hosted container**. The
application stays multi-tenant by design — this is a deployment shape, not an
architectural conversion.

- `Dockerfile` builds a single image that serves **both** the built frontend
  (`dist/`) and the API (`server/dist/`) from one `node:22-slim` process, running
  as a non-root user. In `NODE_ENV=production` the server serves the SPA (with a
  fallback for client-side routes) while `/api/*` keeps returning the error
  envelope for unknown routes.
- `docker-compose.prod.yml` runs `api` + `postgres` on a private network; the
  database has **no published ports**. Set `POSTGRES_PASSWORD` (required) in the
  shell/environment before `docker compose -f docker-compose.prod.yml up -d --build`.
- Deploy migrations explicitly (never on app boot):
  `docker compose -f docker-compose.prod.yml exec api node server/dist/scripts/guarded-migrate.js deploy --allow-production --confirm-host postgres --confirm-port 5432 --confirm-database school_management`.
  The compose defaults make the bundled database production-equivalent, hence
  `--allow-production`; adjust the values if `POSTGRES_DB` or
  `PRODUCTION_DATABASE_HOST` differ. If `DATABASE_URL` is pooled, inject `MIGRATION_DATABASE_URL` (direct
  endpoint for the same database) through the environment first.
- Run behind a TLS-terminating reverse proxy (nginx/caddy). Set `TRUST_PROXY=true`
  (see `.env.example`) so rate limiting sees real client IPs.
- `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` are used by `npm run bootstrap:production`
  for the first super admin. The development seed refuses `NODE_ENV=production`.
  A remote seed also requires `--allow-non-local` and valid
  `PRODUCTION_DATABASE_HOST`/`PRODUCTION_DATABASE_NAME`.
- **Backup/restore:** operational scripts and runbook live in `scripts/` and
  `docs/operations-runbook.md` (scheduled `pg_dump`, restore drill, upgrade steps).
  There is intentionally **no backup UI** — backups are infrastructure, not a
  feature.
- **Status:** the container artifacts were authored and statically reviewed on a
  machine without Docker. Validate them with `docker compose config` and a build
  on a Docker-enabled environment before going live; CI (`.github/workflows/ci.yml`)
  runs lint, typecheck, both builds, restore-script behavior tests, a DB-free
  test run, and the full DB-backed suite on every push/PR to `main`.

## Branding

School name/logo/contact are placeholders ("Bright Future International School")
and isolated so they can be replaced at delivery time without restructuring.

## Engineering rulebook

`AGENTS.md` is the binding engineering constitution for this repository
(architecture, boundaries, security, validation, definition of done). Change it
only with a concrete reason.