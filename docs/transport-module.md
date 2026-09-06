# Transport module specification

Status: **in scope (vehicles, routes & stops, drivers, student assignments)**.
Adds the second "Services" module: a school transport management workflow for
school-owned vehicles, fixed bus routes with ordered stops, transport staff
linked to existing `Staff`/`User` records, and per-session student route/stop
assignments with capacity enforcement. Every record is tenant-scoped,
RBAC-guarded, audit-trailed, and additive-schema only.

## 1. Purpose

Give the `TRANSPORT_MANAGER` role (which currently has no real work to do) a
production transport workflow:

- maintain a register of school-owned transport vehicles (type, registration,
  capacity, active/inactive);
- define bus routes, each optionally tied to one active vehicle, with an
  ordered list of pickup/drop-off stops;
- register transport staff (drivers/attendants) by linking existing ACTIVE
  `Staff` records (plus an optional login `User` link) — no new people model;
- assign each student (per academic session and direction) to a route + stop,
  preserving historical assignment rows rather than overwriting them;
- enforce vehicle capacity hard limits and inactive-entity restrictions;
- surface the operational state of routes and assignments via lists, filters,
  and search.

## 2. Product boundary

This is a **school transport management** module, not a fleet-management ERP.
Explicitly OUT of scope in this phase: GPS/live tracking, route optimization
and geocoding, fuel management, maintenance/service-record ERP, ticketing or
passes/QR, online/automatic transport payments (Fee integration deferred), and
driver HR/leave/payroll (belongs to Staff/Payroll). Future extension points are
listed in section 12.

## 3. Guard rails

- **Tenant-scoped.** Every query and mutation is filtered by `schoolId`
  resolved server-side from `req.auth.school.id`; cross-tenant direct-ID access
  resolves to `404 NOT_FOUND` (never an ID-guess leak); cross-tenant body
  references resolve to `400 BAD_REQUEST`.
- **RBAC.** The router mounts `requireAuth`; each route then requires
  `transport:view` / `transport:create` / `transport:update` as route
  middleware. `transport:delete` remains in the permission catalog but is
  intentionally NOT wired to any destructive endpoint (status-lifecycle
  precedent from Students/Books). Permissions are never enforced client-side.
- **Audit.** All critical mutations write an `AuditLog` row inside the SAME
  transaction as the business write (`recordAudit`), so the trail is atomic
  with the mutation.
- **Additive schema only.** One migration creates new tables/enums plus a
  nullable-safe per-school counter column. No existing rows or tables are
  modified; completed modules (finance, audit, messaging, dashboard, library)
  are untouched apart from additive enum/back-relation fields that have no data
  impact.
- **No destructive delete.** Vehicles, routes, stops, drivers and assignments
  are deactivated via status/isActive; all rows are preserved for history.
- **No mock/placeholder operational data** — the module reads and writes real
  tenant rows only.

## 4. Domain model

### TransportVehicle — a school-owned transport unit (bus/van/car)

| Field                | Type      | Notes                                               |
| -------------------- | --------- | --------------------------------------------------- |
| `schoolId`           | String    | tenant FK                                           |
| `registrationNumber` | String    | required; `@@unique([schoolId, registrationNumber])`|
| `vehicleCode`        | String    | server-generated `VEH-####` from `School.transportVehicleCounter` |
| `type`               | enum      | `BUS \| VAN \| MINI_BUS \| CAR \| OTHER`            |
| `make` / `model`     | String?   | optional                                            |
| `year`               | Int?      | optional manufacture year                           |
| `capacity`           | Int       | required ≥ 1 (via zod); hard seat ceiling           |
| `isActive`           | Boolean   | default true; soft deactivation                     |
| `notes`              | String?   | optional                                            |

Rules:

- Capacity is a hard ceiling (decision 1). Lowering `capacity` below the number
  of ACTIVE assignments on the vehicle's route is rejected.
- An INACTIVE vehicle cannot be assigned to a route and cannot move assignments;
  routes already referencing it keep their historical rows (their assignments
  cannot be *added* while inactive).

### TransportRoute — a fixed route, optionally tied to one vehicle

| Field         | Type      | Notes                                              |
| ------------- | --------- | -------------------------------------------------- |
| `schoolId`    | String    | tenant FK                                          |
| `name`        | String    | required; `@@unique([schoolId, name])`             |
| `code`        | String?   | optional free label                                |
| `vehicleId`   | String?   | FK (SetNull); `@@unique([schoolId, vehicleId])` — one vehicle on one route per school |
| `description` | String?   | optional                                           |
| `isActive`    | Boolean   | default true; soft deactivation                    |

