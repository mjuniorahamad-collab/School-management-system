import { Prisma, type ExamMark } from "@prisma/client"
import { badRequestError, forbiddenError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { recordAudit } from "../audit-logs/audit-log.service.js"
import { isExamMarksScopedActor } from "../exams/exam.service.js"
import {
  canFinalizeExam,
  canReopenExam,
} from "../exams/exam.rules.js"
import { requireActingTeacher } from "../tasks/task-validation.js"
import { toResultSheetExamMeta, toResultMarkCell, toResultSheetSubject } from "./result.mapper.js"
import {
  computeResultAggregate,
  deriveSubjectMark,
  toNumber,
  type GradedMark,
  type GradingBandRule,
} from "./grading.js"
import { assignCompetitionRanks } from "./ranking.js"
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
    where: { schoolId },
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

  const saved = await prisma.$transaction(async (tx) => {
    const existingResults = await tx.examResult.findMany({
      where: { examId, enrollmentId: { in: enrollmentIds } },
      select: { id: true, enrollmentId: true },
    })
    const resultByEnrollment = new Map(existingResults.map((row) => [row.enrollmentId, row.id]))

    const touched: string[] = []
    for (const row of input.rows) {
      const enrollment = enrollmentById.get(row.enrollmentId)
      if (!enrollment) throw badRequestError("Student enrollment is not part of this exam")

      let resultId = resultByEnrollment.get(row.enrollmentId)
      if (!resultId) {
        const created = await tx.examResult.create({
          data: {
            schoolId: actor.schoolId,
            examId,
            studentId: enrollment.studentId,
            enrollmentId: row.enrollmentId,
          },
          select: { id: true },
        })
        resultId = created.id
        resultByEnrollment.set(row.enrollmentId, resultId)
      }

      const obtained = row.obtainedMarks ?? null
      const derivation = deriveSubjectMark({
        obtainedMarks: obtained,
        isAbsent: row.isAbsent,
        maxMarks: maxBy.get(examSubjectId) ?? 0,
        passMarks: passBy.get(examSubjectId) ?? 0,
        bands,
      })
      const data = {
        obtainedMarks: obtained === null ? null : new Prisma.Decimal(obtained),
        isAbsent: row.isAbsent,
        percentage: decimalOrNull(derivation.percentage),
        grade: derivation.grade,
        isPass: derivation.isPass,
        remarks: row.remarks,
        updatedBy: actor.userId,
      }
      await tx.examMark.upsert({
        where: {
          examResultId_examSubjectId: { examResultId: resultId, examSubjectId },
        },
        create: {
          schoolId: actor.schoolId,
          examResultId: resultId,
          examSubjectId,
          ...data,
          enteredBy: actor.userId,
          enteredAt: new Date(),
        },
        update: data,
      })
      touched.push(resultId)
    }

    for (const resultId of [...new Set(touched)]) {
      const result = await tx.examResult.findFirst({
        where: { id: resultId },
        include: { marks: true },
      })
      if (!result) continue
      const marks: GradedMark[] = result.marks.map((mark) => ({
        examSubjectId: mark.examSubjectId,
        obtainedMarks: mark.obtainedMarks === null ? null : toNumber(mark.obtainedMarks),
        isAbsent: mark.isAbsent,
      }))
      const aggregate = computeResultAggregate({
        subjectCount: subjects.length,
        subjectMaxMarks: Object.fromEntries(maxBy),
        subjectPassMarks: Object.fromEntries(passBy),
        marks,
        bands,
      })
      await tx.examResult.update({
        where: { id: resultId },
        data: {
          totalObtained: decimalOrNull(aggregate.totalObtained),
          totalMaxMarks: decimalOrNull(aggregate.totalMaxMarks),
          totalPercentage: decimalOrNull(aggregate.totalPercentage),
          grade: aggregate.grade,
          isPass: aggregate.isPass,
          isComplete: aggregate.isComplete,
        },
      })
    }

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
  })

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
      select: { id: true },
    })
    for (const row of resultIds) {
      const aggregate = computeResultAggregate({
        subjectCount: subjects.length,
        subjectMaxMarks: Object.fromEntries(maxBy),
        subjectPassMarks: Object.fromEntries(passBy),
        marks: marksByResult.get(row.id) ?? [],
        bands,
      })
      await tx.examResult.update({
        where: { id: row.id },
        data: {
          totalObtained: decimalOrNull(aggregate.totalObtained),
          totalMaxMarks: decimalOrNull(aggregate.totalMaxMarks),
          totalPercentage: decimalOrNull(aggregate.totalPercentage),
          grade: aggregate.grade,
          isPass: aggregate.isPass,
          isComplete: aggregate.isComplete,
        },
      })
    }

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
    let rankedCount = 0
    for (const row of ranks) {
      if (row.rank === null) continue
      rankedCount += 1
      await tx.examResult.update({ where: { id: row.id }, data: { rank: row.rank } })
    }
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
  })

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