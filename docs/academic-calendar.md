# Academic Calendar & Attendance Validity

Status: **Phase 1 backend foundation implemented.** The authoritative academic
calendar, the enrollment placement history, and attendance-register completeness are
implemented as RBAC-guarded endpoints (`/api/v1/academic-calendar`,
`/api/v1/enrollment-history`, `/api/v1/attendance/registers`) backed by the
`20261015000000_academic_calendar_enrollment_foundation` migration (new tables
`AcademicCalendar`, `CalendarDay`, `StudentEnrollmentPeriod`, `AttendanceRegister`).

Not yet implemented: the Report Card publication/blocking rule (§10), attendance
percentage (§9), every frontend surface, and the DB-backed integration suite has not
been run against a real database. Anything below not yet backed by code remains a
proposal.

## 1. Purpose and scope

- Establish an authoritative, school-authored academic calendar (instructional days,
  holidays, half-days) per academic session.
- Establish a reconstructable history of each student's class/section placement so the
  expected attendance roster can be derived for any past date.
- Define when attendance data is complete and verified, and when it must block or
  flag a Report Card.
- Retire the inert free-text `attendanceWorkdays` setting as a source of truth.

Out of scope: changing existing attendance marking UX, `AttendanceStatus` values, or
the existing attendance summary behaviour beyond what is required for Report Cards.

## 2. Terms

- **Instructional day**: a date the school taught, either full (weight 1.0) or half
  (weight 0.5).
- **Non-instructional day**: a holiday/closure (weight 0).
- **Unknown day**: no authored override and no confirmed weekly pattern for that date.
- **Register**: the per class/section/day record of attendance for all expected students.
- **Verified register**: a register where every expected student has exactly one
  definitive PRESENT/ABSENT/LATE record.

## 3. Instructional-day model (three-valued, never two)

Every date in a session resolves to exactly one status:

| Status | Meaning | Source |
| --- | --- | --- |
| `INSTRUCTIONAL` | school taught (full or half) | authored override, or confirmed weekly pattern |
| `NON_INSTRUCTIONAL` | holiday/closure | authored override only |
| `UNKNOWN` | unresolved | no override and no confirmed pattern |

Rules:

- An explicit holiday override is authoritative. An unconfigured date is `UNKNOWN`,
  never assumed instructional.
- **Provisional seeding is not authoritative.** Seeding session dates + default
  weekdays asserts a *proposed* pattern; each seeded period carries provenance
  `SEEDED` and a confirmation state. Until a human confirms it, seeded dates remain
  `UNKNOWN` for validity purposes.
- Confirmation is a per school-authored action, recorded with actor and timestamp.

## 4. Weekly pattern

- `workingWeekdays` is a validated set over `MON..SUN` (default `MON..FRI`).
- Validation: at least 1 and at most 7 values, canonical enum values only, no
  duplicates. Invalid/absent configuration fails safe to `MON..FRI` **as a suggestion
  for configuration only**; it is surfaced as a configuration warning.
- **The `MON..FRI` fallback never makes a date authoritative.** An unconfirmed date
  remains `UNKNOWN` regardless of the fallback; deriving a date as instructional
  requires a confirmed calendar (see §6). The fallback must not silently convert
  `UNKNOWN` into an authoritative instructional date.
- Saturday/Sunday are valid if the school selects them; there is no built-in weekend.

## 5. Half-days

- Day-level `instructionalValue` in `{1.0, 0.5, 0}` (full / half / closed).
- Stored on the date override; derived dates are 1.0 on working weekdays.
- Half-days are not a new attendance status; the status stays PRESENT/ABSENT/LATE.

## 6. Proposed data models

```
AcademicCalendar
  id, schoolId, academicSessionId
  workingWeekdays   String[]           // validated MON..SUN set
  provenance        SEEDED | AUTHORED
  confirmedAt, confirmedByUserId
  @@unique([schoolId, academicSessionId])

CalendarDay
  id, schoolId, academicSessionId
  date              DateTime @db.Date
  kind              INSTRUCTIONAL | NON_INSTRUCTIONAL
  instructionalValue Decimal @db.Decimal(3,2)   // 1.00 | 0.50 | 0.00
  label, note
  source            SEEDED | AUTHORED
  confirmedAt       DateTime?                   // null = unconfirmed
  confirmedByUserId String?
  createdByUserId, createdAt, updatedAt
  @@unique([schoolId, academicSessionId, date])
```

Derivation for a date: an explicit `CalendarDay` wins; otherwise the confirmed weekly
pattern decides; otherwise `UNKNOWN`. `totalInstructionalValue = Σ instructionalValue`.

**Provenance and confirmation.** A calendar (and each date override) carries
`source: SEEDED | AUTHORED` and a nullable `confirmedAt`. Seeded historical data is
**untrusted until confirmed**:

- A date is authoritative (`INSTRUCTIONAL`/`NON_INSTRUCTIONAL`) only when it is
  `AUTHORED`, or when its `SEEDED` period has been explicitly confirmed
  (`confirmedAt != null`).
