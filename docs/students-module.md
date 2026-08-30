# Students module — written domain specification

Status: **implemented end-to-end** (DB models, RBAC-guarded API, frontend, tests).
This document is the authoritative specification for the module and should guide
any future extension (Teachers, Admissions, etc. should follow this template).

## 1. Purpose

Maintain the master student directory: identities, contact details, guardians,
and per-academic-session enrollment placement. It is the first real domain module
delivered on top of the authentication + RBAC foundation and is the reference
pattern for future modules.

## 2. Domain rules

### Student identity

- A `Student` is a domain record and is **separate from a `User` account**. A
  student does not have login credentials in this milestone.
- `firstName`/`lastName` are required; `middleName` is optional. Display name is
  `firstName [middleName] lastName`.
- `gender` is one of `MALE | FEMALE | OTHER`.
- `dateOfBirth`, `admissionDate` are required ISO dates (`YYYY-MM-DD`).
- Contact fields (email, phone) and address fields (line1/line2, city, state,
  postal code) are optional at the API boundary and stored trimmed/nullable.
- `photoUrl` must be a URL only (no file upload in this milestone).

### Admission numbers

- Generated server-side from `School.admissionCounter`: format `ADM-YYYY-NNNN`
  where `YYYY` is the current year and `NNNN` is the counter zero-padded to four
  digits. Counter increments on each create; the sequence must never be reused.
- Students cannot supply or change their admission number.

### Enrollment / placement

- A `StudentEnrollment` represents the student's placement for one academic
  session (unique on `(studentId, academicSessionId)`). At most one record per
  session per student.
- Create requires an **ACTIVE** academic session; the new student is placed in it.
- Update placement targets the student's current ACTIVE-session record: both
  `classId` and `sectionId` must be supplied together. Providing only a class
  (no section) is rejected. The section must belong to the class.
- Retrieving a student resolves the active placement (the ACTIVE session's
  enrollment), and the list joins placement per the requested session filter
  (default: ACTIVE session).

### Guardians

- A guardian is shared master data; a `StudentGuardian` join links a guardian to
  a student with `relationshipType` (`FATHER | MOTHER | PARENT | GUARDIAN |
  LEGAL_GUARDIAN | OTHER`), `isPrimary`, and `isEmergencyContact`.
