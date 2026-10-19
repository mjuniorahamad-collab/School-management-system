import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError, serviceUnavailableError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockReportCardStudentScopeForUpdate, lockStudentEnrollmentForUpdate } from "../../lib/db-locks.js"
import { readBranding, readReportCardSignatories, readRequireReportCardPdfArchive } from "../../lib/school-settings.js"
import type { GenerateReportCardInput, ListReportCardsInput } from "./report-card.api.schema.js"
import { computeAnnualReport } from "./report-card.aggregation.js"
import { findReportCardArchive } from "./report-card.artifact.service.js"
import {
  reportCardArchiveMismatchError,
  reportCardArchiveRequiredError,
  reportCardDraftExistsError,
  reportCardGenerationBlockedError,
  reportCardInvalidStateError,
  reportCardNotFoundError,
  reportCardNotPublishableError,
  reportCardReissueReasonRequiredError,
  reportCardSchemeNotFoundError,
  reportCardSignatoriesInvalidError,
  reportCardSignatoriesRequiredError,
} from "./report-card.errors.js"
import { resolveSchemeExams } from "./report-card.resolution.js"
import { hashSnapshot } from "./report-card.snapshot.js"
import {
  buildSnapshotV2,
  validateFrozenSignatories,
  type ReportCardSnapshotExamResolution,
  type ReportCardSnapshotSubject,
} from "./report-card.snapshot-v2.js"
import type {
  AnnualSubjectInput,
  ExamInstanceInput,
  ExamResolution,
  MarkStatus,
  StudentExamResultRow,
  SubjectExamMark,
} from "./report-card.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = Prisma.TransactionClient

/** The acting identity generation is attributed to. */
export interface ReportCardActor {
  schoolId: string
  userId: string
  name: string
  email: string
  roles: readonly string[]
}

const STUDENT_SUMMARY_SELECT = {
  id: true,
  admissionNumber: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.StudentSelect

const REPORT_CARD_DETAIL_INCLUDE = {
  student: { select: STUDENT_SUMMARY_SELECT },
  subjects: true,
  examResolutions: true,
} satisfies Prisma.ReportCardInclude

const REPORT_CARD_SCHEME_INCLUDE = {
  exams: {
    orderBy: { sortOrder: "asc" as const },
    include: { examType: { select: { name: true } } },
  },
} satisfies Prisma.ReportCardSchemeInclude

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw serviceUnavailableError("Database is not configured")
  return prisma
}

