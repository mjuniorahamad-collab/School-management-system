# Annual Report Card

Status: **specification; the Report Card document itself is not implemented.** A new
annual, multi-exam instructional document. It is NOT a variant of the Result Sheet; the
Result Sheet and its rounding, aggregate and completeness semantics are unchanged in V1.

Its foundation dependencies (§16) are partly in place: the academic-calendar,
enrollment-placement-history, and attendance-register models, migration, and backend
services exist (see `docs/academic-calendar.md`). The Report Card models, generation,
versioning, PDF archive, API routes, and frontend surfaces below are still proposals.

## 1. Purpose and scope

- Produce an immutable, versioned, publishable Annual Report Card per student per
  academic session, combining annual academics, attendance, and free-form remarks.
- Preserve the exact published artifact and its PDF archive.
- Expose published cards to the guardian portal for linked children only.

Not in scope (V1): co-scholastic/behaviour/personality, height/weight/medical,
board-compliance claims, manual academic-result override, promotion decisions.

**V1 final result = PASS/FAIL only.** The Report Card's final academic outcome is the
computed PASS/FAIL (or `UNRESOLVED`/`REQUIRES_REVIEW`). **Promotion is entirely outside
V1**; it is not a publication precondition and does not trigger reissue (see §8).

## 2. Document type and scheme

- In V1 only an **ANNUAL** Report Card is produced.
- `ReportCardScheme` is scoped `(schoolId, academicSessionId, classId, sectionId?)`;
  `sectionId = null` is class-level, non-null is a section override.
- **Scheme precedence:** a section-specific scheme (`sectionId != null`) takes
  precedence over the class-level scheme (`sectionId = null`) for a student in that
  section. If both exist, the section scheme is authoritative and the class scheme is
  not merged.
- Scheme stores tenant-scoped `ExamType.id` (never a concrete `Exam.id`) and resolves
  to the concrete `Exam.id` at generation ("Design B").

### 2a. Scheme configuration (M6a)

A scheme's identity is its **scope**, so configuration is an idempotent upsert, never a
create/delete pair:

- `PUT /api/v1/report-card-schemes` — create-or-update the scheme for
  `(academicSessionId, classId, sectionId?)`. Guarded by
  `report-cards:manage-schemes`.
- `GET /api/v1/report-card-schemes` and `GET /api/v1/report-card-schemes/:id` — list
  and fetch; both tenant-scoped and guarded by `report-cards:view`.
- **No DELETE endpoint** in V1: removing a scheme would silently change what future
  cards aggregate under.
- **`scopeKey` is derived server-side** from `sectionId` (`__CLASS__` for a class-level
  scheme, the section id for a section scheme) and is never trusted from the request
  body. The scheme's unique constraint is
  `(schoolId, academicSessionId, classId, scopeKey)`.
- **Referenced-id ownership** (session, class, section, exam types, core subjects) is
  validated against the authenticated school inside the transaction.
- **Atomic exam replacement:** an update deletes the prior exam set and creates the new
  set inside the same transaction.
- **Concurrency-safe audit classification:** the upsert takes a scope-keyed PostgreSQL
  advisory lock before reading the existing row, so a first-time upsert audits `CREATE`
  and a repeat audits `UPDATE` even under concurrent writers. The audit row is written
  in the same transaction as the scheme mutation (a failed audit write rolls the
  mutation back).

## 3. Exam resolution

Generation is anchored on the student's **actual `ExamResult` rows**, then on the
concrete exam instances of the scheme's exam type in the student's session. It never
infers a result from the current class/section alone. Evaluation is ordered and
mutually exclusive:

1. **Rows present (≥1).** Consider the concrete exams the student actually has rows
   for:
   - exactly 1 row, instance is `FINAL` → `RESOLVED`;
   - exactly 1 row, instance is not `FINAL` → `NOT_FINAL`;
   - ≥2 rows in the same class but different sections →
     `AMBIGUOUS(CROSS_SECTION_DUPLICATE)`;
   - ≥2 rows spanning different classes → `AMBIGUOUS(CLASS_CHANGE)`.
2. **No rows (0).** Fall back to the class instances of this exam type (they do not
   create results):
   - ≥1 `FINAL` class instance → `MISSING(NO_RESULT_ROW)` (block);
   - an instance exists but none is `FINAL` → `NOT_FINAL`;
   - no instance exists for the class → `MISSING(NO_EXAM_INSTANCE)` (block);
   - multiple possible instances with no unambiguous match → `MISSING(IMPLICIT)`
     (requires review).
