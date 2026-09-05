import { Prisma } from "@prisma/client"
import { badRequestError, forbiddenError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { ROLE_NAMES } from "../../permissions/permissions.js"
import {
  assertTeacherAssignmentFit,
  isTaskAdminActor,
  requireActingTeacher,
} from "../tasks/task-validation.js"
import { toExamListItem, toExamSubjectItem } from "./exam.mapper.js"
import {
  canArchiveExam,
  canPublishExam,
  type ExamStatus,
} from "./exam.rules.js"
import type {
  CreateExamInput,
  ExamSubjectInput,
  ListExamQuery,
  UpdateExamInput,
  UpdateExamSubjectsInput,
  UpdateExamStatusInput,
} from "./exam.schema.js"
import type { ExamContext, ExamDetail, ExamListResult } from "./exam.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

const DETAIL_INCLUDE = {
  academicSession: { select: { name: true } },
  examType: { select: { code: true, name: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
} satisfies Prisma.ExamInclude

const SUBJECT_INCLUDE = {
  subjects: {
    include: {
      subject: { select: { code: true, name: true } },
      teacher: { select: { firstName: true, lastName: true } },
    },
    orderBy: { sortOrder: "asc" as const },
  },
}

const DETAIL_WITH_SUBJECTS_INCLUDE = {
  ...DETAIL_INCLUDE,
  ...SUBJECT_INCLUDE,
} satisfies Prisma.ExamInclude

interface ActorContext {
  schoolId: string
  userId: string
  roles: readonly string[]
}

interface ExamTargeting {
  academicSessionId: string
  examTypeId: string
  classId: string
  sectionId: string | null | undefined
}

/** Marks-entry scoping: only TEACHER-role actors are confined to their own subject rows. */
export function isExamMarksScopedActor(roles: readonly string[]): boolean {
  return !isTaskAdminActor(roles) && roles.includes(ROLE_NAMES.TEACHER)
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function buildListOrder(query: ListExamQuery): Prisma.ExamOrderByWithRelationInput {
  return { [query.sortBy]: query.sortDir }
}

/**
 * Validates every targeting reference of an Exam against the caller's school
 * (academic session, exam type, class, section-belongs-to-class). Returns the
 * normalized section id (null = whole class).
 */
async function validateExamTargeting(
  prisma: PrismaClient,
  opts: { schoolId: string; targeting: ExamTargeting },
): Promise<{ sectionId: string | null }> {
  const { schoolId, targeting } = opts

  const academicSession = await prisma.academicSession.findFirst({
    where: { id: targeting.academicSessionId, schoolId },
    select: { id: true },
  })
  if (!academicSession) throw badRequestError("Academic session not found in this school")

  const examType = await prisma.examType.findFirst({
    where: { id: targeting.examTypeId, schoolId },
    select: { id: true },
  })
  if (!examType) throw badRequestError("Exam type not found in this school")

  const cls = await prisma.class.findFirst({
    where: { id: targeting.classId, schoolId },
    select: { id: true },
  })
  if (!cls) throw badRequestError("Class not found in this school")

  const sectionId = targeting.sectionId ?? null
  if (sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: sectionId },
      select: { classId: true },
    })
    if (!section || section.classId !== cls.id) {
      throw badRequestError("Section does not belong to the specified class")
    }
  }

  return { sectionId }
}

/** Validates subject/teacher refs are in-school; returns the normalized list. */
async function validateExamSubjectRefs(
  prisma: PrismaClient,
  opts: { schoolId: string; subjects: ExamSubjectInput[] },
): Promise<ExamSubjectInput[]> {
  const { schoolId, subjects } = opts
  const subjectIds = [...new Set(subjects.map((subject) => subject.subjectId))]
  const teacherIds = [...new Set(subjects.map((subject) => subject.teacherId))]

  const subjectCount = await prisma.subject.count({
    where: { id: { in: subjectIds }, schoolId },
  })
  if (subjectCount !== subjectIds.length) {
    throw badRequestError("One or more subjects were not found in this school")
  }

  const teacherCount = await prisma.teacher.count({
    where: { id: { in: teacherIds }, schoolId, status: "ACTIVE" },
  })
  if (teacherCount !== teacherIds.length) {
    throw badRequestError("One or more teachers were not found in this school")
  }

  return subjects
}

/**
 * Tenancy guard for the per-(session, type, class, section) unique instance.
 * Prisma's unique index on a nullable sectionId allows multiple NULL sections,
 * so the pre-check also covers the whole-class case and the P2002 handler is a
 * backstop for the concrete-section race.
 */
async function assertNoExamInstanceConflict(
  prisma: PrismaClient,
  opts: {
    schoolId: string
    academicSessionId: string
    examTypeId: string
    classId: string
    sectionId: string | null
    excludeId?: string
  },
): Promise<void> {
  const existing = await prisma.exam.findFirst({
    where: {
      schoolId: opts.schoolId,
      academicSessionId: opts.academicSessionId,
      examTypeId: opts.examTypeId,
      classId: opts.classId,
      sectionId: opts.sectionId,
      ...(opts.excludeId ? { NOT: { id: opts.excludeId } } : {}),
    },
    select: { id: true },
  })
  if (existing) {
    throw badRequestError(
      "An exam of this type already exists for this class/section in the same academic session",
    )
  }
}

async function handleExamCreateConflict(error: unknown): Promise<never> {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw badRequestError(
      "An exam of this type already exists for this class/section in the same academic session",
    )
  }
  throw error
}