- At least one guardian with a name is required on create.
- At most one guardian per student can be `isPrimary` ("Only one guardian can be
  marked as primary").
- Exactly one of `email`/`phone` is not required, but at least a phone is
  recommended for contactability.
- The primary guardian is the default contact surfaced on the list and export.

### Status lifecycle

- `ACTIVE | INACTIVE | TRANSFERRED | WITHDRAWN | GRADUATED`.
- New students start `ACTIVE`. Status is updated via the update endpoint; a
  future promotion/graduation flow may automate transitions.

### Other

- **No delete endpoint** in this milestone. Students are records of record; leave
  the table for future archival policy. (`students:delete` exists in the catalog
  but is intentionally unmounted.)
- Audit columns: `createdBy` / `updatedBy` link nullable to `User`
  (`onDelete: SetNull`); `createdAt`/`updatedAt` maintained by Prisma.
- Everything is school-scoped through `req.auth.school.id`.

## 3. API contract (`/api/v1/students`)

All endpoints are JSON under the standard `{ success, data | error }` envelope,
require `requireAuth`, and enforce the listed permissions via route middleware.

| Method + path      | Permission           | Behavior                                                        |
| ------------------ | -------------------- | --------------------------------------------------------------- |
| `GET /students`    | `students:view`      | Paginated list, search + filters, sort.                         |
| `GET /students/meta` | `students:view`    | Reference data: academic sessions + classes (with sections).    |
| `GET /students/export` | `students:export` | CSV export honoring the same filters (BOM + headers).         |
| `POST /students`   | `students:create`    | Create student + guardians + ACTIVE-session placement.          |
| `GET /students/:id`| `students:view`      | Full detail incl. active enrollment + guardians.                |
| `PATCH /students/:id` | `students:update` | Update profile/address/status/guards/placement.               |

Query parameters for `GET /students` and `/export`:

- `page` (default 1), `pageSize` (default 20, max 100)
- `search` — matches name (first/last/middle), admission number, email, and
  guardian name (case-insensitive)
- `sessionId`, `classId`, `sectionId`, `status` (each optional; class/section
  filtering is applied via the enrollment join)
- `sortBy` (`name | admissionNumber | admissionDate`, default `name`),
  `sortDir` (`asc | desc`)

Responses:

- List → `{ items: StudentListItem[], pagination: { page, pageSize, total, totalPages } }`
- Meta → `{ academicSessions[], classes[] }` where each class carries `sections[]`.
- Detail → identity + address + `enrollment: { academicSession, class, section } | null`
  + `guardians[]` (+ nullable `emergencyContactName`/`emergencyContactPhone`).
- Create/Patch → the created/updated `StudentDetail`.
- HTTP semantics: 400 `BAD_REQUEST` (validation), 401 `UNAUTHORIZED`,
  403 `FORBIDDEN`, 404 `NOT_FOUND` (unknown id).

Create payload:

```
{
  firstName, middleName?, lastName, dateOfBirth, gender,
  email?, phone?, addressLine1?, addressLine2?, city?, state?, postalCode?,
  admissionDate, classId, sectionId, academicSessionId,   // ACTIVE session
  guardians: [{ name, relationshipType, isPrimary, isEmergencyContact, email?, phone? }]
}
```

Patch payload: same shape, all fields optional (status included); placement
update must provide both `classId` and `sectionId` together.

### Permissions

Codes added/used by this module: `students:view`, `students:create`,
`students:update`, `students:export`. Grants:

| Role          | view | create | update | export |
| ------------- | ---- | ------ | ------ | ------ |
| SUPER_ADMIN   | bypass (all)                                             |
| ADMIN         | ✔    | ✔      | ✔      | ✔     |
| PRINCIPAL     | ✔    | ✔      | ✔      | ✔     |
| VICE_PRINCIPAL| ✔    | ✔      | ✔      | ✔     |
| TEACHER       | ✔    | —      | —      | —     |
| Other roles   | —    | —      | —      | —     |

## 4. Database schema (Prisma)

```
School 1──N Student  <── 1 StudentEnrollment N──>1 AcademicSession
Student 1──N StudentGuardian N──1 Guardian
Student N──1 User (createdBy/updatedBy, nullable, onDelete: SetNull)
```

Key notes: `School.admissionCounter` (Int) drives admission numbering inline
(transactional); `StudentEnrollment` unique `(studentId, academicSessionId)`;
`StudentGuardian` unique `(studentId, guardianId)`; `Section` unique within a
class, `Class` unique within a school (seeded reference data for this milestone).
Migration: `server/prisma/migrations/20260830080426_students_domain`.

## 5. Frontend

- `src/types/students.ts` — domain types + form payload types + option constants.
- `src/services/studentsService.ts` — API seam (list/get/meta/create/update,
  `buildStudentsQueryString`, `buildExportUrl`).
- `src/hooks/useStudents.ts` — TanStack Query hooks with optimistic-free
  invalidations and sonner toasts.
- `src/pages/students/` — `StudentsPage` (search/filter/pagination driven by URL
  search params), `StudentDetailPage`, `StudentFormPage` (create/edit).
- `src/components/students/` — toolbar, table + mobile cards, pagination, status
  badge, and the form (client gating mirrors server rules; primary-guardian
  exclusivity, max two guardians in the UI, both class+section on placement).
- Routing: explicit routes in `src/routes/route-tree.tsx`; nav already present
  (`/students`, gated by `students:view`); dashboard "Add Student" quick action
  navigates to `/students/new`.

## 6. Tests

- `server/tests/students.unit.test.ts` — DB-free: admission-number formatting,
  guardian primary normalization, query-schema coercion/validation, CSV builder.
- `server/tests/students.integration.test.ts` — skipped unless
  `TEST_DATABASE_URL` is set; applies migrations, seeds fixtures, exercises auth
  (401/403), CRUD, placement rules, status lifecycle, and export.

## 7. Future considerations (out of scope)

- Student→User account linking for the parent portal.
- File upload / photo storage (photoUrl currently stored as a URL).
- Attendance, promotion, fee installments: designed separately when their module
  specs are written; the enrollment model is deliberately promotion-ready.