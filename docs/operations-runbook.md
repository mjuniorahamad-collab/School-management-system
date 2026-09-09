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
| `DATABASE_URL` | `.env` or environment | Target server/database for backup and restore |
| `TRUST_PROXY` | `.env` or environment | Set `true` when the API runs behind a reverse proxy so logs/rate-limit see the real client IP |
| `AUTH_RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_WINDOW_MINUTES` | `.env` | Auth brute-force protection window |

Backup/restore scripts read `DATABASE_URL` from the environment first, then the
first non-comment `DATABASE_URL=` line in the root `.env`. Passwords are only
injected via the `PGPASSWORD` environment variable scoped to the child
`pg_dump`/`pg_restore` process and are **never printed**.

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
- **S3 provider (`STORAGE_PROVIDER=s3`):** photos live in the S3/R2 bucket.
  Enable bucket versioning or lifecycle/replication backups in the provider
  console; at minimum, treat the bucket as primary data, never ephemeral.
- Photos are sensitive personal data (student/minor images). Encrypt buckets at
  rest, keep them **private** (all reads go through the authenticated photo
  routes, never a public URL), and restrict access to the backup artifacts.
- The key prefix embeds the owning `schoolId`, so a leaked key cannot be used
  to fetch another tenant's objects; restore into the same tenant namespace.

## Database restore

**Restoring destroys the current contents** of the target database. The scripts
apply the dump with `--clean --if-exists` and refuse to run without explicit
confirmation:

```sh
# PowerShell — prompts for "YES"
./scripts/db-restore.ps1 -File backups/school-management-school-20260901-013000.dump

# PowerShell — non-interactive (CI / drills)
./scripts/db-restore.ps1 -File backups/school-management-school-20260901-013000.dump -Yes

# bash
./scripts/db-restore.sh backups/school-management-school-20260901-013000.dump
./scripts/db-restore.sh --yes backups/school-management-school-20260901-013000.dump
```

Post-restore, the API reads the database from `DATABASE_URL`; no server restart
data is cached, so the next request sees the restored data immediately (see
[Verification checks](#verification-checks) for the smoke list).

### Disaster-recovery procedure

1. **Stop writes** (scale API down, or accept a short window for small installs).
2. `./scripts/db-backup.sh` — snapshot the current state *before* any restore.
3. `./scripts/db-restore.sh --yes <selected.dump>` — restore the target dump.
4. **Apply any migrations** created since the dump:
   `npm run generate:prisma && npx prisma migrate deploy`. (The repo never runs
   migrations automatically.)
5. Re-run the verification checks below, including the auth smoke — a restored
   DB must still sign in an existing active user.
6. Write down the successful restore timestamp and dump file.

Practice at least one restore drill (including into a scratch database) so the
procedure is routine before an incident.

## Container deployment

Build and start the production stack (API + PostgreSQL):

```sh
cp .env.example .env   # set DATABASE_URL, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f api
```

The API container serves both the API (`/api/v1`) and the built frontend
(`/`), so a single published port fronts the whole app. Health checks:

```sh
curl -fsS http://localhost/api/v1/health   # liveness + DB reachability in `data.database`
```

Because the container is built from the checked-in `Dockerfile`, the only
unauthenticated API route is `/api/v1/health` — every other API route is behind
auth/RBAC. Keep `TRUST_PROXY=true` when the container sits behind any reverse
proxy; the terminal checks in this runbook assume it too.

**Migrations run as an explicit deploy step**, never on boot:

```sh
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Run `prisma migrate deploy` after deploying a release that changes the schema,
in a maintenance window, and verify with the checks below.

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

1. `curl -fsS <host>/api/v1/health` — `200`, `data.database` is `"ok"` with a
   DB reachable, or `"unreachable"` (server still answers liveness) when the DB
   is down.
2. Unknown `/api/v1/*` route — `404` with the error envelope
   `{ "success": false, "error": { "code": "NOT_FOUND", ... } }`.
3. Auth smoke — login returns `200` + `HttpOnly` session cookies (with
   `Secure` added automatically in production), `GET /api/v1/auth/me` returns
   the user with roles/permissions, `POST /api/v1/auth/logout` revokes the
   session, and `me` after logout is `401`.
4. Frontend `GET /` serves the SPA HTML (container deploy), and a deep client
   route (e.g. `/dashboard`) falls back to `index.html`.
5. `X-Request-Id` is present on every response.

## Security notes

- Dumps contain the full database (PII included). Encrypt at rest, restrict
  access, and never commit them (`.gitignore` covers `backups/` and `*.dump`).
- The scripts never print connection credentials.
- `DATABASE_URL` in `.env` is git-ignored; only `.env.example` (which carries no
  secrets) is committed.
- Rotate the DB password if a dump file or `.env` is ever exposed.

## Limitations

- Restore is full-database only (dump -> target); there is no row-level or
  directory restore. For point-in-time recovery, pair the nightly dump with the
  WAL strategy of the hosting provider.
- Dumps are not portable across PostgreSQL major versions; restore onto the
  same or a newer minor/major that pg_dump/restore of that version supports.
- The scripts need the PostgreSQL client tools — they do not use node or the
  Prisma client.