/**
 * TEACHER-role write enforcement for exams: the acting teacher must be listed
 * on every subject, and their TeacherClass/TeacherSubject coverage must match
 * the target class/section + subject. Administrators bypass.
 */
async function requireExamWriteRights(
  prisma: PrismaClient,
  actor: ActorContext,
  opts: { classId: string; sectionId: string | null; subjects: ExamSubjectInput[] },
): Promise<void> {
  const actingTeacherId = isTaskAdminActor(actor.roles)
    ? null
    : await requireActingTeacher(prisma, actor)
  if (!actingTeacherId) return

  for (const subject of opts.subjects) {
    if (subject.teacherId !== actingTeacherId) {
      throw forbiddenError("Teachers may only manage exams for their own teacher profile")
    }
    await assertTeacherAssignmentFit(prisma, {
      teacherId: actingTeacherId,
      classId: opts.classId,
      sectionId: opts.sectionId,
      subjectId: subject.subjectId,
    })
  }
}

/** Non-admin (teacher) metadata/status/delete guard: the teacher must be on the exam. */
async function requireActingTeacherOnExam(
  prisma: PrismaClient,
  actor: ActorContext,
  examId: string,
): Promise<string | null> {
  const actingTeacherId = isTaskAdminActor(actor.roles)
    ? null
    : await requireActingTeacher(prisma, actor)
  if (!actingTeacherId) return null

  const coverage = await prisma.examSubject.count({
    where: { examId, teacherId: actingTeacherId },
  })
  if (coverage === 0) {
    throw forbiddenError("Teachers may only manage exams they are assigned to")
  }
  return actingTeacherId
}

export async function listExams(query: ListExamQuery, schoolId: string): Promise<ExamListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.ExamWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.examTypeId) where.examTypeId = query.examTypeId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.status) where.status = query.status
  if (query.search) where.name = { contains: query.search, mode: "insensitive" }

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.exam.count({ where }),
    prisma.exam.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: buildListOrder(query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return {
    items: rows.map(toExamListItem),
    total,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getExamById(id: string, schoolId: string): Promise<ExamDetail> {
  const prisma = await requirePrisma()
  const record = await prisma.exam.findFirst({
    where: { id, schoolId },
    include: DETAIL_WITH_SUBJECTS_INCLUDE,
  })
  if (!record) throw notFoundError("Exam not found")
  return { ...toExamListItem(record), subjects: record.subjects.map(toExamSubjectItem) }
}

export async function createExam(input: CreateExamInput, actor: ActorContext): Promise<ExamDetail> {
  const prisma = await requirePrisma()

  const { sectionId } = await validateExamTargeting(prisma, {
    schoolId: actor.schoolId,
    targeting: {
      academicSessionId: input.academicSessionId,
      examTypeId: input.examTypeId,
      classId: input.classId,
      sectionId: input.sectionId,
    },
  })
  const subjects = await validateExamSubjectRefs(prisma, {
    schoolId: actor.schoolId,
    subjects: input.subjects,
  })
  await assertNoExamInstanceConflict(prisma, {
    schoolId: actor.schoolId,
    academicSessionId: input.academicSessionId,
    examTypeId: input.examTypeId,
    classId: input.classId,
    sectionId,
  })
  await requireExamWriteRights(prisma, actor, { classId: input.classId, sectionId, subjects })

  const status: ExamStatus = input.status ?? "DRAFT"
  try {
    const created = await prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          schoolId: actor.schoolId,
          academicSessionId: input.academicSessionId,
          examTypeId: input.examTypeId,
          name: input.name,
          classId: input.classId,
          sectionId,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: new Date(`${input.endDate}T00:00:00.000Z`),
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        include: DETAIL_WITH_SUBJECTS_INCLUDE,
      })
      await tx.examSubject.createMany({
        data: subjects.map((subject, index) => ({
          examId: exam.id,
          subjectId: subject.subjectId,
          teacherId: subject.teacherId,
          maxMarks: new Prisma.Decimal(subject.maxMarks),
          passMarks: new Prisma.Decimal(subject.passMarks),
          sortOrder: index,
        })),
      })
      return tx.exam.findFirstOrThrow({
        where: { id: exam.id },
        include: DETAIL_WITH_SUBJECTS_INCLUDE,
      })
    })
    return { ...toExamListItem(created), subjects: created.subjects.map(toExamSubjectItem) }
  } catch (error) {
    return handleExamCreateConflict(error)
  }
}

