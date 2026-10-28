# Operations Runbook — School Management System

Operational procedures for the School Management System: database backup and
restore, container deployment, request tracing, and verification checks.

## Prerequisites

- PostgreSQL **client tools** (`pg_dump`, `pg_restore`) on PATH. These come with
  the PostgreSQL distribution (the same binaries used by the optional local
  workflow) — the server itself does not need them for day-to-day operation.
- API/server toolchain: Node.js >= 22.18 and `npm` (see README).
- For the container deployment: Docker with `docker compose` (v2).

Scripts are provided for both PowerShell (Windows) and bash (Linux/macOS/CI).
The two `.ps1`/`.sh` pairs have identical behavior; pick the one matching the
host.

## Configuration

| Setting | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | environment; backup also accepts root `.env` | Target server/database for backup and restore |
| `RESTORE_DATABASE_URL` | environment/secret store | Direct, unpooled URL for the SAME database when `DATABASE_URL` is pooled |
| `MIGRATION_DATABASE_URL` | environment/secret store | Direct, unpooled URL for the SAME database when guarded migrations see a pooled `DATABASE_URL` |
| `PRODUCTION_DATABASE_HOST` / `PRODUCTION_DATABASE_NAME` | environment | Production identity required before remote migrations, remote test DBs, remote seeds, or production bootstrap |
| `TRUST_PROXY` | `.env` or environment | Set `true` when the API runs behind a reverse proxy so logs/rate-limit see the real client IP |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MINUTES` | `.env` | Auth brute-force protection window |

The restore scripts read **only the environment** — there is no `.env` fallback,
and they never accept a connection string on the command line. Backups still
support the root `.env` fallback. Passwords are injected only via `PGPASSWORD`
scoped to the child `pg_dump`/`pg_restore` process and are **never printed**.
Restore requires the exact target identity (`-ConfirmHost`/`--confirm-host`,
port and database) plus `-Yes`/`--yes` for a non-interactive destructive run;
`-ValidateOnly`/`--validate-only` checks everything and exits before touching
the database. Pooled app URLs must be paired with a direct
`RESTORE_DATABASE_URL` that canonicalizes to the same host, port and database.

## Database backups

Create a custom-format dump in `backups/`, keeping the 14 most recent:

```sh
# PowerShell
./scripts/db-backup.ps1

# bash
./scripts/db-backup.sh
```

Customize directory and retention count:

```sh
./scripts/db-backup.ps1 -OutDir "D:\ops\db-backups" -Retain 30
./scripts/db-backup.sh /srv/backups 30          # positional: OUT_DIR RETAIN
```

Output has no owner/privilege metadata and is named
`school-management-<database>-<YYYYMMDD-HHMMSS>.dump`. Old files matching the
prefix beyond the retention count are pruned automatically. Exit code is
non-zero on any failure (connection, pg_dump error), and a failed dump is
removed rather than left half-written.

Schedule nightly backups with the host scheduler (adjust retention to match):

```sh
# cron (nightly 01:30)
30 1 * * * cd /opt/school-management && ./scripts/db-backup.sh >> backups/backup.log 2>&1
```

```powershell
# Task Scheduler (PowerShell 5.1+); register a scheduled task that runs:
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\repo\scripts\db-backup.ps1"
```

Backup files are sensitive (full student/staff/financial data). Store them
encrypted at rest, restrict access, and treat them like production secrets.
The `backups/` directory is git-ignored; never commit `.dump` files.

## Profile-photo object storage

Profile photos are **not** in PostgreSQL — the DB stores only the object key
in each entity's `photoUrl` column (e.g. `photos/<schoolId>/students/<uuid>.jpg`).

- **Local provider (`STORAGE_PROVIDER=local`):** photos live in the persistent
  `server/uploads/` directory (git-ignored, configurable via
  `STORAGE_LOCAL_DIR`). Back it up alongside the database with the same
  schedule/rotation, and restore it with the DB so keys never dangle.
- **Supabase native Storage (`STORAGE_PROVIDER=supabase`):** photos live in the
  Supabase Storage bucket named by `SUPABASE_BUCKET` under the tenant-scoped
  key prefixes. Store the bucket as primary data: enable object versioning or a
  lifecycle/replication backup in the Supabase console, never treat it as
  ephemeral. The server-side `SUPABASE_SERVICE_ROLE_KEY` must stay server-only.
- Photos are sensitive personal data (student/minor images). Keep the bucket
  **private** (all reads go through the authenticated photo routes, never a
  public URL), and restrict access to the backup artifacts.
- The key prefix embeds the owning `schoolId`, so a leaked key cannot be used
  to fetch another tenant's objects; restore into the same tenant namespace.

## Database restore

**Restoring destroys the current contents** of the target database. The scripts
apply the dump with `--clean --if-exists --single-transaction` and refuse to run
without exact identity confirmations:

```sh
# PowerShell — validate only (no database writes), then prompt for "YES"
./scripts/db-restore.ps1 -File backups/school-management-school-20260901-013000.dump `
  -ConfirmHost <host> -ConfirmPort <port> -ConfirmDatabase <db> -ValidateOnly

./scripts/db-restore.ps1 -File backups/school-management-school-20260901-013000.dump `
  -ConfirmHost <host> -ConfirmPort <port> -ConfirmDatabase <db>