3. **One candidate instance in a different class than the student's placement** →
   `AMBIGUOUS(CLASS_CHANGE)`.
4. **Scheme eligibility fails** (exam type not in the scheme / student out of scope) →
   `OUT_OF_SCOPE`.

Ambiguous and missing outcomes fail closed (block). Whole-class and section-only
coexistence does not block generation; it raises a config warning.

## 4. Mark status

`ExamMark` gains a status enum: `SCORED | ABSENT | NOT_APPLICABLE | PENDING`.

- `PENDING` blocks generation for the affected subject.
- `NOT_APPLICABLE` is excluded from the annual computation for that subject.
- **`NOT_APPLICABLE` on a core subject is rejected at entry** (validation error).
- A missing `ExamMark` row is a missing-data problem; a missing `ExamResult` row is a
  missing-result problem. **Neither is ever ABSENT or zero.**

## 5. Aggregation and rounding

Subject annual percentage (per aggregation policy):

- `RAW`: `Σ obtained / Σ max` (pooled across exams).
- `PERCENTAGE_WEIGHTED`: weighted average of exam-level subject percentages
  (`w > 0, Σw = 1 ± 0.0001`; per-subject renormalisation on exclusion).

Overall percentage is computed only over the **resolved subject set** (subjects with
computable results); N/A subjects and policy-excluded subjects are not included, and
ABSENT marks follow the absence policy:

- `RAW` overall: `Σ obtained / Σ max` pooled across all resolved subjects' scored
  marks. ABSENT marks contribute per the absence policy; N/A subjects are excluded
  entirely from both numerator and denominator.
- `WEIGHTED` overall (approved): unweighted mean of resolved subject annual
  percentages (equal subject importance, documented). N/A subjects are excluded from
  the mean; a subject forced to FAIL with a null percentage still counts as a failed
  subject but contributes no numeric value to the mean.

If the resolved subject set is empty, the overall percentage is `UNRESOLVED` (see §6);
an empty set never yields PASS.

Rounding: deterministic **exact-rational decimal half-up to 2 dp**, for the ANNUAL
calculation only; the canonical value is used for both display and pass comparison.
`gradeForPercentage` keeps whole-number band behaviour. Rejected
`Math.round((v+EPSILON)*factor)`.

Acceptance cases: `39.995→40.00`, `40.005→40.01`, `1.005→1.01`, `0.005→0.01`,
`2.675→2.68`, `89.995→90.00`, `99.995→100.00`, `0.0049→0.00`, `39.994→39.99`,
`100/3→33.33`, `200/3→66.67`, `66.66→66.66`.

## 6. Subject outcome and overall result

Subject pass is always PERCENT_THRESHOLD using mandatory, session-scoped,
versioned-and-snapshotted `annualSubjectPassPercent`. Per-subject thresholds are
deferred. `gradingPassPercent` is unused and never reused.

Overall mode `overallPassMode ∈ {ALL_SUBJECTS, PERCENT_AND_MAX_FAILED, CORE_SUBJECTS_AND_PERCENT}`:

- `ALL_SUBJECTS`: all resolved subjects PASS.
- `PERCENT_AND_MAX_FAILED`: `overallPct ≥ overallPassPercent` AND
  `failedCount ≤ maxFailedSubjects` (`0 ≤ N < subjectCount`).
- `CORE_SUBJECTS_AND_PERCENT`: all `coreSubjectIds ⊆ selected` pass AND
  `overallPct ≥ overallPassPercent`.

N/A is excluded from `failedCount`, `subjectCount`, and all-subjects. **N/A never
silently removes a core subject.**

**Empty-set guard.** If the resolved subject set is empty (e.g. every subject is N/A or
policy-excluded), the overall result is `UNRESOLVED`/`REQUIRES_REVIEW`. `ALL_SUBJECTS`
must never PASS via an empty "all subjects passed" evaluation, and no mode may PASS on
an empty set.

Outcome separation: (a) subject outcome, (b) subject percentage, (c) overall
percentage resolvability, (d) overall result, (e) publication. Overall result ∈
`PASS | FAIL | UNRESOLVED | REQUIRES_REVIEW`.

