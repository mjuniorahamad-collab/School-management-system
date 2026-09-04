import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { conflictMessage } from "./timetable.rules.js"
import type {
  CopyTimetableDayInput,
  CreateTimetableEntryInput,
  ListTimetableQuery,
  UpdateTimetableEntryInput,
} from "./timetable.schema.js"
import { toTimetableEntryDetail, toTimetableEntryListItem } from "./timetable.mapper.js"
import type { TimetableEntryDetail, TimetableEntryListResult } from "./timetable.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

const ENTRY_INCLUDE = {
  periodSlot: { select: { name: true, startTime: true, endTime: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
  subject: { select: { name: true, code: true } },
  teacher: { select: { firstName: true, lastName: true } },
} satisfies Prisma.TimetableEntryInclude

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listTimetableEntries(
  query: ListTimetableQuery,
  schoolId: string,
): Promise<TimetableEntryListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TimetableEntryWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.teacherId) where.teacherId = query.teacherId
  if (query.dayOfWeek) where.dayOfWeek = query.dayOfWeek

  const [total, rows] = await prisma.$transaction([
    prisma.timetableEntry.count({ where }),
    prisma.timetableEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: [
        { dayOfWeek: "asc" },
        { periodSlot: { sortOrder: "asc" } },
      ],
    }),
  ])

  return {
    items: rows.map(toTimetableEntryListItem),
    total,
  }
}

export async function getTimetableEntryById(
  id: string,
  schoolId: string,
): Promise<TimetableEntryDetail> {
  const prisma = await requirePrisma()
  const entry = await prisma.timetableEntry.findFirst({
    where: { id, schoolId },
    include: ENTRY_INCLUDE,
  })
  if (!entry) throw notFoundError("Timetable entry not found")
  return toTimetableEntryDetail(entry)
}

export async function createTimetableEntry(
  input: CreateTimetableEntryInput,
  schoolId: string,
): Promise<TimetableEntryDetail> {
  const prisma = await requirePrisma()

  await validateForeignKeys(prisma, input, schoolId)

  try {
    const created = await prisma.timetableEntry.create({
      data: {
        schoolId,
        academicSessionId: input.academicSessionId,
        dayOfWeek: input.dayOfWeek,
        periodSlotId: input.periodSlotId,
        classId: input.classId,
        sectionId: input.sectionId ?? null,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
      },
      include: ENTRY_INCLUDE,
    })
    return toTimetableEntryDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[]) ?? []
      if (target.some((t) => t.includes("teacher"))) {
        throw badRequestError(conflictMessage("teacher"))
      }
      throw badRequestError(conflictMessage("class"))
    }
    throw error
  }
}

export async function updateTimetableEntry(
  id: string,
  input: UpdateTimetableEntryInput,
  schoolId: string,
): Promise<TimetableEntryDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.timetableEntry.findFirst({
    where: { id, schoolId },
    select: { id: true, academicSessionId: true, classId: true, sectionId: true, subjectId: true, teacherId: true, dayOfWeek: true, periodSlotId: true },
  })
  if (!existing) throw notFoundError("Timetable entry not found")

  const data: Prisma.TimetableEntryUncheckedUpdateInput = {}
  if (input.academicSessionId !== undefined) data.academicSessionId = input.academicSessionId
  if (input.dayOfWeek !== undefined) data.dayOfWeek = input.dayOfWeek
  if (input.periodSlotId !== undefined) data.periodSlotId = input.periodSlotId
  if (input.classId !== undefined) data.classId = input.classId
  if (input.sectionId !== undefined) data.sectionId = input.sectionId ?? null
  if (input.subjectId !== undefined) data.subjectId = input.subjectId
  if (input.teacherId !== undefined) data.teacherId = input.teacherId

  if (Object.keys(data).length === 0) {
    return getTimetableEntryById(id, schoolId)
  }

  await validateForeignKeys(prisma, {
    academicSessionId: (data.academicSessionId as string) ?? existing.academicSessionId,
    classId: (data.classId as string) ?? existing.classId,
    sectionId: (data.sectionId as string | null | undefined) !== undefined
      ? (data.sectionId as string | null)
      : existing.sectionId,
    subjectId: (data.subjectId as string) ?? existing.subjectId,
    teacherId: (data.teacherId as string) ?? existing.teacherId,
  }, schoolId)

  try {
    const updated = await prisma.timetableEntry.update({
      where: { id },
      data,
      include: ENTRY_INCLUDE,
    })
    return toTimetableEntryDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = (error.meta?.target as string[]) ?? []
      if (target.some((t) => t.includes("teacher"))) {
        throw badRequestError(conflictMessage("teacher"))
      }
      throw badRequestError(conflictMessage("class"))
    }
    throw error
  }
}

