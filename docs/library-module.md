# Library module specification

Status: **planned → in scope (catalogue + circulation)**. Adds the first
"Services" module: a school-owned physical book catalogue, its individual
copies, and the issue/return lifecycle that borrows those copies to
students, teachers, and staff. Every record is tenant-scoped, RBAC-guarded,
audit-trailed, and additive-schema only.

## 1. Purpose

Give school staff (primarily the `LIBRARIAN` role, which currently has no real
work to do) a production library workflow:

- maintain a bibliographic catalogue of school-owned books;
- track each physical copy (server-generated copy codes) and its status;
- issue a copy to an ACTIVE student/teacher/staff member for a fixed period;
- record the return of an issued copy and make it available again;
- surface overdue loans (derived, never stored) so staff can chase them.

## 2. Guard rails

- **Tenant-scoped.** Every query and mutation is filtered by `schoolId`
  resolved server-side from `req.auth.school.id`; cross-tenant direct-ID access
  resolves to `404 NOT_FOUND` (never an ID-guess leak).
- **RBAC.** The router mounts `requireAuth`; each route then requires
  `library:view` / `library:create` / `library:update` / `library:issue` /
  `library:return` as route middleware. Permissions are never enforced
  client-side.
- **Audit.** All critical mutations (book/copy create & update, copy status
  changes, issue, return) write an `AuditLog` row inside the SAME transaction
  as the business write (`recordAudit`), so the trail is atomic with the
  mutation.
- **Additive schema only.** One migration that creates new tables/enums plus a
  nullable-default counter column. No existing rows or tables are modified, and
  completed modules (finance, audit, messaging, messaging infra, dashboard) are
  untouched.
- **No destructive delete for books.** A book is deactivated via `isActive`
  (Students-module precedent); copies keep their full history.
- **No fines / penalties, no online payments, no notifications** in this phase.
- **No mock/placeholder operational data** — the module reads and writes real
  tenant rows only.

## 3. Domain model

### LibraryBook — bibliographic record (title-level)

| Field        | Type     | Notes                                              |
| ------------ | -------- | -------------------------------------------------- |
| `schoolId`   | String   | tenant FK                                          |
| `title`      | String   | required, ≤ 300 chars                              |
| `author`     | String   | required, ≤ 200 chars                              |
| `isbn`       | String?  | optional; `@@unique([schoolId, isbn])` (NULLs distinct) |
| `publisher`  | String?  | optional                                           |
| `edition`    | String?  | optional                                           |
| `category`   | enum     | `FICTION \| NON_FICTION \| REFERENCE \| TEXTBOOK \| MAGAZINE \| JOURNAL \| OTHER` |
| `language`   | String?  | optional free text                                 |
| `description`| String?  | optional, ≤ 2000 chars                             |
| `coverUrl`   | String?  | URL reference only (photoUrl precedent — no blobs) |
| `isActive`   | Boolean  | default true; soft deactivation                    |

### LibraryCopy — a physical copy owned by the school

| Field       | Type    | Notes                                        |
| ----------- | ------- | -------------------------------------------- |
| `schoolId`  | String  | tenant FK                                    |
| `bookId`    | FK      | title record                                 |
| `copyCode`  | String  | server-generated `LIB-####`, `@@unique([schoolId, copyCode])`, from per-school `School.libraryCopyCounter` |
| `status`    | enum    | `AVAILABLE \| ISSUED \| LOST \| MAINTENANCE` |
| `note`      | String? | e.g. damage note                             |

Copy status transitions are enforced by a pure rule:

- `AVAILABLE → LOST | MAINTENANCE` (and back to `AVAILABLE`).
- An `ISSUED` copy cannot be re-stated directly — it must go through the return
  flow (issue/return is the only path that flips a copy to/from `ISSUED`).
- A copy may not be moved to `LOST`/`MAINTENANCE` while it has an active loan.

### LibraryLoan — one issue/return transaction for one physical copy

