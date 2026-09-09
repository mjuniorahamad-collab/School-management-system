# Dashboard real-data — "Insights Foundation" specification

Status: **implemented** (tenant-scoped read-only aggregation API under
`/api/v1/dashboard`, frontend service + hooks, all dashboard widgets converted off
mock data, unit + integration tests). This milestone replaces the dashboard's
temporary mock data with real, DB-backed aggregations. It introduces **no new
schema and no migrations** — everything is derived from existing domain models.

## 1. Purpose

Give the home screen a genuine, current picture of the school: headline counts,
attendance today/week/month, fee analytics, the active session's fee collection
status, class performance against a comparable finalized exam, recent students,
upcoming events, published notices, recent creates, and birthdays. It is
read-only, performance-safe (aggregations + limited `take`), tenant-scoped, and
guarded by the existing `dashboard:view` permission.

## 2. Guard rails

- **Read-only.** No endpoint mutates anything.
- **Tenant-scoped.** Every query filters through `req.auth.school.id`.
- **RBAC.** The router mounts `requireAuth`; every route then requires
  `dashboard:view` as route middleware.
- **No schema changes / no migrations.** The service aggregates existing domain
  rows only.
- **Performance-safe.** Counts/aggregates in parallel `Promise.all`; lists are
  capped (`take`) with deterministic ordering.
- **Not an audit log.** "Recent activity" is a lightweight collation of recent
  creates (students, payments, published notices, finalized exams) — a future
  Audit Logs module owns full event history.

## 3. Endpoints (`/api/v1/dashboard`)

All return the standard `{ success, data }` envelope and require
`dashboard:view`.

| Method + path             | Handler output                                              |
| ------------------------- | ----------------------------------------------------------- |
| `GET /stats`              | Four `{ id, label, value, trendPercent, comparison }` stats. |
| `GET /attendance?period=` | `{ total, present, late, absent, average }` for `today\|week\|month`. |
| `GET /fees?period=`       | `{ totalCollected, trendPercent, comparison, months[] }` for `month\|session\|year`. |
| `GET /fee-status`         | `{ collected, pending, total }` for the ACTIVE session.     |
| `GET /top-classes`        | `{ context, classes[] }` — see §4.                          |
| `GET /recent-students`    | Up to 6 newest students with active placement.              |
| `GET /events`             | Up to 5 future `SCHEDULED` events (startAt ≥ now).          |
| `GET /notices`            | Up to 5 `PUBLISHED` notices, publishedAt desc.              |
| `GET /activity`           | Up to 5 recent creates across students/payments/notices/exams. |
| `GET /birthdays`          | ACTIVE students whose birthday is today (server-computed age). |

Query defaults: `attendance?period` defaults to `today`; `fees?period` defaults
to `session`. Unknown values → 400 `BAD_REQUEST`.

### Statcard semantics

- `total-students` / `total-teachers` count `ACTIVE` rows; `total-classes` counts
  all classes; `fees-collection` sums `FeePayment` against the ACTIVE session's
  invoices (formatted `₹NNN`, en-IN).
- `trendPercent` is creation-based: new-entities-this-month vs last month for the
  three count cards, and current-month vs last-month collections for the fees
  card (`comparison` labels accordingly). `0` with `"vs last month"` is shown when
  there is no prior data. Trend math lives in `dashboard.rules.ts` (`trendPercent`):
  0 prior + positive current = 100, else 0; otherwise percentage change rounded to
  1 decimal. Icons/tones stay on the frontend (`STAT_PRESENTATION` in
  `DashboardPage.tsx`) because tones and icons are not serializable.
- `getStats` returns raw values as strings exactly as the old mock did, so the
  `StatCard` component needs no value reformatting.

### Fee semantics

- `month`: calendar-month buckets (4 weeks × label `Wk N`), trend vs the prior
  calendar month.
- `session`: buckets over the ACTIVE session's 6 most recent calendar months, the
  active session's collected total, trend vs the immediately previous session
  (found by ordering `AcademicSession.startDate`).
- `year`: 12 calendar-month buckets, trend vs the same months last year.
- `fee-status`: invoices + payments for the ACTIVE session only; zeros when no
  session or no invoices.

### Events / Notices mapping

- `Event.category`: `SPORTS → sports`, `ACADEMIC → academic`,
  `COMMUNITY → community`, `CULTURAL → academic`, `GENERAL → community`.