# PowerShell — non-interactive (CI / drills)
./scripts/db-restore.ps1 -File backups/school-management-school-20260901-013000.dump `
  -ConfirmHost <host> -ConfirmPort <port> -ConfirmDatabase <db> -Yes

# bash
./scripts/db-restore.sh <backup.dump> \
  --confirm-host <host> --confirm-port <port> --confirm-database <db> --validate-only

./scripts/db-restore.sh <backup.dump> \
  --confirm-host <host> --confirm-port <port> --confirm-database <db> --yes
```

Host confirmation uses the canonical, unpooled host. Passwords are read from the
environment and never from the command line. Post-restore, the API reads the
database from `DATABASE_URL`; no server restart is required.

### Disaster-recovery procedure

1. **Stop writes** (scale API down, or accept a short window for small installs).
2. `./scripts/db-backup.sh` — snapshot the current state *before* any restore.
3. Restore the selected dump with the exact identity confirmations above.
4. **Apply any migrations** created since the dump with the guarded deploy
   wrapper (production-equivalent needs `--allow-production`):
   `npm run db:migrate -- --confirm-host <host> --confirm-port <port> --confirm-database <db>`.
   The repo never runs migrations automatically.
5. Re-run the verification checks below, including the auth smoke — a restored
   DB must still sign in an existing active user.
6. Write down the successful restore timestamp and dump file.

Practice at least one restore drill (including into a scratch database) so the
procedure is routine before an incident.

## Container deployment

Build and start the production stack (API + PostgreSQL):

```sh
cp .env.example .env   # set POSTGRES_PASSWORD and CORS_ORIGIN
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api
```

Compose constructs the API container's `DATABASE_URL` from the `POSTGRES_*`
values; the `DATABASE_URL` in the root `.env` is for host-run commands only.

The API container serves both the API (`/api/v1`) and the built frontend
(`/`), so a single published port fronts the whole app. Health checks:

```sh
curl -fsS http://localhost/api/v1/live   # process liveness; does not query PostgreSQL
curl -i    http://localhost/api/v1/ready  # 200 when ready, 503 when the DB is unavailable
```

`/api/v1/ready` is the intended Render HTTP health-check endpoint. It uses a
bounded, single-flight `SELECT 1` probe, so repeated concurrent health checks do
not create overlapping database probes. `/api/v1/health` remains available for
backward compatibility and retains its legacy hybrid response.

Health probes are unauthenticated and do not require a school/tenant header.
Authentication and RBAC still protect application data routes; `/auth/login`
and `/auth/refresh` are intentionally public. Keep `TRUST_PROXY=true` when the
container sits behind any reverse proxy; the terminal checks in this runbook
assume it too.

**Migrations run as an explicit deploy step**, never on boot:

```sh
docker compose -f docker-compose.prod.yml exec api \
  node server/dist/scripts/guarded-migrate.js deploy \
  --allow-production \
  --confirm-host postgres --confirm-port 5432 --confirm-database school_management
```

The compose defaults make the bundled `postgres` service production-equivalent,
hence `--allow-production`; adjust the values if `POSTGRES_DB` or
`PRODUCTION_DATABASE_HOST` differ. If `DATABASE_URL` is pooled, inject
`MIGRATION_DATABASE_URL` (direct endpoint for the same database) through the
environment before running the command. `db:migrate:dev` is loopback/socket-only
and must never be used for deployment. Run the guarded deploy after a release
that changes the schema, in a maintenance window, and verify with the checks
below.

