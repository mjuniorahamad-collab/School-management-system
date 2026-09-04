import { Prisma } from "@prisma/client"
import { badRequestError, forbiddenError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import {
  assertTeacherAssignmentFit,
  isTaskAdminActor,
  requireActingTeacher,
  validateTaskTargeting,
} from "../tasks/task-validation.js"
import { canTransitionTaskStatus, todayLocalDate } from "../tasks/task-rules.js"
import { toAssignmentListItem } from "./assignment.mapper.js"
import type {
  CreateAssignmentInput,
  ListAssignmentQuery,
  UpdateAssignmentInput,
} from "./assignment.schema.js"
import type {
  AssignmentContext,
  AssignmentDetail,
  AssignmentListResult,
} from "./assignment.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

const DETAIL_INCLUDE = {
  academicSession: { select: { name: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { code: true, name: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AssignmentInclude

interface ActorContext {
  schoolId: string
  userId: string
  roles: readonly string[]
}

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function buildListOrder(query: ListAssignmentQuery): Prisma.AssignmentOrderByWithRelationInput {
  return { [query.sortBy]: query.sortDir }
}

export async function listAssignments(
  query: ListAssignmentQuery,
  schoolId: string,
): Promise<AssignmentListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.AssignmentWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.subjectId) where.subjectId = query.subjectId
  if (query.teacherId) where.teacherId = query.teacherId
  if (query.status) where.status = query.status
  if (query.dueDateFrom || query.dueDateTo) {
    where.dueDate = {}
    if (query.dueDateFrom) where.dueDate.gte = new Date(`${query.dueDateFrom}T00:00:00.000Z`)
    if (query.dueDateTo) where.dueDate.lte = new Date(`${query.dueDateTo}T23:59:59.999Z`)
  }
  if (query.search) where.title = { contains: query.search, mode: "insensitive" }

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: buildListOrder(query),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const today = todayLocalDate()
  return {
    items: rows.map((row) => toAssignmentListItem(row, today)),
    total,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  }
}

export async function getAssignmentById(id: string, schoolId: string): Promise<AssignmentDetail> {
  const prisma = await requirePrisma()
  const record = await prisma.assignment.findFirst({
    where: { id, schoolId },
    include: DETAIL_INCLUDE,
  })
  if (!record) throw notFoundError("Assignment not found")
  return toAssignmentListItem(record, todayLocalDate())
}

async function createOrUpdateTaskWriteChecks(
  prisma: PrismaClient,
  actor: ActorContext,
  targeting: {
    teacherId: string
    classId: string
    sectionId: string | null
    subjectId: string
  },
): Promise<void> {
  const actingTeacherId = isTaskAdminActor(actor.roles)
    ? null
    : await requireActingTeacher(prisma, actor)
  if (actingTeacherId) {
    if (actingTeacherId !== targeting.teacherId) {
      throw forbiddenError("Teachers may only manage assignments for their own teacher profile")
    }
    await assertTeacherAssignmentFit(prisma, targeting)
  }
}

export async function createAssignment(
  input: CreateAssignmentInput,
  actor: ActorContext,
): Promise<AssignmentDetail> {
  const prisma = await requirePrisma()

  const validated = await validateTaskTargeting(prisma, {
    schoolId: actor.schoolId,
    input,
  })

  const { sectionId } = validated
  await createOrUpdateTaskWriteChecks(prisma, actor, {
    teacherId: input.teacherId,
    classId: input.classId,
    sectionId,
    subjectId: input.subjectId,
  })

  const status = input.status ?? "DRAFT"
  const created = await prisma.assignment.create({
    data: {
      schoolId: actor.schoolId,
      academicSessionId: input.academicSessionId,
      classId: input.classId,
      sectionId,
      subjectId: input.subjectId,
      teacherId: input.teacherId,
      title: input.title,
      instructions: input.instructions ?? null,
      dueDate: new Date(input.dueDate),
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    },
    include: DETAIL_INCLUDE,
  })
  return toAssignmentListItem(created, todayLocalDate())
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
  actor: ActorContext,
): Promise<AssignmentDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.assignment.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: {
      id: true,
      academicSessionId: true,
      classId: true,
      sectionId: true,
      subjectId: true,
      teacherId: true,
      status: true,
      publishedAt: true,
    },
  })
  if (!existing) throw notFoundError("Assignment not found")

  const mergedTargeting = {
    academicSessionId: input.academicSessionId ?? existing.academicSessionId,
    classId: input.classId ?? existing.classId,
    sectionId: input.sectionId !== undefined ? input.sectionId : existing.sectionId,
    subjectId: input.subjectId ?? existing.subjectId,
    teacherId: input.teacherId ?? existing.teacherId,
  }
  const validated = await validateTaskTargeting(prisma, {
    schoolId: actor.schoolId,
    input: mergedTargeting,
  })
  await createOrUpdateTaskWriteChecks(prisma, actor, {
    teacherId: mergedTargeting.teacherId,
    classId: mergedTargeting.classId,
    sectionId: validated.sectionId,
    subjectId: mergedTargeting.subjectId,
  })

  const data: Prisma.AssignmentUncheckedUpdateInput = { updatedBy: actor.userId }
  if (input.title !== undefined) data.title = input.title
  if (input.instructions !== undefined) data.instructions = input.instructions ?? null
  if (input.dueDate !== undefined) data.dueDate = new Date(input.dueDate)
  if (input.academicSessionId !== undefined) data.academicSessionId = input.academicSessionId
  if (input.classId !== undefined) data.classId = input.classId
  if (input.sectionId !== undefined) data.sectionId = validated.sectionId
  if (input.subjectId !== undefined) data.subjectId = input.subjectId
  if (input.teacherId !== undefined) data.teacherId = input.teacherId

  let nextStatus = existing.status
  let publishedAt = existing.publishedAt
  if (input.status !== undefined) {
    if (!canTransitionTaskStatus(existing.status, input.status)) {
      throw badRequestError(`Assignment cannot change from ${existing.status} to ${input.status}`)
    }
    nextStatus = input.status
    if (nextStatus === "PUBLISHED") publishedAt = publishedAt ?? new Date()
  }
  data.status = nextStatus
  data.publishedAt = publishedAt

  const updated = await prisma.assignment.update({ where: { id }, data, include: DETAIL_INCLUDE })
  return toAssignmentListItem(updated, todayLocalDate())
}