A **forced-fail subject with a null percentage** never fabricates an overall
percentage:

| Mode | Forced-fail present | Overall % missing |
| --- | --- | --- |
| `ALL_SUBJECTS` | FAIL resolved | irrelevant once FAIL |
| `PERCENT_AND_MAX_FAILED` | FAIL resolved if `failedCount > maxFailed`; else UNRESOLVED | UNRESOLVED unless failed-count forces FAIL |
| `CORE_SUBJECTS_AND_PERCENT` | FAIL resolved if failed subject is core; else UNRESOLVED | UNRESOLVED unless a core fail forces FAIL |

Marks rule: any `PENDING`/missing → block; else all N/A in a subject → excluded; else
no `SCORED` + has ABSENT → absence policy; else compute. Precedence never flips a
forced-fail to pass via renormalisation.

Annual absence policy (per subject, configurable): `EXCLUDE_AND_REVIEW` (default) or
`TREAT_SUBJECT_AS_FAILED`. If ABSENT in every exam and excluded → unavailable →
requires review (blocked), null %. If forced-fail → FAIL (policy-resolved, allowed),
null %.

## 7. Required configuration blocks publication

Missing or corrupt **required configuration** — required academic policy (e.g.
`annualSubjectPassPercent`, `overallPassMode`, weights, `coreSubjectIds` when required,
absence policy) **and required signatory configuration** — is a **blocker**:

- **Required signatory configuration blocks generation.** At freeze/generation time the
  tenant's live signatory configuration (`reportCardSignatories`) is read and validated
  strictly: at least one valid `{ role, name }` entry is required, and a missing
  (`REPORT_CARD_SIGNATORIES_REQUIRED`, 400) or malformed
  (`REPORT_CARD_SIGNATORIES_INVALID`, 400) value blocks the card before any row is
  written. The validated list is frozen into the snapshot; nothing is invented.
- The card cannot be published.
- A configuration error is surfaced to the actor.
- The system **never substitutes an invented pass percentage and never silently falls
  back to a guessed academic policy.** A missing *and* a corrupt stored value both read
  through to a hard configuration error.

## 8. Publication preconditions and immutability

Default publication mode `REQUIRE_DECISION`. The academic publication preconditions are:
all scheme exam types `RESOLVED`, no `PENDING`, academic pass policy configured and
resolved, and the overall result resolved to `PASS` or `FAIL`.

- **Publication validates the frozen snapshot, never live settings.** For a `v2`
  snapshot, publication additionally re-validates the signatories frozen at generation:
  a missing frozen list (`FROZEN_SIGNATORIES_MISSING`) or a malformed one
  (`FROZEN_SIGNATORIES_CORRUPT`) blocks with `REPORT_CARD_NOT_PUBLISHABLE` (409). A
  pre-`v2` card (snapshot `v1` or no snapshot) keeps its academic-only lifecycle, and an
  unrecognized snapshot version fails closed (`UNKNOWN_SNAPSHOT_VERSION`). Live
  `reportCardSignatories` is never consulted at publication.

- **Promotion is not a publication precondition and does not trigger reissue.** V1's
  final academic result is PASS/FAIL; promotion is outside V1. (This resolves the
  earlier contradiction and supersedes the **DR-11** clause that required publication
  to wait on a pending promotion action, and the promotion-decision → versioned
  reissue coupling.)
- Published cards are immutable. Corrections to frozen rendered data create a NEW
  version; the old version is preserved (`supersedesReportCardId`, `reissueReason`).
- `@@unique([schoolId, academicSessionId, studentId, version])`.
- Manual academic PASS/FAIL override and promotion are **separate future audited
  decision models** (DR-12). They are outside V1.

### 8a. Immutable snapshot contract

The frozen snapshot is the complete rendered report. It is versioned; `v2` is the
current contract and extends the original academic-only `v1` payload with the
human-readable identity a report card is rendered from, so a printed or archived
document never reaches back to mutable live rows.

Canonical `v2` payload (`schemaVersion: 2`):

- school identity — the canonical branding projection (`schoolId` plus the
  `SchoolBranding` fields: name, tagline, short name, phone, email, address, city,
  state, postal code, country);
- student identity — id, admission number, first/middle/last name;
- session, class and section — ids and frozen display names;
- applied scheme/policy — id, scope, aggregation/absence policy, overall pass mode,
  annual subject pass percent, `overallPassPercent`, `maxFailedSubjects`, canonical
  `coreSubjectIds`, grade bands, and the weighted exam list;