/** Deterministic string ordering (independent of locale). */
function byString(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Resolves a required display label for the frozen snapshot, failing closed when
 * it is absent. A report card must never freeze a raw id (or a blank string)
 * where a human-readable name belongs, so a missing label blocks generation
 * rather than silently degrading a printed document.
 */
function requireLabel(
  labels: ReadonlyMap<string, string>,
  id: string,
  what: string,
): string {
  const label = labels.get(id)?.trim()
  if (!label) throw reportCardGenerationBlockedError(`Report card ${what} is missing a name`)
  return label
}

/** Formats a `@db.Date` value as a canonical `YYYY-MM-DD` snapshot string. */
function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/**
 * Projects a persisted ExamMark to the engine's MarkStatus. Legacy rows predate
 * the status column (`isAbsent`) and are honoured here; a SCORED row with no
 * value stays SCORED so the engine treats it as missing data (§4).
 */
function toMarkStatus(mark: { status: MarkStatus; isAbsent: boolean }): MarkStatus {
  if (mark.status === "NOT_APPLICABLE") return "NOT_APPLICABLE"
  if (mark.status === "PENDING") return "PENDING"
  if (mark.status === "ABSENT" || mark.isAbsent) return "ABSENT"
  return "SCORED"
}

/**
 * Builds the actionable diagnostic for a scheme exam that did not resolve to a
 * concrete FINAL exam. Generation requires every scheme exam to be RESOLVED so a
 * NOT_FINAL exam can never be silently omitted and produce a misleading PASS —
 * for RAW and PERCENTAGE_WEIGHTED alike (docs/report-card.md §3, §8).
 */
function describeUnresolvedExams(
  unresolved: readonly ExamResolution[],
  nameByExamTypeId: ReadonlyMap<string, string>,
): string {
  const details = unresolved
    .map((entry) => {
      const label = nameByExamTypeId.get(entry.examTypeId) ?? entry.examTypeId
      const state = entry.reason ? `${entry.status} (${entry.reason})` : entry.status
      return `${label}: ${state}`
    })
    .join("; ")
  return `Report card generation requires every scheme exam to be resolved. Unresolved exams: ${details}`
}

/**
 * Resolves the scheme for a student placement (§2): a section-specific scheme
 * (`sectionId != null`) takes precedence over the class-level scheme.
 */
async function findScheme(
  tx: DbClient,
  opts: {
    schoolId: string
    academicSessionId: string
    classId: string
    sectionId: string | null
  },
): Promise<Prisma.ReportCardSchemeGetPayload<{ include: typeof REPORT_CARD_SCHEME_INCLUDE }> | null> {
  if (opts.sectionId) {
    const sectionScheme = await tx.reportCardScheme.findFirst({
      where: {
        schoolId: opts.schoolId,
        academicSessionId: opts.academicSessionId,
        classId: opts.classId,
        sectionId: opts.sectionId,
      },
      include: REPORT_CARD_SCHEME_INCLUDE,
    })
    if (sectionScheme) return sectionScheme
  }
  return tx.reportCardScheme.findFirst({
    where: {
      schoolId: opts.schoolId,
      academicSessionId: opts.academicSessionId,
      classId: opts.classId,
      sectionId: null,
    },
    include: REPORT_CARD_SCHEME_INCLUDE,
  })
}

export async function generateReportCard(input: GenerateReportCardInput, actor: ReportCardActor) {
  const prisma = await requirePrisma()
  try {
    return await prisma.$transaction((tx) => generateInTransaction(tx, input, actor))
  } catch (error) {
    // Concurrent generations for the same (school, session, student) serialize
    // on the enrollment anchor inside the transaction, so the loser re-reads the
    // winner's committed DRAFT and fails the draft check with the proper domain
    // error. This P2002 mapping is the safety net for the version-unique race
    // that remains possible if the anchor is ever bypassed (e.g. inserts issued
    // outside this transaction); it never blindly retries into another draft
    // version.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw reportCardDraftExistsError()
    }
    throw error
  }
}

