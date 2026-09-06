# Reports module specification

Status: **in scope (Reports V1 — six read-only operational reports)**.
Adds a Reports / Insights module that answers real school questions from data
that already exists. Report code is strictly read-only, server-side aggregated,
tenant-scoped, RBAC-guarded, and exportable to CSV with browser-printable HTML.
The module computes from existing tables only — **zero new report data models**
and (aside from one additive audit enum value) zero schema risk.

## 1. Purpose

Give `SUPER_ADMIN`, `SCHOOL_ADMIN`, `PRINCIPAL`, and `ACCOUNTANT` a place to
answer "what is happening in our school" with professional, deterministic,
exportable reports:

- **Operational** — student roster, admissions summary, attendance summary.
- **Academic** — per-exam class/student performance (one exam at a time).
- **Financial** — fee collection & outstanding, payment & receipt register.

## 2. Product boundary

This is an **operational reporting** module, not a BI platform. Explicitly OUT
of scope in this phase: custom/ad-hoc report builders, saved report
definitions, dashboards/alerting, grade cards & certificates, PDF generation,
and Library/Transport/Audit/Messages-specific reports (deferred to a later
Reports phase — the permission grants today do not reach those operational
roles).

## 3. Guard rails

- **Tenant-scoped.** Every query and export is filtered by `schoolId` resolved
  server-side from `req.auth.school.id`. The API never accepts a school
  identifier; filters cannot cross tenants; exports are equally tenant-scoped.
- **RBAC.** The router mounts `requireAuth` + `requirePermission("reports:view")`;
  export routes additionally require `reports:export`. Each report also
  declares a domain-specific `requiredPermission` from the existing catalog
  (e.g. `fees:view` for financial reports) enforced by the same `hasPermission`
  primitive — **no parallel authorization mechanism**. Permissions are never
  enforced client-side (the frontend uses `can()` for UI hiding only).
- **Read-only.** Report handlers perform zero writes. The only write in the
  module is the audit row for an export, through the existing AuditLog service.
- **Canonical finance.** Financial reports read the denormalized
  `FeeInvoice.amountPaid`/`balance` and derive status with the exact
  `fee-invoice.rules.ts` functions the finance API already uses. Reports never
  recompute balances from payment history.
- **No fabricated data.** Academic reports read server-computed stored values
  (`ExamResult.totalPercentage`, `grade`, `rank`) and exclude incomplete/absent
  students exactly like finalize does. Never average non-keyboard-entered data.
- **Additive schema only.** One tiny migration adds `REPORT` to
  `AuditEntityType` so exports can be audited. No tables, columns, or rows are
  touched; no destructive migrations; no DB reset.

## 5. Report catalog (single source of truth)

Each report is defined once in a server-side registry (`report.catalog.ts`):
`key`, `title`, `group` (`operational | academic | financial`), `description`,
`requiredPermission` (extra gate), and export column list. The catalog endpoint
is mirrored on the frontend so the UI is data-driven.

| Key | Title | Group | Required permission (extra) |
| --- | ----- | ----- | ---------------------------- |
| `student-roster` | Student Roster | operational | `students:view` |
| `admissions-summary` | Admissions Summary | operational | `admissions:view` |
| `attendance-summary` | Attendance Summary | operational | `attendance:view` |
| `academic-performance` | Academic Performance | academic | `results:view` |
| `fee-collection` | Fee Collection & Outstanding | financial | `fees:view` |
| `payment-register` | Payment & Receipt Register | financial | `payments:view` or `receipts:view` |

All module routes require `reports:view`; exports require `reports:export`
(both already exist in the permission catalog and are granted to
SUPER_ADMIN/SCHOOL_ADMIN/PRINCIPAL/ACCOUNTANT). No new permission codes, no role
grant changes.

## 6. Date / session semantics

- Every date param is `YYYY-MM-DD`; the server interprets UTC-canonical
  calendar dates (same convention as fee/library rules `@db.Date` handling).
- "Current" academic session = `AcademicSession.status = ACTIVE`.
- Mandatory scope filters per report: `student-roster`, `attendance-summary`,
  `academic-performance`, `fee-collection` require `sessionId`;
  `admissions-summary` and `payment-register` require a date range.