- each resolved concrete exam — exam type id/name, concrete exam id/name, start and
  end dates, resolution status and reason;
- per-subject results — id, name, core flag, outcome, percentage, grade, reason,
  included/excluded/absent exam ids, and each per-exam mark (max, obtained, status);
- the overall result — result, percentage, failed count, resolved-subject count,
  requires-review flag;
- the validated **signatories** (`{ role, name }[]`), in configured order.

**Frozen vs. deferred.** The signatories are frozen at freeze time, from the tenant's
validated configuration, and publication binds to exactly those frozen values (never
live settings). **Attendance, remarks, and any issue/document date are deliberately
absent from `v2`**: they are deferred until their policies are specified, and a card
frozen before issuance must never claim an issue date. Missing remarks therefore cannot
block publication. The original academic-only `v1` payload remains readable; a card
frozen under `v1` (or with no snapshot) is never retro-fitted — it keeps its
academic-only lifecycle, and only newly generated cards carry `v2`.

**Unknown versions fail closed.** A snapshot whose `schemaVersion` is neither `1` nor
`2` blocks publication rather than being interpreted optimistically.

**Signatory acceptance rule.** Exactly one rule validates signatories, shared by the
generation gate and the publication gate: a non-empty array (at most
`MAX_REPORT_CARD_SIGNATORIES` = 4) of `{ role, name }` objects whose fields are
non-empty after trimming. Absent or empty is `MISSING`; anything else is `CORRUPT`.
Because both gates share it, a card can never be generated or published with
signatories the other step would reject.

**Print layout (locked for V1).** Unframed printing is the V1 default. One readable A4
portrait page is preferred, but additional pages are allowed rather than clipping or
shrinking content.

**Canonical serialization / hash:** serialize with stable key ordering, explicit null
handling, and decimals as canonical strings (never binary floats), UTF-8 encoded;
`snapshotHash = sha256(canonical_payload)`. The hash covers exactly the frozen rendered
data above. **Mutable workflow and PDF-artifact metadata (version status, timestamps,
uploader/confirmer identity, storage key, file checksum) are excluded from
`snapshotHash`.** Any change to frozen rendered data produces a new version and a new
`snapshotHash`.

## 9. PDF archive workflow

The structured snapshot is the source of truth; the PDF is a preserved artifact bound
to the exact frozen version.

Version states: `DRAFT` → `PENDING_ARCHIVE` → `ISSUED` → `SUPERSEDED` / `VOID`.

PDF archiving is **required by default** and is **per-school configurable through an
authorized, audited setting** (`requireReportCardPdfArchive`); changing it is an
audited action.

1. Generate and freeze a versioned structured snapshot; compute its canonical
   `snapshotHash`.
2. Render the **exact frozen version** through the existing browser print pipeline.
3. An authorized actor saves it as PDF, uploads it, and **confirms the PDF visually
   matches the frozen version**.
4. The server validates: `%PDF-` magic bytes (not the claimed MIME/filename), size
   bounds, the PDF's own sha256 checksum, authenticated actor, tenant-bound key.
5. **When PDF archiving is required by school policy, the card is not issued until a
   valid matching artifact is attached.**
6. Any change to the frozen academic snapshot requires a new version and a new archive;
   an existing artifact is never mutated or rebound.
7. Parents access only their child's `ISSUED` version PDF via an authenticated,
   tenant-scoped route.

Artifact record binds `(reportCardId, version, snapshotHash, storageKey, sha256,
byteSize, uploadedBy/At, confirmedBy/At)`. Storage key:
`report-cards/<schoolId>/<sessionId>/<studentId>/v<n>.pdf` (permitted by
`assertSafeKey`).

**Checksum validation proves file integrity, not visual correspondence.** Visual
correspondence is attested by the authorized human confirmation, which is recorded;
the system cannot verify it automatically. A claimed MIME type or filename is not proof
a file is a valid PDF.

**What validation proves / does not prove.** Server validation proves: the file is a
well-formed PDF (signature/magic bytes), its integrity and size (checksum), tenant
binding, and the `reportCardId`/version/`snapshotHash` association. It does **not**
prove visual correctness — that is only attested by the authorized human confirmation
and is recorded as such.