export async function deleteTimetableEntry(id: string, schoolId: string): Promise<void> {
  const prisma = await requirePrisma()
  const existing = await prisma.timetableEntry.findFirst({
    where: { id, schoolId },
    select: { id: true },
  })
  if (!existing) throw notFoundError("Timetable entry not found")
  await prisma.timetableEntry.delete({ where: { id } })
}

export async function copyTimetableDay(
  input: CopyTimetableDayInput,
  schoolId: string,
): Promise<{ copied: number }> {
  if (input.sourceDay === input.targetDay) {
    throw badRequestError("Source day and target day must be different")
  }

  const prisma = await requirePrisma()

  const sourceEntries = await prisma.timetableEntry.findMany({
    where: {
      schoolId,
      academicSessionId: input.academicSessionId,
      dayOfWeek: input.sourceDay,
    },
  })

  if (sourceEntries.length === 0) {
    return { copied: 0 }
  }

  // Delete existing entries for the target day before copying.
  await prisma.timetableEntry.deleteMany({
    where: {
      schoolId,
      academicSessionId: input.academicSessionId,
      dayOfWeek: input.targetDay,
    },
  })

  let copied = 0
  for (const entry of sourceEntries) {
    try {
      await prisma.timetableEntry.create({
        data: {
          schoolId,
          academicSessionId: entry.academicSessionId,
          dayOfWeek: input.targetDay,
          periodSlotId: entry.periodSlotId,
          classId: entry.classId,
          sectionId: entry.sectionId,
          subjectId: entry.subjectId,
          teacherId: entry.teacherId,
        },
      })
      copied++
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Skip conflicting entries silently — partial copy is acceptable.
        continue
      }
      throw error
    }
  }

  return { copied }
}

async function validateForeignKeys(
  prisma: PrismaClient,
  input: {
    academicSessionId: string
    classId: string
    sectionId?: string | null
    subjectId?: string
    teacherId?: string
  },
  schoolId: string,
): Promise<void> {
  if (input.classId) {
    const cls = await prisma.class.findFirst({
      where: { id: input.classId, schoolId },
      select: { id: true },
    })
    if (!cls) throw badRequestError("Class not found in this school")
  }

  if (input.sectionId) {
    const section = await prisma.section.findFirst({
      where: { id: input.sectionId, classId: input.classId },
      select: { id: true, classId: true },
    })
    if (!section) throw badRequestError("Section not found or does not belong to the selected class")
  }

  if (input.subjectId) {
    const subject = await prisma.subject.findFirst({
      where: { id: input.subjectId, schoolId },
      select: { id: true },
    })
    if (!subject) throw badRequestError("Subject not found in this school")
  }

  if (input.teacherId) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: input.teacherId, schoolId },
      select: { id: true },
    })
    if (!teacher) throw badRequestError("Teacher not found in this school")
  }

  if (input.academicSessionId) {
    const session = await prisma.academicSession.findFirst({
      where: { id: input.academicSessionId, schoolId },
      select: { id: true },
    })
    if (!session) throw badRequestError("Academic session not found in this school")
  }
}
