# Timetable scale testing

How to exercise the weekly timetable (Grid, List and both print layouts) against a
real-school-sized dataset (~1000 lessons) in a browser, and what the automated
coverage already proves.

## What is automated (no database needed)

`npm test` runs these DB-free, always-on suites:

- `src/lib/timetableCells.scale.test.ts` — the shared ordering/grouping primitives at
  scale: no cell drops an entry, cells stay in the canonical within-cell order, the
  flat order is deterministic regardless of input order, and a period slot missing
  from the options list still sorts deterministically.
- `src/components/timetable/TimetableGrid.scale.test.tsx` — one action pair per
  lesson and shared day+period cells still stack.
- `src/components/timetable/TimetableList.scale.test.tsx` — one row and one class
  label per lesson, identical order for identical records.
- `src/components/timetable/TimetablePrintDocument.scale.test.tsx` — both print
  layouts render every lesson exactly once and in a stable order.

The DB-backed `server/tests/timetable-scale.integration.test.ts` runs only when
`TEST_DATABASE_URL` points at a disposable database. It seeds ~1000 lessons, then
asserts completeness (the endpoint returns all of them), canonical ordering, session
scoping, tenant isolation, and that the database uniqueness constraints reject
duplicates. An optional performance mode prints timings and payload sizes; it makes
no pass/fail claim.

## Provision the manual scale database

The manual workflow needs a **separate, disposable** database named exactly
`school_management_scale_test`, listening on loopback port `5433`. The script will
**not** create it — create it once yourself, e.g. with the bundled binaries:

```powershell
& ".data\postgres\pgsql\bin\psql.exe" -h 127.0.0.1 -p 5433 -U postgres -c "CREATE DATABASE school_management_scale_test;"
```

### Configure the scale login (shell-provided only)

The seed provisions one fixture-owned `SUPER_ADMIN` login so the seeded timetable can
actually be reached in a browser. All three variables below are **shell-provided** —
the script never reads `.env`, and `TIMETABLE_SCALE_TEST_*` is intentionally distinct
from `DATABASE_URL` / `TEST_DATABASE_URL`, so the scale fixtures can never be mixed up
with the real or CI database. Set them in the PowerShell session that runs the seed:

```powershell
$env:TIMETABLE_SCALE_TEST_DATABASE_URL = "postgresql://postgres:<password>@127.0.0.1:5433/school_management_scale_test"
$env:TIMETABLE_SCALE_TEST_ADMIN_EMAIL    = "timetable.scale.admin@scale.invalid"
$env:TIMETABLE_SCALE_TEST_ADMIN_PASSWORD = "<a-strong-password-at-least-12-chars>"
```

The email must live under the reserved RFC 2606 `.invalid` TLD (it can never resolve
to a real mailbox) and the password must be at least 12 characters. The script fails
closed when either is missing or invalid, hashes the password with the real
`hashPassword()`, and never prints the email, password, hash or database credentials.

### Seed and clean up

```powershell
npm run timetable:scale:seed      # migrate + (re)seed ~1000 lessons + the login
npm run timetable:scale:cleanup   # remove only the fixture rows + login identity
```

`seed` is idempotent: it first deletes the single fixture school (identified by a
fixed marker name) and its audit rows, plus the dedicated fixture login, then
recreates the dataset. Both commands only ever touch schools carrying that marker and
the one validated fixture email; the shared `SUPER_ADMIN` role is never deleted.
There is no `TRUNCATE`, no unscoped `deleteMany`, and no database create/drop.

`cleanup` needs only `TIMETABLE_SCALE_TEST_DATABASE_URL` and
`TIMETABLE_SCALE_TEST_ADMIN_EMAIL` (not the password).

### Safety rails (fail closed)

The script refuses to run unless the connection string:

- comes from `TIMETABLE_SCALE_TEST_DATABASE_URL`;
- parses as a connection string;
- uses a loopback host on port `5433`;
- names exactly `school_management_scale_test`.

It also re-validates through the shared test-database guard with an empty
environment, so `ALLOW_REMOTE_TEST_DATABASE` cannot widen its reach. Credentials are
never printed — only a redacted URL.

## Browser check

1. **Start the API against the scale database without editing `.env`.** Override
   `DATABASE_URL` for the server process only, in the same PowerShell session:

   ```powershell
   $env:DATABASE_URL = $env:TIMETABLE_SCALE_TEST_DATABASE_URL
   npm run dev:server
   ```

   Leave `.env` untouched; this override lives only in the shell and disappears when
   the session closes. In a second terminal start the frontend as usual:
   `npm run dev:vite` (or `npm run preview` after a build).
2. **Sign in** with `TIMETABLE_SCALE_TEST_ADMIN_EMAIL` /
   `TIMETABLE_SCALE_TEST_ADMIN_PASSWORD`.
3. **Verify the fixture-school membership.** `GET /api/v1/auth/me` (or the header)
   must report the school `__TIMETABLE_SCALE_FIXTURE__` with role `SUPER_ADMIN`.
   Because the fixture login holds exactly one membership, the tenant switcher is
   hidden and the app lands directly in the fixture school.
4. Open **Timetable** and pick the seeded session (**Scale Test Session**).
5. Switch between Grid and List; confirm every lesson is present and the order is
   stable across reloads.
6. Print once in Chrome/Edge with **All classes** (detailed one-row-per-lesson
   table) and once with a single class (period × weekday grid). Confirm the header
   repeats across page breaks and rows never split mid-lesson.

JSDOM cannot verify print pagination or readability — the manual Chrome/Edge print
above is required before releasing a print change.
