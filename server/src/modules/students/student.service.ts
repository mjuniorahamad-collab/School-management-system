import { Prisma } from "@prisma/client"
import type { Guardian } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { buildAdmissionNumber } from "./admission-number.js"
import { normalizeGuardianPrimaries, resolveActiveSession, resolveClassAndSection } from "./student-rules.js"
import type { CreateStudentInput, GuardianInput, ListStudentsQuery, UpdateStudentInput } from "./student.schema.js"
import type {
  Pagination,
  StudentDetail,
  StudentFiltersMeta,
  StudentListItem,
  StudentListResult,
} from "./student.types.js"
import {
  DETAIL_INCLUDE,
  LIST_INCLUDE,
  mapStudentDetail,
  mapStudentListItem,
  type StudentDetailRow,
  type StudentListItemRow,
} from "./student.mapper.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

const EXPORT_LIMIT = 10_000

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Reuses an existing school-scoped guardian by name+contact, else creates it. */
async function resolveGuardian(tx: Tx | PrismaClient, schoolId: string, input: GuardianInput) {
  const where: Prisma.GuardianWhereInput = { schoolId, name: input.name }
  if (input.phone) where.phone = input.phone
  else if (input.email) where.email = input.email

  const existing = await tx.guardian.findFirst({ where })
  if (existing) return existing

  return tx.guardian.create({
    data: {
      schoolId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
    },
  })
}

async function assertStudentExists(prisma: PrismaClient, id: string, schoolId: string): Promise<void> {
  const student = await prisma.student.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!student) throw notFoundError("Student not found")
}

export async function getStudentById(id: string, schoolId: string): Promise<StudentDetail> {
  const prisma = await requirePrisma()
  const student = await prisma.student.findFirst({ where: { id, schoolId }, include: DETAIL_INCLUDE })
  if (!student) throw notFoundError("Student not found")
  return mapStudentDetail(student as StudentDetailRow)
}

export async function createStudent(
  input: CreateStudentInput,
  schoolId: string,
  actorId: string,
): Promise<StudentDetail> {
  const prisma = await requirePrisma()
  const status = input.status ?? "ACTIVE"
  const dateOfBirth = toUtcDate(input.dateOfBirth)
  const admissionDate = input.admissionDate ? toUtcDate(input.admissionDate) : startOfTodayUtc()
  const guardians = normalizeGuardianPrimaries(input.guardians)

  const session = await resolveActiveSession(prisma, schoolId, input.academicSessionId)
  const { classId, sectionId } = await resolveClassAndSection(prisma, schoolId, input.classId, input.sectionId)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const school = await tx.school.update({
        where: { id: schoolId },
        data: { admissionCounter: { increment: 1 } },
      })
      const admissionNumber = buildAdmissionNumber(
        admissionDate.getUTCFullYear(),
        school.admissionCounter,
      )

      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNumber,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName ?? null,
          dateOfBirth,
          gender: input.gender,
          photoUrl: input.photoUrl ?? null,
          status,
          email: input.email ?? null,
          phone: input.phone ?? null,
          addressLine1: input.addressLine1 ?? null,
          addressLine2: input.addressLine2 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,
          admissionDate,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
          createdBy: actorId,
          updatedBy: actorId,
        },
      })

      await tx.studentEnrollment.create({
        data: {
          studentId: student.id,
          academicSessionId: session.id,
          classId,
          ...(sectionId ? { sectionId } : {}),
        },
      })

      const guardianRows: Guardian[] = []
      for (const guardian of guardians) {
        guardianRows.push(await resolveGuardian(tx, schoolId, guardian))
      }
      await tx.studentGuardian.createMany({
        data: guardians.map((guardian, index) => ({
          studentId: student.id,
          guardianId: guardianRows[index].id,
          relationshipType: guardian.relationshipType,
          isPrimary: guardian.isPrimary,
          isEmergencyContact: guardian.isEmergencyContact,
        })),
      })

      return student
    })

    return getStudentById(created.id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A student with this admission number already exists")
    }
    throw error
  }
}

export async function updateStudent(
  id: string,
  input: UpdateStudentInput,
  schoolId: string,
  actorId: string,
): Promise<StudentDetail> {
  const prisma = await requirePrisma()
  await assertStudentExists(prisma, id, schoolId)

  const { classId, sectionId } = input
  const wantsPlacementChange = classId !== undefined || sectionId !== undefined
  if (wantsPlacementChange && classId === undefined) {
    throw badRequestError("Changing placement requires a class")
  }

  await prisma.$transaction(async (tx) => {
    if (wantsPlacementChange) {
      const session = await resolveActiveSession(prisma, schoolId)
      const resolved = await resolveClassAndSection(prisma, schoolId, classId!, sectionId)
      await tx.studentEnrollment.upsert({
        where: { studentId_academicSessionId: { studentId: id, academicSessionId: session.id } },
        update: { classId: resolved.classId, sectionId: resolved.sectionId },
        create: {
          studentId: id,
          academicSessionId: session.id,
          classId: resolved.classId,
          ...(resolved.sectionId ? { sectionId: resolved.sectionId } : {}),
        },
      })
    }

    const data: Prisma.StudentUncheckedUpdateInput = { updatedBy: actorId }
    const scalarFields = [
      "firstName",
      "middleName",
      "lastName",
      "dateOfBirth",
      "gender",
      "status",
      "photoUrl",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "admissionDate",
      "emergencyContactName",
      "emergencyContactPhone",
    ] as const satisfies readonly (keyof UpdateStudentInput)[]
    // Columns that are nullable in the Student model and may be explicitly cleared.
    const nullableFields = new Set<string>([
      "middleName",
      "lastName",
      "photoUrl",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "emergencyContactName",
      "emergencyContactPhone",
    ])
    for (const field of scalarFields) {
      if (field in input && input[field] !== undefined) {
        const value = input[field]
        if (value === null && nullableFields.has(field)) {
          data[field] = null as never
        } else if (field === "dateOfBirth" || field === "admissionDate") {
          data[field] = toUtcDate(value as string)
        } else {
          data[field] = value as never
        }
      }
    }

    await tx.student.update({ where: { id }, data })

    if (input.guardians) {
      const guardians = normalizeGuardianPrimaries(input.guardians)
      const guardianRows: Guardian[] = []
      for (const guardian of guardians) {
        guardianRows.push(await resolveGuardian(tx, schoolId, guardian))
      }
      await tx.studentGuardian.deleteMany({ where: { studentId: id } })
      await tx.studentGuardian.createMany({
        data: guardians.map((guardian, index) => ({
          studentId: id,
          guardianId: guardianRows[index].id,
          relationshipType: guardian.relationshipType,
          isPrimary: guardian.isPrimary,
          isEmergencyContact: guardian.isEmergencyContact,
        })),
      })
    }
  })

  return getStudentById(id, schoolId)
}