export async function deleteAssignment(
  id: string,
  actor: ActorContext,
): Promise<{ deleted: true }> {
  const prisma = await requirePrisma()
  const existing = await prisma.assignment.findFirst({
    where: { id, schoolId: actor.schoolId },
    select: { id: true, teacherId: true, status: true },
  })
  if (!existing) throw notFoundError("Assignment not found")
  if (existing.status !== "DRAFT") {
    throw badRequestError("Only draft assignments can be deleted")
  }

  const actingTeacherId = isTaskAdminActor(actor.roles)
    ? null
    : await requireActingTeacher(prisma, actor)
  if (actingTeacherId && actingTeacherId !== existing.teacherId) {
    throw forbiddenError("Teachers may only delete their own assignments")
  }

  await prisma.assignment.delete({ where: { id } })
  return { deleted: true }
}

export async function getAssignmentContext(
  schoolId: string,
  actor: ActorContext,
): Promise<AssignmentContext> {
  const prisma = await requirePrisma()

  if (!isTaskAdminActor(actor.roles)) {
    const actingTeacherId = await requireActingTeacher(prisma, actor)
    const teacher = await prisma.teacher.findFirst({
      where: { id: actingTeacherId, schoolId },
      select: {
        firstName: true,
        lastName: true,
        teacherSubjects: {
          select: { subject: { select: { id: true, code: true, name: true } } },
        },
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

    const classById = new Map<string, { id: string; name: string; sections: { id: string; name: string }[] }>()
    for (const assignment of teacher.teacherClasses) {
      const existing = classById.get(assignment.class.id)
      const section = assignment.section
      if (section) {
        const entry = existing ?? { id: assignment.class.id, name: assignment.class.name, sections: [] }
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
      teacherId: actingTeacherId,
      teacherName: [teacher.firstName, teacher.lastName].filter(Boolean).join(" ") || null,
      subjects,
      classes: [...classById.values()],
    }
  }

  const [subjects, classes] = await prisma.$transaction([
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
  ])

  return { teacherId: null, teacherName: null, subjects, classes }
}