export async function updateExam(
  id: string,
  input: UpdateExamInput,
  actor: ActorContext,
): Promise<ExamDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.exam.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: {
      id: true,
      academicSessionId: true,
      examTypeId: true,
      classId: true,
      sectionId: true,
      status: true,
      publishedAt: true,
    },
  })
  if (!existing) throw notFoundError("Exam not found")
  if (existing.status !== "DRAFT") {
    throw badRequestError("Only draft exams can be edited")
  }

  await requireActingTeacherOnExam(prisma, actor, id)

  const mergedSectionId =
    input.sectionId !== undefined ? input.sectionId : existing.sectionId ?? null
  const { sectionId } = await validateExamTargeting(prisma, {
    schoolId: actor.schoolId,
    targeting: {
      academicSessionId: existing.academicSessionId,
      examTypeId: existing.examTypeId,
      classId: existing.classId,
      sectionId: mergedSectionId,
    },
  })
  if (sectionId !== (existing.sectionId ?? null)) {
    await assertActorSectionCoverage(prisma, actor, {
      examId: id,
      classId: existing.classId,
      sectionId,
    })
  }

  const data: Prisma.ExamUncheckedUpdateInput = { updatedBy: actor.userId }
  if (input.name !== undefined) data.name = input.name
  if (input.startDate !== undefined) data.startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  if (input.endDate !== undefined) data.endDate = new Date(`${input.endDate}T00:00:00.000Z`)
  if (input.sectionId !== undefined) data.sectionId = sectionId

  const updated = await prisma.exam.update({
    where: { id },
    data,
    include: DETAIL_WITH_SUBJECTS_INCLUDE,
  })
  return { ...toExamListItem(updated), subjects: updated.subjects.map(toExamSubjectItem) }
}

/** When a teacher re-scopes a draft exam to another section, their coverage must still hold. */
async function assertActorSectionCoverage(
  prisma: PrismaClient,
  actor: ActorContext,
  opts: { examId: string; classId: string; sectionId: string | null },
): Promise<void> {
  const actingTeacherId = isTaskAdminActor(actor.roles)
    ? null
    : await requireActingTeacher(prisma, actor)
  if (!actingTeacherId) return

  const scopedSubjects = await prisma.examSubject.findMany({
    where: { examId: opts.examId, teacherId: actingTeacherId },
    select: { subjectId: true },
  })
  for (const subject of scopedSubjects) {
    await assertTeacherAssignmentFit(prisma, {
      teacherId: actingTeacherId,
      classId: opts.classId,
      sectionId: opts.sectionId,
      subjectId: subject.subjectId,
    })
  }
}

export async function updateExamSubjects(
  id: string,
  input: UpdateExamSubjectsInput,
  actor: ActorContext,
): Promise<ExamDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.exam.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: { id: true, classId: true, sectionId: true, status: true },
  })
  if (!existing) throw notFoundError("Exam not found")
  if (existing.status !== "DRAFT") {
    throw badRequestError("Subject list can only be changed while the exam is in draft")
  }

  const subjects = await validateExamSubjectRefs(prisma, {
    schoolId: actor.schoolId,
    subjects: input.subjects,
  })
  await requireExamWriteRights(prisma, actor, {
    classId: existing.classId,
    sectionId: existing.sectionId ?? null,
    subjects,
  })

  const updated = await prisma.$transaction(async (tx) => {
    await tx.examSubject.deleteMany({ where: { examId: id } })
    await tx.examSubject.createMany({
      data: subjects.map((subject, index) => ({
        examId: id,
        subjectId: subject.subjectId,
        teacherId: subject.teacherId,
        maxMarks: new Prisma.Decimal(subject.maxMarks),
        passMarks: new Prisma.Decimal(subject.passMarks),
        sortOrder: index,
      })),
    })
    await tx.exam.update({
      where: { id },
      data: { updatedBy: actor.userId },
    })
    return tx.exam.findFirstOrThrow({ where: { id }, include: DETAIL_WITH_SUBJECTS_INCLUDE })
  })
  return { ...toExamListItem(updated), subjects: updated.subjects.map(toExamSubjectItem) }
}