Rules:

- One ACTIVE-but-legacy-safe vehicle coupling: a vehicle belongs to at most one
  route per school (unique on `[schoolId, vehicleId]`). Swapping a vehicle to a
  different route clears the previous route's `vehicleId` in the same
  transaction so unique integrity is preserved. Historical rows are untouched.
- An assignment can only be created against a route that currently has an
  ACTIVE vehicle (so capacity enforcement is always meaningful).
- An INACTIVE route cannot receive new assignments or new drivers.

### TransportStop — an ordered pickup/drop-off point on a route

| Field       | Type     | Notes                                              |
| ----------- | -------- | -------------------------------------------------- |
| `schoolId`  | String   | tenant FK                                          |
| `routeId`   | FK       | Cascade; belongs to one route                      |
| `name`      | String   | required; `@@unique([routeId, name])`              |
| `sortOrder` | Int      | ordering within the route (not unique — reordering renumbers safely) |
| `isActive`  | Boolean  | default true; soft deactivation                    |

Rules:

- A stop must belong to the route it is assigned with; a `BOTH`-assigned
  student uses a single stop for both directions.
- Reordering renumbers `sortOrder` in one transaction (0-based, then by name).

### TransportDriver — a link record for transport staff (reuses Staff/User)

| Field       | Type     | Notes                                              |
| ----------- | -------- | -------------------------------------------------- |
| `schoolId`  | String   | tenant FK                                          |
| `routeId`   | FK?      | optional assigned route (SetNull)                  |
| `staffId`   | FK       | required link to an existing ACTIVE `Staff` record; `@@unique([schoolId, staffId])` |
| `userId`    | FK?      | optional link to a login `User` account (SetNull)  |
| `roleLabel` | String   | e.g. "Driver" / "Attendant"; default "Driver"      |
| `isActive`  | Boolean  | default true; soft deactivation                    |
| `createdAt` / `updatedAt` | DateTime |                           |

Rules:

- The person's identity always resolves from the linked `Staff` record (joined
  first/middle/last + employee id); no separate people data is stored (decision
  5). The `User` link is optional and only for future auth/portal use.
- One transport record per staff member per school (unique), so repeated
  picker selections update rather than duplicate.

### TransportAssignment — one student's route/stop membership for a session

| Field                | Type                          | Notes |
| -------------------- | ----------------------------- | ----- |
| `schoolId`           | String                        | tenant FK |
| `studentId`          | FK→Student (Cascade)          |       |
| `academicSessionId`  | FK→AcademicSession (Restrict) | assignments are session-scoped |
| `routeId`            | FK→TransportRoute (Restrict)  | protected so history survives |
| `stopId`             | FK→TransportStop (Restrict)   | protected so history survives |
| `direction`          | enum                          | `TO_SCHOOL \| FROM_SCHOOL \| BOTH` |
| `status`             | enum                          | `ACTIVE \| INACTIVE` (default ACTIVE) |
| `assignedAt`         | DateTime (default now)        |       |
| `deactivatedAt`      | DateTime?                     | set when the assignment is closed/changed |
| `notes`              | String?                       | optional |
| `createdAt` / `updatedAt` | DateTime                |       |

Business rules (decisions 3 & 4):

- **One ACTIVE assignment per (student, academicSession, direction).** The
  constraint is enforced in the service (inside the write transaction) rather
  than as a DB unique, because history preservation requires allowing multiple
  historical rows for the same triple over time. An efficient index
  `[studentId, academicSessionId, direction, status]` supports the lookup.
- **Change, never overwrite.** A new assignment for an existing ACTIVE slot
  deactivates the current row (`status=INACTIVE`, `deactivatedAt=now`) and
  creates a fresh ACTIVE row in the same transaction.
- **Fresh assignment for a new session.** Assignments never auto-carry across
  sessions; a new academic session starts with no assignments until one is
  created against it.
- **Capacity.** Creating or re-activating an assignment counts ACTIVE
  assignments on the route for the session; if `count >= vehicle.capacity` the
  assignment is hard-rejected (400).
- **Validity gates.** Student must exist and be `ACTIVE` in-tenant; session must
  be in-tenant and not `CLOSED`; route and stop must be in-tenant, ACTIVE, and
  the stop must belong to the route; the vehicle must be ACTIVE; `direction`
  must be one of the three values. `BOTH` counts as a single seat.
- **Stop deactivation.** Deactivating a stop does not delete existing
  assignments; it only blocks *new* assignments to that stop.

### Enums