async function generateInTransaction(
  tx: DbClient,
  input: GenerateReportCardInput,
  actor: ReportCardActor,
) {
  const schoolId = actor.schoolId

  const student = await tx.student.findFirst({
    where: { id: input.studentId, schoolId },
    // The v2 snapshot freezes the identity the report card prints, so the
    // generation read must carry the name and admission number it will freeze.
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  })
  if (!student) throw notFoundError("Student not found")

  // Serialize concurrent generation for this (school, session, student) scope
  // BEFORE reading anything eligibility- or version-related. The student scope
  // lock cannot do this — it locks only ReportCard rows that already exist, and
  // a student's first generation has none. The enrollment row always exists
  // here and is never deleted, so it is the anchor that makes the whole
  // read-validate-create critical section serial for this scope. Held until
  // commit/rollback (see lockStudentEnrollmentForUpdate in db-locks.ts).
  await lockStudentEnrollmentForUpdate(tx, {
    studentId: input.studentId,
    academicSessionId: input.academicSessionId,
  })

  const enrollment = await tx.studentEnrollment.findFirst({
    where: {
      studentId: input.studentId,
      academicSessionId: input.academicSessionId,
      student: { schoolId },
    },
    select: { id: true, classId: true, sectionId: true },
  })
  if (!enrollment) {
    throw badRequestError("Student is not enrolled in the requested academic session")
  }
  if (enrollment.classId !== input.classId) {
    throw badRequestError("Student placement does not match the requested class")
  }
  if (input.sectionId && enrollment.sectionId && input.sectionId !== enrollment.sectionId) {
    throw badRequestError("Student placement does not match the requested section")
  }
  const sectionId = input.sectionId ?? enrollment.sectionId ?? null

  // v2 freezes display names, not just ids, so resolve the placement labels now
  // and fail closed if a referenced row is missing: a report card must never
  // freeze a raw id (or a blank label) where a human-readable name belongs.
  const session = await tx.academicSession.findFirst({
    where: { id: input.academicSessionId, schoolId },
    select: { id: true, name: true },
  })
  if (!session) {
    throw reportCardGenerationBlockedError("Report card references an academic session that no longer exists")
  }

  const classRecord = await tx.class.findFirst({
    where: { id: enrollment.classId, schoolId },
    select: { id: true, name: true },
  })
  if (!classRecord) {
    throw reportCardGenerationBlockedError("Report card references a class that no longer exists")
  }

  const sectionRecord = sectionId
    ? await tx.section.findFirst({
        where: { id: sectionId, classId: enrollment.classId },
        select: { id: true, name: true },
      })
    : null
  if (sectionId && !sectionRecord) {
    throw reportCardGenerationBlockedError("Report card references a section that no longer exists")
  }

  // Generation is not idempotent while a draft is active: return a clear conflict
  // instead of silently accumulating duplicate DRAFT versions for the same
  // (school, session, student). This read is authoritative: it runs under the
  // enrollment anchor, so no concurrent generation can commit a DRAFT between
  // here and the version/supersession reads below. Issued/superseded versions
  // are untouched and may still be followed by a new draft.
  const activeDraft = await tx.reportCard.findFirst({
    where: {
      schoolId,
      academicSessionId: input.academicSessionId,
      studentId: input.studentId,
      status: "DRAFT",
    },
    orderBy: { version: "desc" },
    select: { id: true, version: true },
  })
  if (activeDraft) throw reportCardDraftExistsError(activeDraft.version)

  const scheme = await findScheme(tx, {
    schoolId,
    academicSessionId: input.academicSessionId,
    classId: enrollment.classId,
    sectionId,
  })
  if (!scheme) throw reportCardSchemeNotFoundError()

  const examResults = await tx.examResult.findMany({
    where: {
      schoolId,
      studentId: input.studentId,
      exam: { academicSessionId: input.academicSessionId },
    },
    include: {
      exam: {
        select: { id: true, examTypeId: true, classId: true, sectionId: true, status: true },
      },
      marks: {
        include: { examSubject: { select: { subjectId: true, maxMarks: true } } },
      },
    },
  })

  const examInstances = await tx.exam.findMany({
    where: { schoolId, academicSessionId: input.academicSessionId },
    // name/startDate/endDate are frozen into the v2 snapshot so a printed card
    // never has to re-read the exam to label it.
    select: {
      id: true,
      examTypeId: true,
      classId: true,
      sectionId: true,
      status: true,
      name: true,
      startDate: true,
      endDate: true,
    },
  })
  const examInstanceById = new Map(examInstances.map((instance) => [instance.id, instance]))

  const schemeExamTypeIds = scheme.exams.map((exam) => exam.examTypeId)
  const resolution = resolveSchemeExams(schemeExamTypeIds, {
    studentClassId: enrollment.classId,
    studentSectionId: enrollment.sectionId ?? null,
    results: examResults.map<StudentExamResultRow>((row) => ({
      examId: row.examId,
      examTypeId: row.exam.examTypeId,
      classId: row.exam.classId,
      sectionId: row.exam.sectionId,
    })),
    instances: examInstances.map<ExamInstanceInput>((instance) => ({
      id: instance.id,
      examTypeId: instance.examTypeId,
      classId: instance.classId,
      sectionId: instance.sectionId,
      status: instance.status,
    })),
  })

  // A NOT_FINAL (or ambiguous/missing) scheme exam blocks generation, uniformly
  // for every aggregation policy. Excluding it from the subject set could yield a
  // misleading PASS; missing weights must never be the only thing that blocks.
  const unresolved = resolution.resolutions.filter((entry) => entry.status !== "RESOLVED")
  if (unresolved.length > 0) {
    const nameByExamTypeId = new Map(
      scheme.exams.map((exam) => [exam.examTypeId, exam.examType.name]),
    )
    throw reportCardGenerationBlockedError(describeUnresolvedExams(unresolved, nameByExamTypeId))
  }

  const resolvedExamIds = resolution.resolutions
    .flatMap((entry) => (entry.status === "RESOLVED" && entry.examId ? [entry.examId] : []))

  // Expected subjects are the union of ExamSubject rows across the resolved
  // concrete exams. A subject with no ExamMark row is a missing-data problem
  // and is projected to PENDING — it is never silently treated as ABSENT/zero.
  const examSubjects = resolvedExamIds.length
    ? await tx.examSubject.findMany({
        where: { examId: { in: resolvedExamIds } },
        select: { examId: true, subjectId: true, maxMarks: true },
      })
    : []

  const markByKey = new Map<string, { status: MarkStatus; obtainedMarks: string | null }>()
  for (const result of examResults) {
    if (!resolvedExamIds.includes(result.examId)) continue
    for (const mark of result.marks) {
      markByKey.set(`${result.examId}::${mark.examSubject.subjectId}`, {
        status: toMarkStatus(mark),
        obtainedMarks: mark.obtainedMarks === null ? null : mark.obtainedMarks.toString(),
      })
    }
  }

  const subjectMarks = new Map<string, SubjectExamMark[]>()
  for (const examSubject of examSubjects) {
    const key = `${examSubject.examId}::${examSubject.subjectId}`
    const persisted = markByKey.get(key)
    const mark: SubjectExamMark = {
      examId: examSubject.examId,
      status: persisted ? persisted.status : "PENDING",
      obtainedMarks: persisted ? persisted.obtainedMarks : null,
      maxMarks: examSubject.maxMarks.toString(),
    }
    const marks = subjectMarks.get(examSubject.subjectId)
    if (marks) marks.push(mark)
    else subjectMarks.set(examSubject.subjectId, [mark])
  }

  const subjects: AnnualSubjectInput[] = [...subjectMarks.entries()]
    .map(([subjectId, marks]) => ({
      subjectId,
      isCore: scheme.coreSubjectIds.includes(subjectId),
      marks: [...marks].sort((a, b) => byString(a.examId, b.examId)),
    }))
    .sort((a, b) => byString(a.subjectId, b.subjectId))

  const gradingBands = await tx.gradingBand.findMany({
    where: { schoolId },
    select: { minPercent: true, maxPercent: true, grade: true },
    orderBy: { minPercent: "asc" },
  })

  // v2 freezes each subject's display name. Resolve them in one query and fail
  // closed on a dangling reference rather than freezing a bare subject id.
  const subjectIds = subjects.map((subject) => subject.subjectId)
  const subjectRows = subjectIds.length
    ? await tx.subject.findMany({
        where: { id: { in: subjectIds }, schoolId },
        select: { id: true, name: true },
      })
    : []
  const subjectNameById = new Map(subjectRows.map((row) => [row.id, row.name]))
  const examTypeNameById = new Map(
    scheme.exams.map((exam) => [exam.examTypeId, exam.examType.name]),
  )

  // The engine keys weights by concrete exam id (weights[mark.examId]); the
  // scheme stores them per exam type, so project each resolved exam's weight.
  const weightByExamType = new Map(
    scheme.exams.map((exam) => [exam.examTypeId, exam.weight.toString()]),
  )
  const examWeights: Record<string, string> = {}
  for (const entry of resolution.resolutions) {
    if (entry.status !== "RESOLVED" || entry.examId === null) continue
    const weight = weightByExamType.get(entry.examTypeId)
    if (weight !== undefined) examWeights[entry.examId] = weight
  }

  const computation = computeAnnualReport({
    subjects,
    examWeights,
    policy: {
      aggregationPolicy: scheme.aggregationPolicy,
      absencePolicy: scheme.absencePolicy,
      overallPassMode: scheme.overallPassMode,
      annualSubjectPassPercent: scheme.annualSubjectPassPercent.toString(),
      overallPassPercent: scheme.overallPassPercent?.toString() ?? null,
      maxFailedSubjects: scheme.maxFailedSubjects,
      coreSubjectIds: scheme.coreSubjectIds,
      gradingBands,
    },
  })

  const blocker = computation.blockers[0] ?? computation.configurationErrors[0]
  if (blocker) throw reportCardGenerationBlockedError(blocker)

  const previous = await tx.reportCard.findFirst({
    where: {
      schoolId,
      academicSessionId: input.academicSessionId,
      studentId: input.studentId,
    },
    orderBy: { version: "desc" },
    select: { id: true, version: true, status: true },
  })
  const version = (previous?.version ?? 0) + 1

  // Correcting an already-published version is a NEW version (docs/report-card.md
  // §8): it must record an explicit reissue reason. The superseded version keeps
  // its status here — the SUPERSEDED transition belongs to the subsequent issue
  // step, not to draft creation. First versions and drafts need no reason.
  const supersedesPublished =
    previous !== null && (previous.status === "PENDING_ARCHIVE" || previous.status === "ISSUED")
  if (supersedesPublished && !input.reissueReason) {
    throw reportCardReissueReasonRequiredError()
  }

  // v2 freezes the human-readable identity the report card is rendered from.
  // The signatory configuration is required: an unset/empty list blocks
  // generation (a report card nobody can sign is not issuable), and a corrupt
  // list is surfaced distinctly so it can be corrected in Settings.
  const signatoryParse = await readReportCardSignatories(tx, schoolId)
  if (signatoryParse.status === "corrupt") throw reportCardSignatoriesInvalidError()
  if (signatoryParse.status !== "valid") throw reportCardSignatoriesRequiredError()

  const branding = await readBranding(tx, schoolId)

  const examResolutionSnapshots: ReportCardSnapshotExamResolution[] = []
  for (const entry of resolution.resolutions) {
    const instance = entry.examId ? examInstanceById.get(entry.examId) : undefined
    if (entry.status === "RESOLVED" && !instance) {
      throw reportCardGenerationBlockedError(
        "Report card references a resolved exam that could not be loaded",
      )
    }
    examResolutionSnapshots.push({
      examTypeId: entry.examTypeId,
      examTypeName: requireLabel(examTypeNameById, entry.examTypeId, "exam type"),
      examId: entry.examId,
      examName: instance?.name ?? null,
      examStartDate: instance ? toDateString(instance.startDate) : null,
      examEndDate: instance ? toDateString(instance.endDate) : null,
      status: entry.status,
      reason: entry.reason,
    })
  }

  const subjectSnapshots: ReportCardSnapshotSubject[] = computation.subjects.map((subject) => ({
    subjectId: subject.subjectId,
    subjectName: requireLabel(subjectNameById, subject.subjectId, "subject"),
    isCore: subject.isCore,
    outcome: subject.outcome,
    percentage: subject.percentage,
    grade: subject.grade,
    reason: subject.reason,
    includedExamIds: [...subject.includedExamIds],
    excludedExamIds: [...subject.excludedExamIds],
    absentExamIds: [...subject.absentExamIds],
    marks: (subjectMarks.get(subject.subjectId) ?? []).map((mark) => ({
      examId: mark.examId,
      maxMarks: mark.maxMarks,
      obtainedMarks: mark.obtainedMarks,
      status: mark.status,
    })),
  }))

  const snapshot = buildSnapshotV2({
    schoolId,
    studentId: input.studentId,
    academicSessionId: input.academicSessionId,
    classId: enrollment.classId,
    sectionId,
    school: { id: schoolId, ...branding },
    student: {
      id: student.id,
      admissionNumber: student.admissionNumber,
      firstName: student.firstName,
      middleName: student.middleName,
      lastName: student.lastName,
    },
    session: { id: session.id, name: session.name },
    class: { id: classRecord.id, name: classRecord.name },
    section: sectionRecord ? { id: sectionRecord.id, name: sectionRecord.name } : null,
    scheme: {
      id: scheme.id,
      scopeKey: scheme.scopeKey,
      aggregationPolicy: scheme.aggregationPolicy,
      absencePolicy: scheme.absencePolicy,
      overallPassMode: scheme.overallPassMode,
      annualSubjectPassPercent: scheme.annualSubjectPassPercent.toString(),
      overallPassPercent: scheme.overallPassPercent?.toString() ?? null,
      maxFailedSubjects: scheme.maxFailedSubjects,
      coreSubjectIds: [...scheme.coreSubjectIds],
      gradingBands: gradingBands.map((band) => ({
        minPercent: band.minPercent,
        maxPercent: band.maxPercent,
        grade: band.grade,
      })),
      exams: scheme.exams.map((exam) => ({
        examTypeId: exam.examTypeId,
        weight: exam.weight.toString(),
      })),
    },
    examResolutions: examResolutionSnapshots,
    subjects: subjectSnapshots,
    overall: {
      result: computation.overallResult,
      percentage: computation.overallPercentage,
      failedCount: computation.failedCount,
      resolvedSubjectCount: computation.resolvedSubjectCount,
      requiresReview: computation.requiresReview,
    },
    signatories: signatoryParse.signatories,
  })
  const snapshotHash = hashSnapshot(snapshot)

  const created = await tx.reportCard.create({
    data: {
      schoolId,
      academicSessionId: input.academicSessionId,
      studentId: input.studentId,
      enrollmentId: enrollment.id,
      classId: enrollment.classId,
      sectionId,
      version,
      overallResult: computation.overallResult,
      overallPercentage: computation.overallPercentage,
      failedCount: computation.failedCount,
      resolvedSubjectCount: computation.resolvedSubjectCount,
      requiresReview: computation.requiresReview,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      snapshotHash,
      supersedesReportCardId: previous?.id ?? null,
      reissueReason: supersedesPublished ? (input.reissueReason ?? null) : null,
      createdByUserId: actor.userId,
      subjects: {
        create: computation.subjects.map((subject) => ({
          subjectId: subject.subjectId,
          isCore: subject.isCore,
          outcome: subject.outcome,
          percentage: subject.percentage,
          grade: subject.grade,
          reason: subject.reason,
          includedExamIds: subject.includedExamIds,
          excludedExamIds: subject.excludedExamIds,
          absentExamIds: subject.absentExamIds,
        })),
      },
      examResolutions: {
        create: resolution.resolutions.map((entry) => ({
          examTypeId: entry.examTypeId,
          examId: entry.examId,
          status: entry.status,
          reason: entry.reason,
        })),
      },
    },
    include: REPORT_CARD_DETAIL_INCLUDE,
  })

  return created
}