- `Notice.priority`: `HIGH → high`, `MEDIUM → medium`, `LOW → low`. Only
  `PUBLISHED` notices surface; `publishedAt ?? createdAt` is the timestamp.

## 4. Top Performing Classes (refined comparison rule)

Because `Exam` is class-scoped, classes legitimately have **different latest
finalized exams**. A cross-class ranking is only meaningful inside **one
comparable context** — a set of `FINAL` exams sharing the same
`(examTypeId, academicSessionId)`.

Selection order (implemented as the pure rule `selectBestExamContext`):

1. Group all `FINAL` exams into contexts by `(examTypeId, academicSessionId)`.
2. Pick the context with the **most participating classes**; tie-break by the
   **newest academic session** (`AcademicSession.startDate`), then
   lexicographically by context key for deterministic reproducibility.
3. Require **≥ 2 classes** in the chosen context — otherwise return an empty
   result rather than fabricate or mix contexts.
4. Pull each class's average `totalPercentage` from `ExamResult` for that context
   (student averages, then class averages), rank descending (ties by class name,
   stable ranks). Classes with < 2 classes in *results* also collapse to the
   empty state.

Response:

```
{ context: { examName, academicSessionName, from, to } | null, classes: [...] }
```

`classes[]` entries are `{ rank, name, performance, students }` where `students`
counts result rows used. The widget shows the exam context (name · session) as its
subtitle and an "insufficient data" state when `classes` is empty.

## 5. Database

No additions. The service reads `Student`, `Teacher`, `Class`,
`StudentEnrollment`, `AttendanceRecord`, `FeeInvoice`, `FeePayment`,
`AcademicSession`, `Exam`, `ExamResult`, `Event`, `Notice`.

## 6. Frontend

- `src/types/dashboard.ts` — the wire contract mirroring the backend types
  (`DashboardStatItem`, `DashboardAttendance`, `DashboardFeeAnalytics`,
  `DashboardFeeCollectionStatus`, `DashboardTopClasses` (+ context),
  `DashboardRecentStudent`, `DashboardUpcomingEvent`, `DashboardNotice`,
  `DashboardActivity`, `DashboardBirthdayStudent`, period/tone unions).
- `src/services/dashboardService.ts` — all-ten real API calls via `@/lib/apiClient`.
- `src/hooks/useDashboardData.ts` — TanStack Query hooks (query keys unchanged:
  `dashboard-stats`, `dashboard-attendance`, `dashboard-fees`, …); the old
  `useQuickActions` hook was removed.
- Widgets in `src/components/dashboard/` (StatCard, AttendanceOverview,
  FeesCollectionCard, FeeCollectionStatus, TopPerformingClasses, RecentStudents,
  UpcomingEvents, ImportantNotices, RecentActivity, BirthdayStudents,
  QuickActions) are converted: loading/error (`error.tsx`) and empty states,
  real-data branches, and zero-division guards. `QuickActions.tsx` is now a
  static navigation catalogue (icons/dialogs/navigation only; gated by
  `can("students:create")`).
- Removed mock files: `src/data/dashboard.ts`, `attendance.ts`, `fees.ts`,
  `activities.ts`, `events.ts`, `notices.ts`, `classes.ts`, `quickActions.ts`,
  and `src/data/students.ts`. `src/data/` now contains only `moduleMeta.ts`
  (placeholder-page metadata for the planned Payroll/Hostel/Backups modules),
  labeled TEMPORARY MOCK.

## 7. Tests

- `server/tests/dashboard.unit.test.ts` — DB-free: `trendPercent` math;
  `selectBestExamContext` (most-classes win, newer-session tie-break, deterministic
  name tie-break, min window, <2 classes → null); `computeClassRanking` (grouping,
  averages, tie-break, empty).
- `server/tests/dashboard.integration.test.ts` — skipped unless
  `TEST_DATABASE_URL`; exercises 401/403 guards, stats values, attendance
  aggregation + period defaults/validation, fee-status zero + totals, top-classes
  ranking + context preference + insufficient state, events/notices filters, and
  cross-school isolation both directions.

## 8. Future considerations (out of scope)

- Real-time/revisioned activity would come from the Audit Logs module.
- Additional widgets (fee dashboards, exam analytics) attach to the same
  aggregation seam.
- Search/autocomplete for students is served by the real Students API through
  `studentsService.list` → `/students/:id` (no longer mock-backed).