- An unconfirmed seeded date is `UNKNOWN` and must not be treated as instructional.
- Confirmation is an explicit authorized action recorded with actor and timestamp;
  re-confirming after an edit updates `confirmedAt`/`confirmedByUserId`.

## 7. Enrollment placement history (authoritative)

Placement is currently updated in place (`student.service.ts:207-216`), which destroys
history. The authoritative history model is:

```
StudentEnrollmentPeriod
  id, schoolId, studentId, academicSessionId, enrollmentId
  classId, sectionId?
  effectiveFrom     DateTime @db.Date
  effectiveTo       DateTime? @db.Date
  source            SEEDED | AUTHORED
  confirmedAt       DateTime?                   // null = unconfirmed
  confirmedByUserId String?
  createdAt, createdByUserId, updatedAt, updatedByUserId
  @@index([schoolId, academicSessionId, classId, sectionId, effectiveFrom, effectiveTo])
```

Boundary semantics: **inclusive start, exclusive end — `[effectiveFrom, effectiveTo)`**.
A transfer date belongs to exactly one period; no double counting. `effectiveTo = null`
means the open/current period.

Operations (never overwrite a historical period):

- **Admission**: create the first period from `admissionDate`.
- **Placement change / transfer**: close the current period
  (`effectiveTo = changeDate`) and open a new one (`effectiveFrom = changeDate`).
- **Withdrawal**: close the open period at the leaving date.
- **Re-admission**: open a new period; prior periods are untouched.
- **Retroactive correction**: edit the affected period under audit; if the change
  touches a date whose register is `VERIFIED`, that register is reopened and must be
  re-verified. The Report Card then follows the data-quality rules in §10.

**`Student.leftAt`** is a distinct, explicit field with a narrow meaning: the date the
student exited the school (withdrawal / transfer-out / graduation), or `null` while
currently enrolled.

- It records the *school-exit* fact only.
- It **must not** be used to overwrite or rewrite any `StudentEnrollmentPeriod`
  boundary; periods remain the placement history.
- A transfer *between classes/sections within the school* does **not** set `leftAt`; it
  is a period close/open only.
- A withdrawal sets `leftAt` **and** closes the open period at that date (two records
  of one fact, with the period remaining the authoritative placement history).
- Re-admission may clear `leftAt` (currently enrolled) without altering past periods.

### 7a. Overlap prevention (database-safe)

Placement periods for one student in one session must **never overlap**. Because
`effectiveTo` is exclusive, an open period is `[effectiveFrom, +∞)`.

- Enforce at the database level with a PostgreSQL exclusion constraint (raw-SQL
  migration, since Prisma has no native exclusion-constraint support):
  `EXCLUDE USING gist (enrollmentId WITH =, daterange(effectiveFrom, effectiveTo, '[)') WITH &&)`.
- Also validate **transactionally** in the service before any
  close/open/correct operation, so a conflicting write is rejected with a clear error
  rather than silently merged.
- **Pre-implementation environment check:** before building, verify that the target
  Neon PostgreSQL environment supports the required extension/constraint
  (`btree_gist` for the `EXCLUDE` constraint on `enrollmentId WITH =`). If
  database-level protection cannot be provided, this **blocks implementation** — do
  **not** silently fall back to application-only validation.
- A transfer must close the current period at the same date it opens the next; the
  shared boundary date belongs to the new period (inclusive start, exclusive end).
- Historical backfill creates exactly one open `SEEDED` period per enrollment; if that
  would overlap an existing period, the migration must fail and surface the conflict.

## 8. Attendance registers and completeness

```
AttendanceRegister
  id, schoolId, academicSessionId, classId, sectionId?
  scopeKey          String                      // sectionId ?? '__CLASS__'
  date              DateTime @db.Date
  status            OPEN | SUBMITTED | VERIFIED
  expectedCount     Int
  submittedAt, submittedByUserId
  verifiedAt, verifiedByUserId
  @@unique([schoolId, academicSessionId, classId, scopeKey, date])
```

**Uniqueness with a null `sectionId`.** PostgreSQL treats `NULL` values as distinct, so
a unique constraint that includes a nullable `sectionId` would allow duplicate
class-level registers for the same date. `scopeKey` is a non-null discriminator and the
unique constraint is defined on it, so class-level and section-level registers are both
deduplicated safely.

**Scope integrity (DB CHECK constraint).** A database CHECK constraint must guarantee
`scopeKey` matches the actual section scope:

- class-level register (`sectionId IS NULL`) → the one canonical constant
  `scopeKey = '__CLASS__'`;
- section-level register (`sectionId IS NOT NULL`) → `scopeKey` equals a deterministic
  value derived from `sectionId` (e.g. `sectionId` itself).

The server sets `scopeKey`; **a client-supplied `scopeKey` is never trusted** and must
be ignored/rejected. The CHECK constraint is the enforcement point, not application
code alone.

- **Expected roster** for a date = students with a `StudentEnrollmentPeriod` covering
  that date (`effectiveFrom <= d < effectiveTo` or open) in that class/section/session.