export async function listStudents(
  query: ListStudentsQuery,
  schoolId: string,
): Promise<StudentListResult> {
  const prisma = await requirePrisma()
  const resolvedSessionId = await resolveListSession(prisma, schoolId, query.sessionId)
  const where = buildListWhere(schoolId, query, resolvedSessionId)
  const orderBy = buildListOrder(query)

  const page = query.page
  const pageSize = query.pageSize
  const [total, rows] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({
      where,
      include: LIST_INCLUDE(resolvedSessionId),
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const items = rows.map((row) => mapStudentListItem(row as StudentListItemRow))
  const pagination: Pagination = {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
  return { items, pagination }
}

/** Resolves the session the list defaults to (the school's ACTIVE session). */
async function resolveListSession(
  prisma: PrismaClient,
  schoolId: string,
  sessionId?: string,
): Promise<string | null> {
  if (sessionId) {
    const session = await prisma.academicSession.findFirst({ where: { id: sessionId, schoolId } })
    if (!session) throw badRequestError("Academic session is not valid for this school")
    return session.id
  }
  const active = await prisma.academicSession.findFirst({
    where: { schoolId, status: "ACTIVE" },
    select: { id: true },
  })
  return active?.id ?? null
}

function buildListWhere(
  schoolId: string,
  query: ListStudentsQuery,
  resolvedSessionId: string | null,
): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { schoolId }
  if (query.status) where.status = query.status

  const search = query.search?.trim()
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { admissionNumber: { contains: search, mode: "insensitive" } },
      {
        studentGuardians: {
          some: { guardian: { name: { contains: search, mode: "insensitive" } } },
        },
      },
    ]
  }

  const hasAcademicFilter =
    resolvedSessionId !== null || query.classId !== undefined || query.sectionId !== undefined
  if (hasAcademicFilter) {
    where.enrollments = {
      some: {
        ...(resolvedSessionId ? { academicSessionId: resolvedSessionId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      },
    }
  }

  return where
}

function buildListOrder(query: ListStudentsQuery): Prisma.StudentOrderByWithRelationInput[] {
  const dir = query.sortDir
  switch (query.sortBy) {
    case "admissionNumber":
      return [{ admissionNumber: dir }]
    case "admissionDate":
      return [{ admissionDate: dir }]
    default:
      return [{ lastName: dir }, { firstName: dir }]
  }
}

export async function getStudentsMeta(schoolId: string): Promise<StudentFiltersMeta> {
  const prisma = await requirePrisma()
  const [academicSessions, classes] = await Promise.all([
    prisma.academicSession.findMany({
      where: { schoolId },
      orderBy: { startDate: "desc" },
      select: { id: true, name: true, code: true, status: true },
    }),
    prisma.class.findMany({
      where: { schoolId },
      orderBy: { sortOrder: "asc" },
      include: {
        sections: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
  ])

  return {
    academicSessions,
    classes: classes.map((cls) => ({ id: cls.id, name: cls.name, sections: cls.sections })),
  }
}

export async function exportStudentsCsv(query: ListStudentsQuery, schoolId: string): Promise<string> {
  const prisma = await requirePrisma()
  const resolvedSessionId = await resolveListSession(prisma, schoolId, query.sessionId)
  const where = buildListWhere(schoolId, query, resolvedSessionId)

  const rows = await prisma.student.findMany({
    where,
    include: LIST_INCLUDE(resolvedSessionId),
    orderBy: buildListOrder(query),
    take: EXPORT_LIMIT,
  })
  const items = rows.map((row) => mapStudentListItem(row as StudentListItemRow))
  return studentListToCsv(items)
}

/** Serializes the current student list to a CSV document (BOM-prefixed for Excel). */
export function studentListToCsv(items: StudentListItem[]): string {
  const header = [
    "Admission No.",
    "Name",
    "Class",
    "Section",
    "Gender",
    "Status",
    "Primary Guardian",
    "Email",
    "Phone",
    "City",
    "State",
    "Admission Date",
    "Date of Birth",
  ]
  const escapeCell = (value: string | null | undefined): string => {
    const text = value ?? ""
    return `"${text.replace(/"/g, '""')}"`
  }
  const rows = items.map((item) => [
    item.admissionNumber,
    item.name,
    item.class?.name ?? "",
    item.section?.name ?? "",
    item.gender,
    item.status,
    item.primaryGuardian?.name ?? "",
    item.email,
    item.phone,
    item.city,
    item.state,
    item.admissionDate,
    item.dateOfBirth,
  ])
  const body = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")
  return `\uFEFF${body}`
}