export async function listReportCards(query: ListReportCardsInput, schoolId: string) {
  const prisma = await requirePrisma()

  const where: Prisma.ReportCardWhereInput = { schoolId }
  if (query.studentId) where.studentId = query.studentId
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.status) where.status = query.status

  const { page, pageSize } = query
  const [total, rows] = await prisma.$transaction([
    prisma.reportCard.count({ where }),
    prisma.reportCard.findMany({
      where,
      include: { student: { select: STUDENT_SUMMARY_SELECT } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows,
    total,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getReportCard(id: string, schoolId: string) {
  const prisma = await requirePrisma()
  const card = await prisma.reportCard.findFirst({
    where: { id, schoolId },
    include: REPORT_CARD_DETAIL_INCLUDE,
  })
  if (!card) throw reportCardNotFoundError()
  return card
}

/**
 * Why a frozen card cannot be published, in machine-readable form. `reason` is
 * attached to the `REPORT_CARD_NOT_PUBLISHABLE` error details so a client can
 * distinguish a snapshot-integrity failure from a card that is simply not
 * academically ready.
 */
export type PublicationBlockReason =
  | "FROZEN_SIGNATORIES_MISSING"
  | "FROZEN_SIGNATORIES_CORRUPT"
  | "UNKNOWN_SNAPSHOT_VERSION"

interface PublicationBlocker {
  message: string
  reason?: PublicationBlockReason
}

/** The frozen, already-computed values publication is validated against. */
interface FrozenCardForPublication {
  overallResult: string | null
  requiresReview: boolean
  examResolutions: readonly { status: string }[]
  subjects: readonly { outcome: string }[]
  snapshot?: unknown
}

/**
 * Evaluates the frozen snapshot's signatories, honouring the v1→v2 transition:
 * a legacy card (v1, or no snapshot at all) keeps its academic-only lifecycle, a
 * v2 card must carry a valid frozen signatory list, and an unrecognized version
 * fails closed. Live settings are never consulted — publication binds to exactly
 * what was frozen at generation time.
 */
function describeFrozenSignatoryBlocker(snapshot: unknown): PublicationBlocker | null {
  if (snapshot === null || snapshot === undefined) return null
  if (typeof snapshot !== "object") {
    return {
      message: "Report card cannot be published: its frozen snapshot is unreadable",
      reason: "UNKNOWN_SNAPSHOT_VERSION",
    }
  }
  const version = (snapshot as { schemaVersion?: unknown }).schemaVersion
  if (version === 1) return null
  if (version === 2) {
    const result = validateFrozenSignatories((snapshot as { signatories?: unknown }).signatories)
    if (result.ok) return null
    return result.reason === "MISSING"
      ? {
          message: "Report card cannot be published: the frozen snapshot has no signatories",
          reason: "FROZEN_SIGNATORIES_MISSING",
        }
      : {
          message: "Report card cannot be published: the frozen snapshot signatories are invalid",
          reason: "FROZEN_SIGNATORIES_CORRUPT",
        }
  }
  return {
    message: `Report card cannot be published: unrecognized snapshot version ${String(version)}`,
    reason: "UNKNOWN_SNAPSHOT_VERSION",
  }
}

/**
 * Returns the first §8 academic precondition the frozen card fails, or null when
 * it is publishable. This reads only the values frozen at generation time
 * (overall result, exam resolutions, subject outcomes) plus, for a v2 snapshot,
 * the frozen signatories — it never re-reads marks, exams or live settings and
 * never recomputes the result, so publication can never disagree with the
 * immutable snapshot.
 */
function describePublicationBlocker(card: FrozenCardForPublication): PublicationBlocker | null {
  if (card.overallResult !== "PASS" && card.overallResult !== "FAIL") {
    return {
      message: `Report card overall result is ${card.overallResult ?? "unresolved"}; it must be PASS or FAIL before publication`,
    }
  }
  if (card.requiresReview) {
    return { message: "Report card data still requires review and cannot be published" }
  }
  const unresolvedExams = card.examResolutions.filter((entry) => entry.status !== "RESOLVED")
  if (unresolvedExams.length > 0) {
    return {
      message: `Report card cannot be published: ${unresolvedExams.length} scheme exam(s) are not resolved`,
    }
  }
  const reviewSubjects = card.subjects.filter((subject) => subject.outcome === "REQUIRES_REVIEW")
  if (reviewSubjects.length > 0) {
    return {
      message: `Report card cannot be published: ${reviewSubjects.length} subject(s) require review`,
    }
  }
  return describeFrozenSignatoryBlocker(card.snapshot)
}

/**
 * Publishes a frozen DRAFT version (docs/report-card.md §8): DRAFT →
 * PENDING_ARCHIVE, stamping `publishedAt`/`publishedByUserId`. Publication never
 * issues the card: it always parks at PENDING_ARCHIVE, and issuing waits for an
 * attached PDF archive when the tenant's archive policy requires one (§9).
 *
 * Preconditions are validated against the STORED frozen snapshot, never
 * recalculated from live marks.
 *
 * Serialization: like issue, the whole read-validate-flip runs in one
 * transaction that takes the student-scope row lock FIRST, so concurrent
 * publish/issue/attach calls for the same scope queue up and re-read committed
 * state instead of interleaving. The status-guarded update still closes the
 * transition, and a concurrent publish that finds the card already moved
 * reports the invalid-state conflict rather than re-stamping `publishedAt`.
 * Publication performs no sibling demotion: a card only moves DRAFT →
 * PENDING_ARCHIVE, and superseding other versions stays with issue.
 */
export async function publishReportCard(id: string, actor: ReportCardActor) {
  const prisma = await requirePrisma()
  return prisma.$transaction((tx) => publishInTransaction(tx, id, actor))
}

async function publishInTransaction(tx: DbClient, id: string, actor: ReportCardActor) {
  const schoolId = actor.schoolId

  const scope = await tx.reportCard.findFirst({
    where: { id, schoolId },
    select: { academicSessionId: true, studentId: true },
  })
  if (!scope) throw reportCardNotFoundError()

  await lockReportCardStudentScopeForUpdate(tx, {
    schoolId,
    academicSessionId: scope.academicSessionId,
    studentId: scope.studentId,
  })

  const card = await tx.reportCard.findFirst({
    where: { id, schoolId },
    include: { subjects: true, examResolutions: true },
  })
  if (!card) throw reportCardNotFoundError()
  if (card.status !== "DRAFT") {
    throw reportCardInvalidStateError(
      `Only a draft report card can be published (current status: ${card.status})`,
    )
  }

  const blocker = describePublicationBlocker(card)
  if (blocker) {
    throw reportCardNotPublishableError(
      blocker.message,
      blocker.reason ? { reason: blocker.reason } : undefined,
    )
  }

  const updated = await tx.reportCard.updateMany({
    where: { id, schoolId, status: "DRAFT" },
    data: {
      status: "PENDING_ARCHIVE",
      publishedAt: new Date(),
      publishedByUserId: actor.userId,
    },
  })
  if (updated.count === 0) {
    throw reportCardInvalidStateError("Only a draft report card can be published")
  }

  const published = await tx.reportCard.findFirst({
    where: { id, schoolId },
    include: REPORT_CARD_DETAIL_INCLUDE,
  })
  if (!published) throw reportCardNotFoundError()
  return published
}

/**
 * Issues a published version (docs/report-card.md §9): PENDING_ARCHIVE →
 * ISSUED, stamping `issuedAt`, and demotes every other version of the same
 * (school, academic session, student) to SUPERSEDED so exactly one version is
 * ever ISSUED.
 *
 * Serialization: the student-scope row lock is taken FIRST, so concurrent
 * issue/attach/issue calls for the same scope queue up and re-read committed
 * state instead of interleaving (the loser sees the transition already applied).
 *
 * Archive gate: when the tenant's `requireReportCardPdfArchive` policy is on
 * (the default), a confirmed artifact bound to this card's exact `id`,
 * `version` and `snapshotHash` is required before the flip — an archive can
 * never be presented as the record of a version it does not describe. With the
 * policy off (§9a) the card issues from its frozen snapshot alone and no
 * artifact is claimed.
 *
 * Repeating the call is idempotent: an already ISSUED card is returned without
 * re-stamping `issuedAt`.
 *
 * No audit row is written here: `AuditEntityType` has no `REPORT_CARD` value and
 * this milestone is migration-free. Who issued the version is recoverable from
 * `issuedAt`; lifecycle audit rows are added together with the VOID/portal work.
 */
export async function issueReportCard(id: string, actor: ReportCardActor) {
  const prisma = await requirePrisma()
  return prisma.$transaction((tx) => issueInTransaction(tx, id, actor))
}

async function issueInTransaction(tx: DbClient, id: string, actor: ReportCardActor) {
  const schoolId = actor.schoolId

  const scope = await tx.reportCard.findFirst({
    where: { id, schoolId },
    select: { academicSessionId: true, studentId: true },
  })
  if (!scope) throw reportCardNotFoundError()

  await lockReportCardStudentScopeForUpdate(tx, {
    schoolId,
    academicSessionId: scope.academicSessionId,
    studentId: scope.studentId,
  })

  const card = await tx.reportCard.findFirst({
    where: { id, schoolId },
    include: { subjects: true, examResolutions: true },
  })
  if (!card) throw reportCardNotFoundError()

  if (card.status === "ISSUED") return card
  if (card.status !== "PENDING_ARCHIVE") {
    throw reportCardInvalidStateError(
      `Only a published report card can be issued (current status: ${card.status})`,
    )
  }
  if (!card.snapshotHash) {
    throw reportCardInvalidStateError("Report card has no frozen snapshot to issue")
  }

  if (await readRequireReportCardPdfArchive(tx, schoolId)) {
    const artifact = await findReportCardArchive(tx, { reportCardId: card.id, schoolId })
    if (!artifact) throw reportCardArchiveRequiredError()
    // The lookup above is already filtered on all three values; these re-checks
    // keep the binding explicit (and catch a row written by older/foreign code).
    if (artifact.reportCardId !== card.id) throw reportCardArchiveMismatchError("REPORT_CARD")
    if (artifact.version !== card.version) throw reportCardArchiveMismatchError("VERSION")
    if (artifact.snapshotHash !== card.snapshotHash) {
      throw reportCardArchiveMismatchError("SNAPSHOT_HASH")
    }
    if (!artifact.confirmedAt) throw reportCardArchiveRequiredError()
  }

  const updated = await tx.reportCard.updateMany({
    where: { id: card.id, schoolId, status: "PENDING_ARCHIVE" },
    data: { status: "ISSUED", issuedAt: new Date() },
  })
  if (updated.count === 0) {
    const current = await tx.reportCard.findFirst({
      where: { id: card.id, schoolId },
      select: { status: true },
    })
    throw reportCardInvalidStateError(
      `Only a published report card can be issued (current status: ${current?.status ?? "unknown"})`,
    )
  }

  // Exactly one version may be ISSUED: demote every other published version of
  // this student's card. DRAFT siblings are untouched — a newer version in
  // preparation must not be discarded by issuing the current one.
  await tx.reportCard.updateMany({
    where: {
      schoolId,
      academicSessionId: card.academicSessionId,
      studentId: card.studentId,
      id: { not: card.id },
      status: { in: ["PENDING_ARCHIVE", "ISSUED"] },
    },
    data: { status: "SUPERSEDED" },
  })

  const issued = await tx.reportCard.findFirst({
    where: { id: card.id, schoolId },
    include: REPORT_CARD_DETAIL_INCLUDE,
  })
  if (!issued) throw reportCardNotFoundError()
  return issued
}