Failure/retry: the version stays `PENDING_ARCHIVE`; retries re-upload; no issue until a
valid artifact exists. Cancellation discards a draft; an issued version can only be
`VOID`/superseded, never deleted.

Per-student workload: the manual workflow costs one save→upload→confirm per student;
server-side generation (Option A) would be automatic but requires a headless
Chromium/deployment dependency and is **not introduced without explicit approval**.
Browser printing alone does not archive the PDF.

### 9a. Snapshot-only issue (archiving disabled)

When a school disables PDF archiving (`requireReportCardPdfArchive = false`):

- Issuance does not wait on any PDF artifact; the version issues from the frozen
  structured snapshot.
- The issued record is **clearly labelled as having no archived PDF**.
- The parent portal serves a **regenerated** view/print of the issued snapshot; there
  is **no archived PDF**, and the system must never claim one was archived, imply that
  a PDF is filed, or show a "download filed PDF" affordance.
- If archiving is later enabled, a new version (or an explicit archive action on the
  existing version) is required; an artifact is never retro-attached to a snapshot
  without the same validation and human confirmation.

## 10. Portal

- Exposes ONLY `ISSUED` published cards for the guardian's linked children.
- Never exposes drafts or other tenants.

## 11. Proposed data-model additions

`ReportCardScheme`, `ReportCardSchemeExam` (weighted, per Design B), `ReportCard`
(versioned) + `ReportCardSubject` (frozen per-subject values/outcomes),
`ReportCardExamResolution` (resolved exam ids/outcomes), `ReportCardArtifact` (PDF +
hash + metadata), `ExamMark.status`. See `docs/academic-calendar.md` for
`StudentEnrollmentPeriod`, `AttendanceRegister`, `Student.leftAt`, and the calendar
models.

## 12. Permissions

Active V1 codes: `report-cards:view`, `report-cards:generate`, `report-cards:publish`,
`report-cards:archive`, `report-cards:manage-schemes` (plus existing data permissions;
printing is reading only).

`report-cards:manage-schemes` guards scheme configuration
(`PUT /api/v1/report-card-schemes`). It is deliberately **separate from
`report-cards:generate`** so that generating a card never implies the ability to change
the aggregation rules a card is generated under. Granted to `SUPER_ADMIN`,
`SCHOOL_ADMIN`, and `PRINCIPAL`.

`report-cards:override` is **future-only — not an active V1 permission or grant**,
because manual academic-result decisions are outside V1.

## 13. Configurable values (no invented defaults)

`requireReportCardPdfArchive` (default true; authorized, audited setting) ·
`annualSubjectPassPercent` ·
`overallPassMode` · `overallPassPercent` · `maxFailedSubjects` · `coreSubjectIds` ·
scheme exam weights · aggregation policy · absence policy · publication mode.
Attendance has **no publication threshold**; it is display-only.

Missing required configuration is documented as a **blocker**, never guessed.

## 14. Out of scope / future

Co-scholastic, behaviour, health metrics, board compliance, manual academic override,
promotion decisions, server-side PDF generation, advanced notification delivery.

## 15. Open policy choices requiring school input

1. Confirm the exact `annualSubjectPassPercent`, `overallPassPercent`,
   `maxFailedSubjects`, `coreSubjectIds`, scheme weights, and absence policy.
2. Confirm whether PDF archiving is mandatory or relaxed per school policy.
3. Remark authorship (class teacher / principal names) and issue-date snapshot source.

## 16. Dependency checklist

- Prisma models + migration (neither authored here).
- Permissions catalog + role grants.
- Calendar/register/period services (permissions `calendar:manage`,
  `enrollment:history:manage` per `docs/academic-calendar.md`).
- Annual aggregation + scheme resolution.
- Report-card generation, versioning, snapshot hashing.
- PDF archive (storage `put`/`get`, magic-byte + checksum validation).
- API routes/controllers under `/api/v1`.
- Frontend pages + print document registration.
- Tests: unit, print source-contract, integration.
- Validation: `npm run lint`/`typecheck`/`build`/`build:server`/`test`.

## 17. Result Sheet and attendance safety

The Result Sheet and its rounding, aggregate and completeness semantics are unchanged.
Existing attendance marking and summary behaviour are unchanged except where the
calendar/register model is explicitly added. Manual academic results and promotion are
outside V1.