## Production bootstrap

After the first migration is applied to a **blank** production database, run
the bootstrap script to create the structural/master records: school, current
academic session, the full permission catalog (120 codes), 10 roles with their
grants, and the initial super admin identity.

The script requires `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the
environment of the one-off command (same as local development). They are not
part of the long-running API container environment. It is safe to run multiple
times: structural rows are upserted idempotently; if the admin email already
exists the script **aborts** (never overwrites a password hash).

```sh
# Read-only preflight — reports what would be created/reconciled
npm run bootstrap:production -- --check

# Transactional write — idempotent, safe to re-run; exact identity confirmations
npm run bootstrap:production -- \
  --confirm-host <host> --confirm-port <port> --confirm-database <db>

# Read-only post-run report — confirms everything is in place
npm run bootstrap:production -- --verify
```

The script is in `server/prisma/bootstrap-production.ts` and runs via `tsx`. It
must be executed **after** the guarded migration deploy so the schema tables
exist. A non-interactive write always requires all three confirmations; a remote
target also requires valid `PRODUCTION_DATABASE_HOST`/`PRODUCTION_DATABASE_NAME`.
In a container workflow:

```sh
docker compose -f docker-compose.prod.yml exec api \
  node server/dist/scripts/guarded-migrate.js deploy \
  --allow-production \
  --confirm-host postgres --confirm-port 5432 --confirm-database school_management

# Export the admin credentials in the invoking shell only (do not add them to
# the API service). `-e NAME` forwards the value without putting it on the
# command line or in the Compose file.
set +x
export SEED_ADMIN_EMAIL="<admin email>"
read -rsp "SEED_ADMIN_PASSWORD: " SEED_ADMIN_PASSWORD && export SEED_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml run --rm \
  -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD \
  api npm run bootstrap:production -- \
  --confirm-host postgres --confirm-port 5432 --confirm-database school_management
unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
```

On PowerShell, use `$env:SEED_ADMIN_EMAIL` and `$env:SEED_ADMIN_PASSWORD`
instead of `export`, then run the same `docker compose ... run` command with
`-e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD`. The API service itself has no
bootstrap credentials, so `docker compose exec api` is not the right command.

## Request tracing and operational logging

Every HTTP request produces one structured log line (JSON) on
`console.info`, emitted when the response finishes:

```json
{"level":"info","ts":"2026-09-07T02:40:00.750Z","component":"api","method":"POST","url":"/api/v1/auth/login","status":200,"durationMs":12.3,"requestId":"a1b2c3d4e5f6a7b8","userId":"17d065bc-..."}
```

- `requestId` — a server-generated `X-Request-Id` (16-hex). A client-supplied
  `X-Request-Id` is forwarded only when it matches a safe opaque pattern; errors
  and slow requests can be correlated end-to-end by this value, which is echoed
  on every response in the same header.
- `userId` — the authenticated user id when the request carried a valid session
  (absent for anonymous requests like login/refresh/health).
- `status` / `durationMs` — outcome and latency; pairs with the central error
  handler (which logs full server-side detail for failures without leaking it
  to the client).

Example greps:

```sh
# all requests for one trace
grep -F '"requestId":"a1b2c3d4e5f6a7b8"' /var/log/api.log
# slow requests
grep -F '"component":"api"' /var/log/api.log | awk -F'"durationMs":' '{ if ($2+0 > 1000) print }'
```

## Verification checks

After a deploy, restore, config change, or container rebuild:

1. `curl -fsS <host>/api/v1/live` — `200` while the process can serve requests.
2. `curl -i <host>/api/v1/ready` — `200` when PostgreSQL is reachable, or `503`
   with `{ "success": false, "error": { "code": "SERVICE_UNAVAILABLE", ... } }`
   when the bounded database probe fails.
3. `curl -fsS <host>/api/v1/health` — `200` for the retained legacy response;
   `data.database` is `"ok"` or `"unreachable"` as before.
4. Unknown `/api/v1/*` route — `404` with the error envelope
   `{ "success": false, "error": { "code": "NOT_FOUND", ... } }`.
5. Auth smoke — login returns `200` + `HttpOnly` session cookies (with
   `Secure` added automatically in production), `GET /api/v1/auth/me` returns
   the user with roles/permissions, `POST /api/v1/auth/logout` revokes the
   session, and `me` after logout is `401`.
6. Frontend `GET /` serves the SPA HTML (container deploy), and a deep client
   route (e.g. `/dashboard`) falls back to `index.html`.
7. `X-Request-Id` is present on every response.

## Security notes

- Dumps contain the full database (PII included). Encrypt at rest, restrict
  access, and never commit them (`.gitignore` covers `backups/` and `*.dump`).
- The scripts never print connection credentials. Guarded migrations and restore
  scripts reject pooled URLs unless the direct counterpart is supplied through
  the environment.
- `DATABASE_URL` in `.env` is git-ignored; only `.env.example` (which carries no
  secrets) is committed. Restore scripts intentionally ignore `.env`.
- Rotate the DB password if a dump file or `.env` is ever exposed.

## Limitations

- Restore is full-database only (dump -> target); there is no row-level or
  directory restore. For point-in-time recovery, pair the nightly dump with the
  WAL strategy of the hosting provider.
- Dumps are not portable across PostgreSQL major versions; restore onto the
  same or a newer minor/major that pg_dump/restore of that version supports.
- The scripts need the PostgreSQL client tools — they do not use node or the
  Prisma client.

## Permission reconciliation workflow

Use `bootstrap:production` to reconcile the permission catalog, role grants,
and structural records without reseeding business data.

### Safe workflow (production)
1. **Preflight (read-only):**
   ```sh
   npm run bootstrap:production -- --check
   ```
   Review the output for missing roles/permissions/grants or an existing admin
   email. If the admin already exists, the script will abort on write (by design).

2. **Apply reconciliation (transactional, idempotent):**
   ```sh
   npm run bootstrap:production -- \
     --confirm-host <host> --confirm-port <port> --confirm-database <db>
   ```
   - Upserts the permission catalog from `server/src/permissions/permissions.ts`
     (adds/removes grants via reconciliation; structural rows only).
   - Never overwrites an existing admin password/hash or promotes existing users.
   - If `SEED_ADMIN_EMAIL` already exists, the script aborts with no changes.

3. **Verify (read-only):**
   ```sh
   npm run bootstrap:production -- --verify
   ```
   Confirm counts match: all 120 permissions, 10 roles, expected grants, and
   an ACTIVE SUPER_ADMIN with membership.

### Notes
- **Do not run `npm run db:seed` against an existing production database.** `db:seed`
  is for local/dev bootstrap only. Use `bootstrap:production` for production reconciliation.
- Always run after the guarded migration deploy.
- The reconciliation compares against the code catalog — if permissions changed in
  code, run the workflow above to bring the database in sync.

## Permissions reconciliation

Reconcile the production permission catalogue additively (insert missing permissions and grants only). This targets the production database and is fail-closed.

Read-only check:

`sh
npm run permissions:reconcile -- --check
`

Apply (additive):

`sh
npm run permissions:reconcile -- --apply
`

### Docker / Compose invocation (when env comes from the container)

If the runtime injects DATABASE_URL via the container environment (e.g. docker compose run/exec), the guard requires explicit target confirmation to avoid treating container-provided env as an unintended shell override. Pass the exact production target identity:

`sh
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL -e PRODUCTION_DATABASE_HOST -e PRODUCTION_DATABASE_NAME \
  api npm run permissions:reconcile -- --apply \
  --confirm-host <host> --confirm-port 5432 --confirm-database <db>
`

Or with exec against a running api container (ensure the env vars are present in that environment):

`sh
docker compose -f docker-compose.prod.yml exec api \
  npm run permissions:reconcile -- --check \
  --confirm-host <host> --confirm-port 5432 --confirm-database <db>
`

Notes:
- DATABASE_URL must be the direct (unpooled), sslmode=require and channel_binding=require production endpoint on port 5432.
- PRODUCTION_DATABASE_HOST and PRODUCTION_DATABASE_NAME must match the target.
- Confirmations must match exactly or the command fails before connecting.
- --check is read-only (exit non-zero if differences/blockers); --apply only inserts missing permissions/grants additively.