| Field          | Type    | Notes                                                        |
| -------------- | ------- | ------------------------------------------------------------ |
| `schoolId`     | String  | tenant FK                                                    |
| `copyId`       | FK      | the specific copy                                            |
| `borrowerType` | enum    | `STUDENT \| TEACHER \| STAFF` (polymorphic borrower)         |
| `borrowerId`   | String  | id of the Student/Teacher/Staff row (no FK — polymorphic)    |
| `borrowerName` | String  | snapshot at issue time (survives profile edits)              |
| `borrowerCode` | String? | snapshot admission/employee number                           |
| `issuedAt`     | Date    | `@db.Date`                                                   |
| `dueAt`        | Date    | `@db.Date`; default `issuedAt + 14 days`                     |
| `returnedAt`   | Date?   | `@db.Date`; null while on loan                               |
| `issuedBy`     | FK?     | acting user (SetNull)                                        |
| `returnedBy`   | FK?     | acting user (SetNull)                                        |
| `notes`        | String? | optional                                                     |

Loan status is **derived**, never stored (matches the Task "overdue" and
Invoice "overdue" conventions):

- `returnedAt != null` → `RETURNED`
- else `dueAt < today` → `OVERDUE`
- else → `ON_LOAN`

Business rules:

- One physical copy may have only one active loan at a time (guaranteed by the
  `AVAILABLE`-only gate and a defensive active-loan check in the issue
  transaction).
- A borrower may hold at most `MAX_ACTIVE_LOANS_PER_BORROWER = 5` active loans.
- Only ACTIVE, in-tenant students/teachers/staff may borrow.
- Returned copies become `AVAILABLE` and can be loaned again (same transaction).

## 4. Endpoints (`/api/v1/library`)

All return the standard `{ success, data }` envelope. All mount `requireAuth`.

| Method + path                | Permission        | Output                                                     |
| ---------------------------- | ----------------- | ---------------------------------------------------------- |
| `GET /books`                 | `library:view`    | paginated books with per-book available/total copy counts  |
| `POST /books`                | `library:create`  | create bibliographic record (201)                          |
| `GET /books/:id`             | `library:view`    | book detail + copy status counts                           |
| `PATCH /books/:id`           | `library:update`  | update record fields / deactivate                         |
| `GET /copies?bookId=`        | `library:view`    | copies of a book (optionally filtered by status/search)    |
| `POST /copies`               | `library:create`  | add a physical copy (server assigns `LIB-####`) (201)      |
| `PATCH /copies/:id/status`   | `library:update`  | move copy `AVAILABLE↔LOST/MAINTENANCE` (enforced rules)    |
| `GET /loans`                 | `library:view`    | paginated loans; `status=active\|overdue\|returned`, search |
| `POST /loans`                | `library:issue`   | issue a copy to a borrower (201)                           |
| `POST /loans/:id/return`     | `library:return`  | record a return                                            |
| `GET /borrowers?type=&search=`| `library:view`    | searchable ACTIVE students/teachers/staff (cap 25)        |

Query defaulting: `page` defaults to 1, `pageSize` to 20 (max 100). Unknown
filter values → `400 BAD_REQUEST` via the zod boundary. Cross-tenant IDs in path
or body → `404`/`400` as appropriate; body targets are validated against the
caller's school.

### Issue semantics

`POST /loans { copyId, borrowerType, borrowerId, issueDate?, dueDate?, notes? }`:

1. Copy must exist in the caller's school and be `AVAILABLE`.
2. Borrower must exist in the caller's school and be `ACTIVE`.
3. Borrower's active-loan count must be below the limit.
4. `issueDate` defaults to server-local today; `dueDate` defaults to
   `issueDate + 14 days`, must not precede `issueDate`.
5. One transaction: create loan (snapshot name + code), set copy → `ISSUED`,
   write an `ISSUE` audit row.

### Return semantics

`POST /loans/:id/return`:

1. Loan must exist in the caller's school and not already be returned.
2. One transaction: set `returnedAt` (server-local today) + `returnedBy`, set
   copy → `AVAILABLE`, write a `RETURN` audit row.

## 5. RBAC / permissions