- **VERIFIED** requires every expected student to have exactly one definitive
  `PRESENT | ABSENT | LATE` record for that date.
- A date counts toward an attendance denominator only when its register is `VERIFIED`.
- A register cannot be verified while any expected student's record is missing.

## 9. Attendance percentage

Attendance is computed only over **verified instructional dates** in the student's
applicable window (window = `max(session.start, admissionDate, period start)` to
`min(session.end, period end / leftAt)`).

```
attendancePct =
  100 × Σ_d [ w(d) × credit(status(d)) ]
        / Σ_d [ w(d) ]
```

- `w(d)` = `instructionalValue(d)` (0.5 or 1.0); non-instructional dates excluded.
- `credit(PRESENT) = 1.0`, `credit(LATE) = 1.0`, `credit(ABSENT) = 0`.
- **V1: LATE earns the same instructional credit as PRESENT; the statuses stay
  distinct and are reported separately. There is no configurable late credit.**
- Because `credit ∈ [0,1]` and numerator and denominator share `w(d)`, the result can
  never exceed 100%.

Explicit treatments:

| Situation | Numerator | Denominator | Behaviour |
| --- | --- | --- | --- |
| ABSENT on a half-day | +0 | +0.5 | absence weighted 0.5 |
| Missing row, register `VERIFIED` | — | — | integrity breach → requires review / block |
| Missing row, register not `VERIFIED` | excluded | excluded | date not counted; flagged |
| Non-instructional date with a row | excluded | excluded | anomalous; data-quality flag |
| Register `OPEN`/unverified | excluded | excluded | never inferred |

**Never infer absence from a missing row.**

## 10. Deterministic publication / blocking rule

Attendance-data validity is **separate** from any publication threshold:

- **No minimum attendance percentage blocks academic Report Card publication.**
  Attendance is displayed; it does not gate the academic card.
- **Fixed LATE credit remains 1.0** (see §9) and is unaffected by these rules.

The following is the single deterministic rule. If **any** row in the "Blocking"
column applies, the attendance portion cannot be finalized and the Report Card is
blocked (requires review); it is never inferred around.

| Observed condition | Effect |
| --- | --- |
| Any date in the student's window is `UNKNOWN` (unconfirmed calendar) | date excluded + flagged → **block** |
| Any register covering the window is not `VERIFIED` (i.e. `OPEN`/`SUBMITTED`) | date excluded + flagged → **block** |
| A `VERIFIED` register is missing an expected student's record | integrity breach → **block** |
| Placement history is unconfirmed, overlapping, or absent for any date in the window | **block** |
| Every window date is authoritative `INSTRUCTIONAL`/`NON_INSTRUCTIONAL` and every relevant register is `VERIFIED` | attendance finalizable |

**Never infer absence from a missing row.** A blocked attendance portion does not by
itself alter the academic result; it prevents finalizing attendance until the data is
correct.

### 10a. Confirmation authority and audit

- **Calendar** (`AcademicCalendar`, `CalendarDay`, `SEEDED` → confirmed): confirmed by
  an actor holding `calendar:manage`.
- **Placement** (`StudentEnrollmentPeriod`): historical placement corrections and
  confirmations require a **dedicated `enrollment:history:manage` permission**. Broad
  `students:update` must **not** be the sole authorization boundary for rewriting
  placement history.
- Every confirmation records `confirmedAt` + `confirmedByUserId` and writes an audit
  entry (actor, timestamp, target, previous/new value). Confirmation is never implied
  by seeding or by a MON–FRI default.

## 11. Remaining historical limitations

Not reconstructable from current data without the new models and, for past terms,
human confirmation:

1. Exact transfer date within a past session (only the latest placement survived).
2. Withdrawal/exit date for already-left students (no field previously existed).
3. Expected roster for any past date before period history exists.
4. Whether an absent/missing historical row was a true absence or an unmarked day.
5. Retroactive placement edits made before this model, with no linkage to attendance.
6. Historical half-days (no calendar existed).

For these, the system must not infer; affected cards are flagged/blocked until
confirmation.

## 12. Permissions

- `calendar:manage` — author calendar, confirm seeded periods, manage holidays.
- `enrollment:history:manage` — correct/confirm historical `StudentEnrollmentPeriod`
  placement; the dedicated authorization boundary for rewriting placement history
  (not `students:update` alone). Every action is audited.
- Register verification uses an attendance-management permission (reuse existing
  attendance permissions; no new report-card permission for marking).

## 13. Migration and seeding

- Add the four models and backfill one open `StudentEnrollmentPeriod` per existing
  enrollment from `admissionDate` (marked `SEEDED`, unconfirmed).
- Seed `AcademicCalendar` per session as `SEEDED`, unconfirmed.
- No historical roster/register is fabricated; unconfirmed data stays `UNKNOWN`.

## 14. Open policy choices requiring school input

1. Who is authorized to confirm historical calendar periods and at what granularity.
2. Whether attendance below a threshold should ever *flag* (display-level) even though
   it never blocks academic publication.
3. Whether non-instructional dates may ever carry attendance rows for reporting.