- Fee overdue / invoice status is derived at read time against `today` (UTC
  canonical) — never a stored value.
- Deterministic sorting everywhere (stable tie-breakers, never unspecified
  order).

## 7. Endpoints

All return the standard `{ success, data }` envelope.

| Method + path | Permission | Output |
| ------------- | ---------- | ------ |
| `GET /reports/catalog` | `reports:view` | report registry (key, title, group, description, requiredPermission) |
| `GET /reports/exam-options?sessionId=` | `reports:view` + `results:view` | tenant-scoped PUBLISHED/FINAL exams for the session (id, name, status, class count) |
| `GET /reports/:reportKey` | `reports:view` + report gate | report data (aggregated, bounded) |
| `GET /reports/:reportKey/export` | `reports:export` + report gate | CSV attachment (BOM, CRLF), audited `EXPORT`/`REPORT` |

Empty result sets return `success: true` with `items: []` (and zeroed
summary) — no-data is never an error.

## 8. Export / print strategy

- **CSV** via the new shared `server/src/lib/csv.ts` utility (BOM + CRLF +
  RFC 4180-style quoting), the same shape students/audit exports ship today.
  List-style exports are row-limited (`EXPORT_LIMIT`); aggregate-style exports
  ship their bounded rows.
- **Printable HTML** in the browser (`window.print()` + Tailwind `print:`
  variants). PDF generation/document infrastructure is explicitly deferred.

## 9. Database / migration plan

One additive migration `20260909000000_reports_audit_entity`:
`ALTER TYPE "AuditEntityType" ADD VALUE 'REPORT';`. Applied deploy-only
(`npx prisma migrate deploy --schema server/prisma/schema.prisma`). No other
schema change.

## 10. Audit integration

- Ordinary report **view/GET requests are not audited**.
- Every report **CSV export** writes an `AuditLog` row (action `EXPORT`,
  entityType `REPORT`, entityId = report key, metadata
  `{ filters, rowCount }`) via the existing `recordAuditAfterCommit` path, so
  actor attribution and tenant redaction are inherited.

## 11. Frontend

- `src/types/reports.ts` mirrors the backend contract; report-specific result
  shapes keep column order stable for print/export.
- `src/services/reportsService.ts` is the data seam; export is consumed as a
  download URL (same pattern as audit logs).
- `src/hooks/useReports.ts` provides namespaced TanStack Query hooks.
- `src/pages/reports/ReportsPage.tsx` renders a catalog (grouped cards filtered
  by `can(report.requiredPermission)`) plus a viewer: filter panel, summary
  strip, table, and export/print bar. Loading/error/empty states on every view.
- `/reports` moves from `ModulePlaceholderPage` to a lazy-loaded real page; the
  demo `GenerateReportDialog` and its dashboard quick action are removed.

## 12. Performance

- Mandatory session/date filters prevent unbounded scans.
- Aggregation uses Prisma `groupBy`/`aggregate` and paged `count`+`findMany`;
  no N+1, no whole-table client-side math.
- All report queries are served by existing indexes (verified against schema);
  no new indexes in V1.
- Bounded result sizes: list-style reports paginate (page size cap 200) and
  export rows are capped; aggregate reports return naturally bounded rows.

## 13. Tests

- **Unit (DB-free)** — `report.rules.ts` math, report-catalog invariants, shared
  CSV utility (BOM/CRLF/quoting).
- **Integration (TEST_DATABASE_URL)** — per-report correctness; finance totals
  cross-checked against canonical balances AND independent payment sums;
  academic exam-context isolation (one exam at a time); session/date filter
  edges; RBAC matrix (accountant on finance, blocked otherwise); tenant
  isolation (school A data invisible to school B via same filters); export
  byte-level checks (BOM, headers, filename); empty states.

## 14. Future considerations

V2 candidates (explicitly NOT this phase): Library circulation, Transport
usage, Audit activity, Messages/Notices volume reports; financial period
starting balances vs current-session paid; granting `reports:view` to TEACHER.
V3: grade cards/certificates and PDF rendering; custom/saved report definitions
(which would then justify a DB-backed catalog).