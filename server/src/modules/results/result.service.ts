import { Prisma, type ExamMark } from "@prisma/client"
import { badRequestError, forbiddenError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { recordAudit } from "../audit-logs/audit-log.service.js"
import { isExamMarksScopedActor } from "../exams/exam.service.js"
import {
  canFinalizeExam,
  canReopenExam,
} from "../exams/exam.rules.js"
import { assertMarkStatusEntryAllowed } from "../report-cards/report-card.schema.js"
import type { MarkStatus } from "../report-cards/report-card.types.js"
import { requireActingTeacher } from "../tasks/task-validation.js"
import { toResultSheetExamMeta, toResultMarkCell, toResultSheetSubject } from "./result.mapper.js"
import {
  computeResultAggregate,
  deriveSubjectMark,
  resolveAggregateGrade,
  resolveMarkGrade,
  toNumber,
  type GradedMark,
  type GradingBandRule,
} from "./grading.js"
import { assignCompetitionRanks } from "./ranking.js"
import {
  bulkUpdateResultAggregates,
  bulkUpdateResultRanks,
  bulkUpsertExamMarks,
  type ExamMarkBulkRow,
  type ResultAggregateBulkRow,
} from "./result-bulk-writes.js"
import type { PutSubjectMarksInput, ResultSheetQuery } from "./result.schema.js"
import type {
  FinalizeResult,
  MarksSaveResult,
  ReopenResult,
  ResultSheet,
} from "./result.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type TransactionClient = Prisma.TransactionClient

interface ActorContext {
  schoolId: string
  userId: string
  roles: readonly string[]
  name: string
  email: string
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

type BandDb = Pick<TransactionClient, "gradingBand">

async function loadGradingBands(db: BandDb, schoolId: string): Promise<GradingBandRule[]> {
  const rows = await db.gradingBand.findMany({
    where: { schoolId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { minPercent: true, maxPercent: true, grade: true },
  })
  return rows.map((row) => ({ minPercent: row.minPercent, maxPercent: row.maxPercent, grade: row.grade }))
}

type SubjectConfig = { id: string; maxMarks: Prisma.Decimal; passMarks: Prisma.Decimal }

function subjectConfigMaps(rows: SubjectConfig[]): {
  maxBy: Map<string, number>
  passBy: Map<string, number>
} {
  const maxBy = new Map<string, number>()
  const passBy = new Map<string, number>()
  for (const row of rows) {
    maxBy.set(row.id, toNumber(row.maxMarks))
    passBy.set(row.id, toNumber(row.passMarks))
  }
  return { maxBy, passBy }
}

function decimalOrNull(value: number | null): Prisma.Decimal | null {
  return value === null ? null : new Prisma.Decimal(value)
}

/** Reads a nullable Decimal column into a plain number (null stays null). */
function decimalToNumberOrNull(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return toNumber(value)
}

/**
 * Resolves the effective `ExamMark.status` for one entry row (D1).
 *
 * An explicit `status` from the request is honoured as-is. When omitted, the
 * status is derived so the legacy `isAbsent`/`obtainedMarks` contract is
 * preserved and missing marks are never treated as zero or ABSENT
 * (docs/report-card.md §4):
 *
 *  - `isAbsent: true`                -> `ABSENT`   (absence policy unchanged);
 *  - `obtainedMarks` present         -> `SCORED`;
 *  - cleared cell (no marks, absent) -> `PENDING`  (missing data, not zero).
 */
function resolveMarkStatus(row: {
  status?: MarkStatus | null
  isAbsent?: boolean
  obtainedMarks?: number | null
}): MarkStatus {
  if (row.status) return row.status
  if (row.isAbsent) return "ABSENT"
  return row.obtainedMarks === null || row.obtainedMarks === undefined ? "PENDING" : "SCORED"
}

/**
 * Resolves the report-card scheme's core-subject ids for a concrete exam
 * placement (D1). The scheme is scoped `(schoolId, academicSessionId, classId,
 * sectionId?)`; a section-specific scheme takes precedence over the class-level
 * one (docs/report-card.md §2). Used only to reject `NOT_APPLICABLE` on a core
 * subject at entry (docs/report-card.md §4). Returns an empty set when no
 * scheme is configured for the placement, so entry is not blocked.
 */
async function loadCoreSubjectIds(
  db: BandDb & Pick<TransactionClient, "reportCardScheme">,
  placement: { schoolId: string; academicSessionId: string; classId: string; sectionId: string | null },
): Promise<ReadonlySet<string>> {
  if (placement.sectionId) {
    const sectionScheme = await db.reportCardScheme.findFirst({
      where: {
        schoolId: placement.schoolId,
        academicSessionId: placement.academicSessionId,
        classId: placement.classId,
        sectionId: placement.sectionId,
      },
      select: { coreSubjectIds: true },
    })
    if (sectionScheme) return new Set(sectionScheme.coreSubjectIds)
  }
  const classScheme = await db.reportCardScheme.findFirst({
    where: {
      schoolId: placement.schoolId,
      academicSessionId: placement.academicSessionId,
      classId: placement.classId,
      sectionId: null,
    },
    select: { coreSubjectIds: true },
  })
  return new Set(classScheme?.coreSubjectIds ?? [])
}

export async function getResultSheet(
  examId: string,
  schoolId: string,
  actor: ActorContext,
  query: ResultSheetQuery,
): Promise<ResultSheet> {
  const prisma = await requirePrisma()

  const exam = await prisma.exam.findFirst({
    where: { id: examId, schoolId },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      finalizedAt: true,
      startDate: true,
      endDate: true,
      academicSessionId: true,
      classId: true,
      sectionId: true,
      academicSession: { select: { name: true } },
      examType: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
    },
  })
  if (!exam) throw notFoundError("Exam not found")

  const scoped = isExamMarksScopedActor(actor.roles)
  const actingTeacherId = scoped ? await requireActingTeacher(prisma, actor) : null

  const subjectWhere: Prisma.ExamSubjectWhereInput = { examId }
  if (scoped && actingTeacherId) subjectWhere.teacherId = actingTeacherId
  const subjectRows = await prisma.examSubject.findMany({
    where: subjectWhere,
    include: {
      subject: { select: { code: true, name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { sortOrder: "asc" },
  })

  const rosterWhere: Prisma.StudentEnrollmentWhereInput = {
    academicSessionId: exam.academicSessionId,
    classId: exam.classId,
    ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
  }

  const page = query.page
  const pageSize = query.pageSize
  const [total, enrollments] = await prisma.$transaction([
    prisma.studentEnrollment.count({ where: rosterWhere }),
    prisma.studentEnrollment.findMany({
      where: rosterWhere,
      include: {
        student: {
          select: { id: true, admissionNumber: true, firstName: true, lastName: true },
        },
        examResults: {
          where: { examId },
          include: { marks: true },
        },
      },
      orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const rows = enrollments.map((enrollment) => {
    const result = enrollment.examResults[0] ?? null
    const markById = new Map<string, ExamMark>(
      (result?.marks ?? []).map((mark) => [mark.examSubjectId, mark]),
    )
    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.student.id,
      admissionNumber: enrollment.student.admissionNumber,
      studentName: [enrollment.student.firstName, enrollment.student.lastName]
        .filter(Boolean)
        .join(" "),
      marks: subjectRows.map((subject) => toResultMarkCell(markById.get(subject.id) ?? null, subject.id)),
      isComplete: result?.isComplete ?? false,
      totalObtained: result?.totalObtained?.toString() ?? null,
      totalMaxMarks: result?.totalMaxMarks?.toString() ?? null,
      totalPercentage: result?.totalPercentage?.toString() ?? null,
      grade: result?.grade ?? null,
      isPass: result?.isPass ?? null,
      rank: result?.rank ?? null,
    }
  })

  return {
    exam: toResultSheetExamMeta(exam),
    subjects: subjectRows.map((subject) =>
      toResultSheetSubject(
        subject,
        exam.status === "PUBLISHED" &&
          (actingTeacherId === null || subject.teacherId === actingTeacherId),
      ),
    ),
    rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    canFinalize: exam.status === "PUBLISHED",
    canReopen: exam.status === "FINAL",
  }
}

export async function putSubjectMarks(
  examId: string,
  examSubjectId: string,
  input: PutSubjectMarksInput,
  actor: ActorContext,
): Promise<MarksSaveResult> {
  const prisma = await requirePrisma()

  const exam = await prisma.exam.findFirst({
    where: { id: examId, schoolId: actor.schoolId },
    select: { id: true, status: true, academicSessionId: true, classId: true, sectionId: true },
  })
  if (!exam) throw notFoundError("Exam not found")
  if (exam.status !== "PUBLISHED") {
    throw badRequestError("Marks can only be entered for a published exam")
  }

  const examSubject = await prisma.examSubject.findFirst({
    where: { id: examSubjectId, examId },
    include: {
      subject: { select: { code: true, name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
  })
  if (!examSubject) throw notFoundError("Exam subject not found")

  const scoped = isExamMarksScopedActor(actor.roles)
  const actingTeacherId = scoped ? await requireActingTeacher(prisma, actor) : null
  if (actingTeacherId && examSubject.teacherId !== actingTeacherId) {
    throw forbiddenError("Teachers may only enter marks for their own subjects")
  }

  const enrollmentIds = [...new Set(input.rows.map((row) => row.enrollmentId))]
  const rosterWhere: Prisma.StudentEnrollmentWhereInput = {
    id: { in: enrollmentIds },
    academicSessionId: exam.academicSessionId,
    classId: exam.classId,
    ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
  }
  const enrollments = await prisma.studentEnrollment.findMany({
    where: rosterWhere,
    select: { id: true, studentId: true },
  })
  if (enrollments.length !== enrollmentIds.length) {
    throw badRequestError("One or more students are not enrolled in this exam's class/section")
  }
  const enrollmentById = new Map(enrollments.map((row) => [row.id, row]))

  const subjects = await prisma.examSubject.findMany({
    where: { examId },
    select: { id: true, maxMarks: true, passMarks: true },
  })
  const { maxBy, passBy } = subjectConfigMaps(subjects)
  const bands = await loadGradingBands(prisma, actor.schoolId)

  // D1: core-subject set for the exam's placement, used to reject
  // NOT_APPLICABLE on a core subject at entry (docs/report-card.md §4). An
  // empty set (no scheme configured) does not block entry.
  const coreSubjectIds = await loadCoreSubjectIds(prisma, {
    schoolId: actor.schoolId,
    academicSessionId: exam.academicSessionId,
    classId: exam.classId,
    sectionId: exam.sectionId,
  })
  const isCoreSubject = coreSubjectIds.has(examSubject.subjectId)

  const subjectMaxMarks = maxBy.get(examSubjectId) ?? 0
  for (const row of input.rows) {
    if (row.obtainedMarks !== null && row.obtainedMarks !== undefined && row.obtainedMarks > subjectMaxMarks) {
      throw badRequestError(
        `Obtained marks (${row.obtainedMarks}) cannot exceed the maximum marks (${subjectMaxMarks})`,
      )
    }
  }

  const saved = await prisma.$transaction(
    async (tx) => {
      const existingResults = await tx.examResult.findMany({
        where: { examId, enrollmentId: { in: enrollmentIds } },
        select: {
          id: true,
          enrollmentId: true,
          // The stored aggregate grade is read BEFORE the save so an unchanged
          // total keeps its historical grade (grade-history rule).
          grade: true,
          totalPercentage: true,
        },
      })
      const resultByEnrollment = new Map(existingResults.map((row) => [row.enrollmentId, row.id]))
      const storedAggregateByResultId = new Map(
        existingResults.map((row) => [
          row.id,
          {
            percentage: decimalToNumberOrNull(row.totalPercentage),
            grade: row.grade,
          },
        ]),
      )

      // One statement for every missing result instead of one per student. The
      // unique index on (examId, enrollmentId) makes skipDuplicates idempotent
      // against a concurrent create.
      const missing = enrollmentIds.filter((id) => !resultByEnrollment.has(id))
      if (missing.length > 0) {
        await tx.examResult.createMany({
          data: missing.map((enrollmentId) => {
            const enrollment = enrollmentById.get(enrollmentId)
            if (!enrollment) throw badRequestError("Student enrollment is not part of this exam")
            return {
              schoolId: actor.schoolId,
              examId,
              studentId: enrollment.studentId,
              enrollmentId,
            }
          }),
          skipDuplicates: true,
        })
        // createMany does not return rows, so re-read only the ones just created.
        const created = await tx.examResult.findMany({
          where: { examId, enrollmentId: { in: missing } },
          select: { id: true, enrollmentId: true },
        })
        for (const row of created) resultByEnrollment.set(row.enrollmentId, row.id)
      }

      // The marks of the touched results are read BEFORE the upsert: the read
      // carries two jobs — the base marks for the aggregate, and the STORED
      // grade/percentage of every mark (the history that must survive a
      // re-save). Reading afterwards would only see the values this save is
      // about to write.
      const targetResultIds = [
        ...new Set(
          enrollmentIds
            .map((id) => resultByEnrollment.get(id))
            .filter((id): id is string => typeof id === "string"),
        ),
      ]
      const marksForTouched = await tx.examMark.findMany({
        where: { examResultId: { in: targetResultIds } },
        select: {
          examResultId: true,
          examSubjectId: true,
          obtainedMarks: true,
          isAbsent: true,
          percentage: true,
          grade: true,
        },
      })
      const storedMarkByKey = new Map(
        marksForTouched.map((mark) => [
          `${mark.examResultId}:${mark.examSubjectId}`,
          {
            percentage: decimalToNumberOrNull(mark.percentage),
            grade: mark.grade,
          },
        ]),
      )
      const marksByResult = new Map<string, GradedMark[]>()
      for (const mark of marksForTouched) {
        const bucket = marksByResult.get(mark.examResultId) ?? []
        bucket.push({
          examSubjectId: mark.examSubjectId,
          obtainedMarks: mark.obtainedMarks === null ? null : toNumber(mark.obtainedMarks),
          isAbsent: mark.isAbsent,
        })
        marksByResult.set(mark.examResultId, bucket)
      }

      const markRows: ExamMarkBulkRow[] = []
      const touched: string[] = []
      for (const row of input.rows) {
        if (!enrollmentById.get(row.enrollmentId)) {
          throw badRequestError("Student enrollment is not part of this exam")
        }
        const resultId = resultByEnrollment.get(row.enrollmentId)
        if (!resultId) {
          throw badRequestError("Student enrollment is not part of this exam")
        }

        const obtained = row.obtainedMarks ?? null
        // D1: resolve the effective status, keeping isAbsent consistent with it.
        // ABSENT forces isAbsent=true; every other status forces isAbsent=false so
        // a NOT_APPLICABLE/PENDING/SCORED cell is never accidentally treated as an
        // absence by the aggregate. Missing marks stay null (never zero).
        const status = resolveMarkStatus({ ...row, obtainedMarks: obtained })
        const isAbsent = status === "ABSENT"
        assertMarkStatusEntryAllowed({ isCoreSubject, status })
        const derivation = deriveSubjectMark({
          obtainedMarks: obtained,
          isAbsent,
          maxMarks: maxBy.get(examSubjectId) ?? 0,
          passMarks: passBy.get(examSubjectId) ?? 0,
          bands,
        })
        // Grade-history rule: a mark whose score did not change keeps the grade
        // it was awarded, even when the active bands changed in the meantime.
        const grade = resolveMarkGrade({
          derived: derivation,
          stored: storedMarkByKey.get(`${resultId}:${examSubjectId}`) ?? null,
        })
        markRows.push({
          examResultId: resultId,
          examSubjectId,
          obtainedMarks: obtained === null ? null : new Prisma.Decimal(obtained),
          isAbsent,
          status,
          percentage: decimalOrNull(derivation.percentage),
          grade,
          isPass: derivation.isPass,
          remarks: row.remarks,
        })
        touched.push(resultId)
      }

      await bulkUpsertExamMarks(tx, {
        schoolId: actor.schoolId,
        enteredBy: actor.userId,
        rows: markRows,
      })

      const touchedUnique = [...new Set(touched)]
      // The aggregate is computed from the marks as they are AFTER this save:
      // the base marks read above, with the written pairs replaced by the
      // values in `markRows`.
      for (const row of markRows) {
        const bucket = marksByResult.get(row.examResultId) ?? []
        const graded: GradedMark = {
          examSubjectId: row.examSubjectId,
          obtainedMarks: row.obtainedMarks === null ? null : toNumber(row.obtainedMarks),
          isAbsent: row.isAbsent,
        }
        const index = bucket.findIndex((mark) => mark.examSubjectId === row.examSubjectId)
        if (index >= 0) bucket[index] = graded
        else bucket.push(graded)
        marksByResult.set(row.examResultId, bucket)
      }

      const aggregateRows: ResultAggregateBulkRow[] = touchedUnique.map((resultId) => {
        const aggregate = computeResultAggregate({
          subjectCount: subjects.length,
          subjectMaxMarks: Object.fromEntries(maxBy),
          subjectPassMarks: Object.fromEntries(passBy),
          marks: marksByResult.get(resultId) ?? [],
          bands,
        })
        return {
          id: resultId,
          totalObtained: decimalOrNull(aggregate.totalObtained),
          totalMaxMarks: decimalOrNull(aggregate.totalMaxMarks),
          totalPercentage: decimalOrNull(aggregate.totalPercentage),
          // Grade-history rule: the aggregate grade is preserved while the
          // aggregate percentage is unchanged; a changed total is an explicit
          // regrade against the current active bands.
          grade: resolveAggregateGrade({
            aggregate,
            stored: storedAggregateByResultId.get(resultId) ?? null,
          }),
          isPass: aggregate.isPass,
          isComplete: aggregate.isComplete,
        }
      })
      await bulkUpdateResultAggregates(tx, aggregateRows)

      await recordAudit(tx, {
        schoolId: actor.schoolId,
        actorId: actor.userId,
        actorName: actor.name,
        actorRole: actor.roles[0] ?? "USER",
        actorEmail: actor.email,
        action: "UPDATE",
        entityType: "EXAM_RESULT",
        entityId: touched[0] ?? null,
        summary: `Saved marks for ${touched.length} student(s) in ${examSubject.subject.name}`,
        metadata: { saved: touched.length, examId, examSubjectId },
      })

      return touched.length
    },
    // Bounded-statement transaction: the callback now issues a constant number
    // of round trips, so this is headroom rather than a workaround for a
    // long-running loop. Matches the existing project convention
    // (fee-invoice.service.ts, payment.service.ts).
    { timeout: 20_000, maxWait: 10_000 },
  )

  return { saved }
}

export async function finalizeExam(
  examId: string,
  actor: ActorContext,
): Promise<FinalizeResult> {
  const prisma = await requirePrisma()
  const exam = await prisma.exam.findFirst({
    where: { id: examId, schoolId: actor.schoolId },
    select: { id: true, name: true, status: true, academicSessionId: true, classId: true, sectionId: true },
  })
  if (!exam) throw notFoundError("Exam not found")
  if (!canFinalizeExam(exam.status)) {
    throw badRequestError("Only published exams can be finalized")
  }

  // Bounded-statement transaction, matching putSubjectMarks: the two
  // per-student update loops (aggregate, then rank) are single batched
  // statements, so the round-trip count no longer scales with class size.
  const ranked = await prisma.$transaction(async (tx) => {
    const rosterWhere: Prisma.StudentEnrollmentWhereInput = {
      academicSessionId: exam.academicSessionId,
      classId: exam.classId,
      ...(exam.sectionId ? { sectionId: exam.sectionId } : {}),
    }
    const enrollments = await tx.studentEnrollment.findMany({
      where: rosterWhere,
      select: { id: true, studentId: true },
    })
    if (enrollments.length > 0) {
      await tx.examResult.createMany({
        data: enrollments.map((row) => ({
          schoolId: actor.schoolId,
          examId,
          studentId: row.studentId,
          enrollmentId: row.id,
        })),
        skipDuplicates: true,
      })
    }

    const subjects = await tx.examSubject.findMany({
      where: { examId },
      select: { id: true, maxMarks: true, passMarks: true },
    })
    const { maxBy, passBy } = subjectConfigMaps(subjects)
    const bands = await loadGradingBands(tx, actor.schoolId)

    const marks = await tx.examMark.findMany({
      where: { examResult: { examId } },
      select: { examResultId: true, examSubjectId: true, obtainedMarks: true, isAbsent: true },
    })
    const marksByResult = new Map<string, GradedMark[]>()
    for (const mark of marks) {
      const bucket = marksByResult.get(mark.examResultId) ?? []
      bucket.push({
        examSubjectId: mark.examSubjectId,
        obtainedMarks: mark.obtainedMarks === null ? null : toNumber(mark.obtainedMarks),
        isAbsent: mark.isAbsent,
      })
      marksByResult.set(mark.examResultId, bucket)
    }

    const resultIds = await tx.examResult.findMany({
      where: { examId },
      // The stored aggregate grade is read so finalization keeps the grade a
      // result was awarded when its total did not change (grade-history rule).
      select: { id: true, grade: true, totalPercentage: true },
    })
    const aggregateRows: ResultAggregateBulkRow[] = resultIds.map((row) => {
      const aggregate = computeResultAggregate({
        subjectCount: subjects.length,
        subjectMaxMarks: Object.fromEntries(maxBy),
        subjectPassMarks: Object.fromEntries(passBy),
        marks: marksByResult.get(row.id) ?? [],
        bands,
      })
      return {
        id: row.id,
        totalObtained: decimalOrNull(aggregate.totalObtained),
        totalMaxMarks: decimalOrNull(aggregate.totalMaxMarks),
        totalPercentage: decimalOrNull(aggregate.totalPercentage),
        // Grade-history rule: the aggregate grade is preserved while the
        // aggregate percentage is unchanged; a changed total is an explicit
        // regrade against the current active bands.
        grade: resolveAggregateGrade({
          aggregate,
          stored: {
            percentage: decimalToNumberOrNull(row.totalPercentage),
            grade: row.grade,
          },
        }),
        isPass: aggregate.isPass,
        isComplete: aggregate.isComplete,
      }
    })
    await bulkUpdateResultAggregates(tx, aggregateRows)

    const happenings = await tx.examResult.findMany({
      where: { examId },
      select: { id: true, totalPercentage: true, isComplete: true },
    })
    const ranks = assignCompetitionRanks(
      happenings.map((row) => ({
        id: row.id,
        totalPercentage: row.totalPercentage === null ? null : toNumber(row.totalPercentage),
        isComplete: row.isComplete,
      })),
    )
    const rankRows = ranks.flatMap((row) => (row.rank === null ? [] : [{ id: row.id, rank: row.rank }]))
    const rankedCount = rankRows.length
    await bulkUpdateResultRanks(tx, rankRows)
    await tx.examResult.updateMany({
      where: { examId, isComplete: false },
      data: { rank: null },
    })

    await tx.exam.update({
      where: { id: examId },
      data: { status: "FINAL", finalizedAt: new Date(), updatedBy: actor.userId },
    })

    await recordAudit(tx, {
      schoolId: actor.schoolId,
      actorId: actor.userId,
      actorName: actor.name,
      actorRole: actor.roles[0] ?? "USER",
      actorEmail: actor.email,
      action: "REVIEW",
      entityType: "EXAM",
      entityId: examId,
      summary: `Finalized exam "${exam.name}"`,
      metadata: { ranked: rankedCount, rosterCount: enrollments.length },
      diff: { fields: [{ field: "status", before: exam.status, after: "FINAL" }] },
    })

    return rankedCount
  }, { timeout: 20_000, maxWait: 10_000 })

  return { finalized: true, ranked }
}

export async function reopenExam(
  examId: string,
  actor: ActorContext,
): Promise<ReopenResult> {
  const prisma = await requirePrisma()
  const exam = await prisma.exam.findFirst({
    where: { id: examId, schoolId: actor.schoolId },
    select: { id: true, name: true, status: true },
  })
  if (!exam) throw notFoundError("Exam not found")
  if (!canReopenExam(exam.status)) {
    throw badRequestError("Only finalized exams can be reopened")
  }

  await prisma.$transaction(async (tx) => {
    await tx.examResult.updateMany({ where: { examId }, data: { rank: null } })
    await tx.exam.update({
      where: { id: examId },
      data: { status: "PUBLISHED", finalizedAt: null, updatedBy: actor.userId },
    })
    await recordAudit(tx, {
      schoolId: actor.schoolId,
      actorId: actor.userId,
      actorName: actor.name,
      actorRole: actor.roles[0] ?? "USER",
      actorEmail: actor.email,
      action: "STATUS_CHANGE",
      entityType: "EXAM",
      entityId: examId,
      summary: `Reopened exam "${exam.name}" for mark corrections`,
      diff: { fields: [{ field: "status", before: exam.status, after: "PUBLISHED" }] },
    })
  })

  return { reopened: true }
}