export async function updateExamStatus(
  id: string,
  input: UpdateExamStatusInput,
  actor: ActorContext,
): Promise<ExamDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.exam.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: { id: true, status: true, publishedAt: true },
  })
  if (!existing) throw notFoundError("Exam not found")

  const allowed =
    input.status === "PUBLISHED"
      ? canPublishExam(existing.status)
      : canArchiveExam(existing.status)
  if (!allowed) {
    throw badRequestError(`Exam cannot change from ${existing.status} to ${input.status}`)
  }

  await requireActingTeacherOnExam(prisma, actor, id)

  const updated = await prisma.exam.update({
    where: { id },
    data: {
      status: input.status,
      publishedAt: input.status === "PUBLISHED" ? existing.publishedAt ?? new Date() : existing.publishedAt,
      updatedBy: actor.userId,
    },
    include: DETAIL_WITH_SUBJECTS_INCLUDE,
  })
  return { ...toExamListItem(updated), subjects: updated.subjects.map(toExamSubjectItem) }
}

export async function deleteExam(id: string, actor: ActorContext): Promise<{ deleted: true }> {
  const prisma = await requirePrisma()
  const existing = await prisma.exam.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: { id: true, status: true },
  })
  if (!existing) throw notFoundError("Exam not found")
  if (existing.status !== "DRAFT") {
    throw badRequestError("Only draft exams can be deleted")
  }

  await requireActingTeacherOnExam(prisma, actor, id)

  await prisma.exam.delete({ where: { id } })
  return { deleted: true }
}

export async function getExamContext(
  schoolId: string,
  actor: ActorContext,
): Promise<ExamContext> {
  const prisma = await requirePrisma()

  const isScoped = isExamMarksScopedActor(actor.roles)
  const actingTeacherId = isScoped ? await requireActingTeacher(prisma, actor) : null

  if (actingTeacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: actingTeacherId, schoolId },
      select: {
        firstName: true,
        lastName: true,
        teacherSubjects: { select: { subject: { select: { id: true, code: true, name: true } } } },
        teacherClasses: {
          select: {
            section: { select: { id: true, name: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    })
    if (!teacher) throw notFoundError("Teacher profile not found")

    const subjects = teacher.teacherSubjects.map((row) => ({
      id: row.subject.id,
      code: row.subject.code,
      name: row.subject.name,
    }))

    const classById = new Map<
      string,
      { id: string; name: string; sections: { id: string; name: string }[] }
    >()
    for (const assignment of teacher.teacherClasses) {
      const existing = classById.get(assignment.class.id)
      const section = assignment.section
      if (section) {
        const entry =
          existing ?? { id: assignment.class.id, name: assignment.class.name, sections: [] }
        if (!entry.sections.some((item) => item.id === section.id)) {
          entry.sections.push({ id: section.id, name: section.name })
        }
        classById.set(assignment.class.id, entry)
      } else {
        classById.set(assignment.class.id, {
          id: assignment.class.id,
          name: assignment.class.name,
          sections: [],
        })
      }
    }

    return {
      academicSessions: await listAcademicSessionOptions(prisma, schoolId),
      examTypes: await listExamTypeOptions(prisma, schoolId),
      subjects,
      classes: [...classById.values()],
      teachers: [{ id: actingTeacherId, name: teacherName(teacher.firstName, teacher.lastName) }],
    }
  }

  const [academicSessions, examTypes, subjects, classes, teachers] = await Promise.all([
    listAcademicSessionOptions(prisma, schoolId),
    listExamTypeOptions(prisma, schoolId),
    prisma.subject.findMany({
      where: { schoolId },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.class.findMany({
      where: { schoolId },
      select: {
        id: true,
        name: true,
        sections: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.teacher.findMany({
      where: { schoolId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: "asc" },
    }),
  ])

  return {
    academicSessions,
    examTypes,
    subjects,
    classes,
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacherName(teacher.firstName, teacher.lastName),
    })),
  }
}

async function listAcademicSessionOptions(
  prisma: PrismaClient,
  schoolId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.academicSession.findMany({
    where: { schoolId },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  })
}

async function listExamTypeOptions(
  prisma: PrismaClient,
  schoolId: string,
): Promise<{ id: string; code: string; name: string }[]> {
  return prisma.examType.findMany({
    where: { schoolId },
    select: { id: true, code: true, name: true },
    orderBy: { sortOrder: "asc" },
  })
}

function teacherName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ")
}