New permission codes (additive; existing `library:view/create/update/delete`
already in the catalog):

- `library:issue` — create a loan.
- `library:return` — close a loan.

Role grants:

- `LIBRARIAN`: full `library:*` CRUD + `library:issue` + `library:return`.
- `SCHOOL_ADMIN` / `SUPER_ADMIN`: all `PERMISSION_CODES` (unchanged behavior).
- Everyone else (`PRINCIPAL`, `TEACHER`, `PARENT`, `STUDENT`): `library:view`
  only (unchanged — portal readiness).

Seed reconciles grants idempotently (`deleteMany + createMany` per role), so no
manual DB edits are required.

## 6. Audit integration

`AuditAction` gains `ISSUE`, `RETURN`. `AuditEntityType` gains
`LIBRARY_BOOK`, `LIBRARY_COPY`, `LIBRARY_LOAN`. Written in-transaction:

| Mutation            | Action / Entity                                |
| ------------------- | ---------------------------------------------- |
| book create/update  | `CREATE` / `UPDATE`, `LIBRARY_BOOK`            |
| copy create         | `CREATE`, `LIBRARY_COPY`                       |
| copy status change  | `STATUS_CHANGE`, `LIBRARY_COPY` (with diff)    |
| loan issue          | `ISSUE`, `LIBRARY_LOAN`                        |
| loan return         | `RETURN`, `LIBRARY_LOAN`                       |

## 7. Database / migration plan

One additive migration:

- `CREATE TYPE "LibraryCategory"`, `LibraryCopyStatus`, `LibraryBorrowerType`
- `CREATE TABLE` `LibraryBook`, `LibraryCopy`, `LibraryLoan` + indexes + FKs
- `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ISSUE' / 'RETURN'`
- `ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'LIBRARY_BOOK' /
  'LIBRARY_COPY' / 'LIBRARY_LOAN'`
- `ALTER TABLE "School" ADD COLUMN "libraryCopyCounter" INTEGER NOT NULL
  DEFAULT 1`

No existing tables touched beyond the additive School column; no data mutation;
no reset; no destructive operations.

## 8. Frontend

- `/library` page (replaces the placeholder; `moduleMeta` entry removed) with
  tabs: **Catalogue** (books + copies) and **Circulation** (loans + overdues).
- Catalogue tab: search + category filter, desktop table / mobile cards, "New
  Book", edit book, "Copies" per book (list copies, add copy, set LOST /
  MAINTENANCE / AVAILABLE).
- Circulation tab: search + status filter (all active / overdue / returned),
  summary counts, issue + return dialogs, overdue highlighted.
- `src/services/libraryService.ts`, `src/hooks/useLibrary.ts`,
  `src/lib/libraryFormRules.ts` (+ DOM-free tests), `src/types/library.ts`.
- Permission-aware UI via `can(...)`; proper loading skeletons, empty states,
  and error-to-retry states everywhere; mobile-first responsive layouts.
- Dates are native `<input type="date">` (`YYYY-MM-DD`, matching the backend
  date-only boundary so there is no timezone drift).

## 9. Tests

- **DB-free unit:** `library.rules` (due-date math, overdue derivation, copy
  status transition legality, loan-limit, counter serialization), frontend
  `libraryFormRules.test.ts`.
- **DB-backed integration** (`TEST_DATABASE_URL`, standard harness): CRUD happy
  paths, issue/return lifecycle, copy single-issue enforcement, borrower realm &
  ACTIVE enforcement, loan-limit enforcement, tenant isolation (cross-tenant
  direct-ID → 404, cross-tenant body targets → 400), RBAC (viewer denied
  issue/return; librarian allowed), audit rows recorded in-transaction, copy
  code uniqueness via the per-school counter.

## 10. Future considerations (explicitly OUT of scope now)

Fines/payments, holds/reservations, barcode/hardware integration, bulk import,
shelf/location, cover uploads, library analytics reports (Reports phase),
parent/student self-service (Portal phase), overdue notifications
(Notifications phase). Reserved permission codes are unchanged.