`TransportVehicleType` (`BUS`, `VAN`, `MINI_BUS`, `CAR`, `OTHER`),
`TransportDirection` (`TO_SCHOOL`, `FROM_SCHOOL`, `BOTH`),
`TransportAssignmentStatus` (`ACTIVE`, `INACTIVE`).

## 5. Endpoints (`/api/v1/transport`)

All return the standard `{ success, data }` envelope. All mount `requireAuth`.

| Method + path                         | Permission          | Output |
| ------------------------------------- | ------------------- | ------ |
| `GET /vehicles`                       | `transport:view`    | paginated vehicles; search/filter by type/isActive |
| `POST /vehicles`                      | `transport:create`  | create vehicle (server assigns `VEH-####`) (201) |
| `GET /vehicles/:id`                   | `transport:view`    | vehicle detail + route + active assignment count |
| `PATCH /vehicles/:id`                 | `transport:update`  | update / deactivate (capacity floor enforced) |
| `GET /routes`                         | `transport:view`    | paginated routes + vehicle + stop count + assigned-seats total |
| `POST /routes`                        | `transport:create`  | create route (optionally link vehicle) (201) |
| `GET /routes/:id`                     | `transport:view`    | route detail + ordered stops + vehicle |
| `PATCH /routes/:id`                   | `transport:update`  | update / deactivate / swap vehicle (transactional clear) |
| `POST /routes/:id/stops`              | `transport:create`  | add a stop (appended) (201) |
| `PATCH /routes/:id/stops/:stopId`     | `transport:update`  | rename / reorder / deactivate stop |
| `GET /stops`                          | `transport:view`    | list stops (filter by routeId) |
| `GET /drivers`                        | `transport:view`    | paginated drivers (search, route/status filters) |
| `POST /drivers`                       | `transport:create`  | link staff as a driver (201) |
| `PATCH /drivers/:id`                  | `transport:update`  | update / deactivate / reassign route |
| `GET /assignments`                    | `transport:view`    | paginated assignments; filter by route/student/session/direction/status |
| `POST /assignments`                   | `transport:create`  | assign/change a student's route+stop (change deactivates prior) (201) |
| `PATCH /assignments/:id`              | `transport:update`  | deactivate / re-activate / edit an assignment (capacity rechecked) |
| `GET /assignments/context`            | `transport:view`    | meta: sessions, routes, and eligible ACTIVE students for the assign UI |

`transport:delete` is **not** wired. Query defaulting: `page` default 1,
`pageSize` default 20 (max 100). Unknown filter values → `400 BAD_REQUEST` via
the zod boundary.

### Assignment semantics (`POST /assignments`)

`{ studentId, academicSessionId, routeId, stopId, direction, notes? }`:

1. Student exists in tenant and is `ACTIVE`.
2. Session exists in tenant and is not `CLOSED`.
3. Route exists in tenant, is `ACTIVE`, and has an ACTIVE vehicle.
4. Stop exists in tenant, is `ACTIVE`, and belongs to the route.
5. Any existing ACTIVE assignment for `(student, session, direction)` is
   deactivated (history preserved).
6. Route active-assignment count for the session is below vehicle capacity.
7. One transaction: deactivate prior row (if any), create the new ACTIVE row,
   write an `ASSIGN` audit row (with a before/after diff when a change).

## 6. RBAC / permissions

No new permission codes. Existing `transport:view/create/update/delete`
(already catalogued) are reused. `transport:delete` stays reserved (never
wired). Grants already in the catalog:

- `TRANSPORT_MANAGER`: full `transport:*` CRUD + `dashboard:view`,
  `students:view`, `messages:view` (unchanged).
- `SCHOOL_ADMIN` / `SUPER_ADMIN`: all `PERMISSION_CODES` (unchanged behavior).
- `PRINCIPAL`: `transport:view` only (unchanged — read-only portal readiness).
- Everyone else: no transport access (unchanged).

Driver linking reuses the `staff:view` permission at the API boundary for the
staff picker (a TransportManager may be granted `staff:view` by an admin; the
transport driver endpoint itself is guarded by `transport:*`).

## 7. Audit integration

`AuditAction` gains `ASSIGN`. `AuditEntityType` gains `TRANSPORT_VEHICLE`,
`TRANSPORT_ROUTE`, `TRANSPORT_STOP`, `TRANSPORT_DRIVER`, `TRANSPORT_ASSIGNMENT`.
Written in-transaction:

| Mutation                    | Action / Entity                 |
| --------------------------- | ------------------------------- |
| vehicle create/update       | `CREATE`/`UPDATE`, `TRANSPORT_VEHICLE` |
| vehicle deactivate          | `STATUS_CHANGE`, `TRANSPORT_VEHICLE` |
| route create/update         | `CREATE`/`UPDATE`, `TRANSPORT_ROUTE` |
| route deactivate            | `STATUS_CHANGE`, `TRANSPORT_ROUTE` |
| stop create/update/reorder  | `CREATE`/`UPDATE`, `TRANSPORT_STOP` |
| stop deactivate             | `STATUS_CHANGE`, `TRANSPORT_STOP` |
| driver link/create/update   | `CREATE`/`UPDATE`, `TRANSPORT_DRIVER` |
| driver deactivate           | `STATUS_CHANGE`, `TRANSPORT_DRIVER` |
| assignment create/change    | `ASSIGN`, `TRANSPORT_ASSIGNMENT` (with diff) |
| assignment deactivate       | `STATUS_CHANGE`, `TRANSPORT_ASSIGNMENT` |

## 8. Database / migration plan

One additive migration:

- `CREATE TYPE` `TransportVehicleType`, `TransportDirection`,
  `TransportAssignmentStatus`
- `CREATE TABLE` `TransportVehicle`, `TransportRoute`, `TransportStop`,
  `TransportDriver`, `TransportAssignment` + indexes + FKs
- `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ASSIGN'`
- `ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSPORT_VEHICLE' /
  'TRANSPORT_ROUTE' / 'TRANSPORT_STOP' / 'TRANSPORT_DRIVER' /
  'TRANSPORT_ASSIGNMENT'`
- `ALTER TABLE "School" ADD COLUMN "transportVehicleCounter" INTEGER NOT NULL
  DEFAULT 1`

No existing tables modified beyond the additive counter/back-relation fields
(back-relations are client-side only and have zero DB impact); no data
mutation; no reset; no destructive operations. `transport:delete` has no
endpoint so no delete privileges are added.

## 9. Frontend

- `/transport` page (replaces the placeholder; `moduleMeta` entry removed) with
  tabs: **Vehicles**, **Routes & Stops**, **Assignments** (Library precedent).
- Vehicles tab: search + type/status filter, desktop table / mobile cards,
  New/Edit dialogs, deactivate action, capacity shown with utilization.
- Routes & Stops tab: route list (vehicle + stop count + seats), New/Edit route
  dialog (vehicle picker), expandable stops per route with add/edit/reorder/
  deactivate.
- Assignments tab: search + filters (route, session, direction, status),
  summary counts, Assign dialog (student picker from ACTIVE students, session,
  route, stop, direction), deactivate/re-activate/edit actions, change history
  visible via status.
- `src/services/transportService.ts`, `src/hooks/useTransport.ts`,
  `src/lib/transportFormRules.ts` (+ DOM-free tests), `src/types/transport.ts`.
- Permission-aware UI via `can(...)`; loading skeletons, empty states, and
  error-to-retry states; mobile-first responsive.
- Dates/native inputs where relevant; `YYYY-MM-DD` matches the backend boundary.

## 10. Tests

- **DB-free unit:** `transport.rules` (capacity math, reorder renumbering,
  join-name, counter serialization, change/deactivate snapshot logic) +
  frontend `transportFormRules.test.ts`.
- **DB-backed integration** (`TEST_DATABASE_URL`, standard harness): CRUD happy
  paths for vehicles/routes/stops/drivers/assignments; capacity hard-reject;
  capacity-floor on vehicle update; inactive-entity restrictions (vehicle,
  route, stop); cross-tenant direct-ID → 404; cross-tenant body refs → 400;
  RBAC (viewer denied create/update; manager allowed; princal view-only);
  assignment single-ACTIVE per (student, session, direction) with historical
  row preserved; fresh-session requirement; audit rows in-transaction;
  vehicle one-route swap; regression of existing phases.

## 11. Seed strategy

Extend the existing idempotent seed additively: if no transport rows exist,
create 2 vehicles (capacity 40 / 20), 2 routes with ordered stops, 1 driver
linked to an existing ACTIVE staff member, and a few ACTIVE student assignments
against the ACTIVE session. Guarded on row-absence so re-seeding never
duplicates.

## 12. Future considerations (explicitly OUT of scope now)

Transport-fee invoicing (Finance integration), GPS/live tracking, route
optimization / geocoding / maps, fuel/maintenance ERP, ticketing/QR passes,
driver HR & payroll, driver leave/roster, parent/student portal visibility,
transport analytics (Reports phase), notifications for route changes
(Notifications phase). Reserved permission codes are unchanged.