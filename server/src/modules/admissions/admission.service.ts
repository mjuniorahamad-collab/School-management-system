import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { buildAdmissionApplicationNumber } from "../../lib/id-generators.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { buildAdmissionNumber } from "../students/admission-number.js"
import {
  resolveActiveSession,
  resolveClassAndSection,
} from "../students/student-rules.js"
import { toAdmissionDetail, toAdmissionListItem } from "./admission.mapper.js"
import { assertConvertible, assertReviewable } from "./admission.rules.js"
import type {
  ConvertAdmissionInput,
  CreateAdmissionInput,
  ListAdmissionsQuery,
  ReviewAdmissionInput,
  UpdateAdmissionInput,
} from "./admission.schema.js"
import type {
  AdmissionConvertResult,
  AdmissionDetail,
  AdmissionListResult,
  AdmissionMeta,
} from "./admission.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type Tx = Prisma.TransactionClient

const DETAIL_INCLUDE = {
  preferredAcademicSession: {
    select: { id: true, name: true, code: true, status: true },
  },
  preferredClass: { select: { id: true, name: true } },
  preferredSection: { select: { id: true, name: true } },
  convertedStudent: { select: { id: true, admissionNumber: true } },
} as const

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

async function findApplication(prisma: PrismaClient, id: string, schoolId: string) {
  return prisma.admissionApplication.findFirst({
    where: { id, schoolId },
    include: DETAIL_INCLUDE,
  })
}

export async function getAdmissionById(id: string, schoolId: string): Promise<AdmissionDetail> {
  const prisma = await requirePrisma()
  const application = await findApplication(prisma, id, schoolId)
  if (!application) throw notFoundError("Admission application not found")
  return toAdmissionDetail(application)
}

export async function listAdmissions(
  query: ListAdmissionsQuery,
  schoolId: string,
): Promise<AdmissionListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize } = query

  const where: Prisma.AdmissionApplicationWhereInput = { schoolId }
  if (query.status) where.status = query.status
  if (query.search) {
    const search = query.search.trim()
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { applicationNumber: { contains: search, mode: "insensitive" } },
      { guardianName: { contains: search, mode: "insensitive" } },
    ]
  }

  const orderBy: Prisma.AdmissionApplicationOrderByWithRelationInput[] =
    query.sortBy === "applicationNumber"
      ? [{ applicationNumber: query.sortDir }]
      : query.sortBy === "name"
        ? [{ lastName: query.sortDir }, { firstName: query.sortDir }]
        : [{ createdAt: query.sortDir }]

  const [total, rows] = await prisma.$transaction([
    prisma.admissionApplication.count({ where }),
    prisma.admissionApplication.findMany({
      where,
      include: {
        preferredClass: { select: { id: true, name: true } },
        preferredSection: { select: { id: true, name: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const pagination = {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  }
  return { items: rows.map(toAdmissionListItem), pagination }
}

export async function createAdmission(
  input: CreateAdmissionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AdmissionDetail> {
  const prisma = await requirePrisma()
  await validatePreferences(prisma, schoolId, input)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const school = await tx.school.update({
        where: { id: schoolId },
        data: { admissionApplicationCounter: { increment: 1 } },
      })
      const applicationNumber = buildAdmissionApplicationNumber(
        new Date().getUTCFullYear(),
        school.admissionApplicationCounter,
      )
      const application = await tx.admissionApplication.create({
        data: {
          schoolId,
          applicationNumber,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName ?? null,
          dateOfBirth: toUtcDate(input.dateOfBirth),
          gender: input.gender,
          email: input.email ?? null,
          phone: input.phone ?? null,
          addressLine1: input.addressLine1 ?? null,
          addressLine2: input.addressLine2 ?? null,
          city: input.city ?? null,
          state: input.state ?? null,
          postalCode: input.postalCode ?? null,
          preferredAcademicSessionId: input.preferredAcademicSessionId ?? null,
          preferredClassId: input.preferredClassId ?? null,
          preferredSectionId: input.preferredSectionId ?? null,
          guardianName: input.guardianName,
          guardianPhone: input.guardianPhone ?? null,
          guardianEmail: input.guardianEmail ?? null,
          guardianRelationshipType: input.guardianRelationshipType ?? "PARENT",
          createdBy: actor.id,
          updatedBy: actor.id,
        },
        include: DETAIL_INCLUDE,
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "ADMISSION",
        entityId: application.id,
        summary: `Received admission application ${applicationNumber} for ${application.firstName} ${application.lastName ?? ""}`,
        metadata: { applicationNumber, guardianName: application.guardianName },
      })

      return application
    })
    return toAdmissionDetail(created)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("An admission application with this number already exists")
    }
    throw error
  }
}

export async function updateAdmission(
  id: string,
  input: UpdateAdmissionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AdmissionDetail> {
  const prisma = await requirePrisma()
  const current = await findApplication(prisma, id, schoolId)
  if (!current) throw notFoundError("Admission application not found")
  if (current.status !== "PENDING") {
    throw badRequestError("Only a pending application can be edited")
  }

  await validatePreferences(prisma, schoolId, input)
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const data: Prisma.AdmissionApplicationUncheckedUpdateInput = { updatedBy: actor.id }
  const scalarFields = [
    "firstName",
    "middleName",
    "lastName",
    "dateOfBirth",
    "gender",
    "email",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "guardianName",
    "guardianPhone",
    "guardianEmail",
    "guardianRelationshipType",
  ] as const satisfies readonly (keyof UpdateAdmissionInput)[]
  const clearableFields = new Set<string>([
    "middleName",
    "lastName",
    "email",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "guardianPhone",
    "guardianEmail",
  ])
  for (const field of scalarFields) {
    if (field in input && input[field] !== undefined) {
      const value = input[field]
      if (value === null && clearableFields.has(field)) {
        data[field] = null as never
      } else if (field === "dateOfBirth") {
        data[field] = toUtcDate(value as string)
      } else {
        data[field] = value as never
      }
    }
  }

  type PreferredIdKey = "preferredAcademicSessionId" | "preferredClassId" | "preferredSectionId"
  const preferId: { key: PreferredIdKey; value?: string | null }[] = [
    { key: "preferredAcademicSessionId", value: input.preferredAcademicSessionId },
    { key: "preferredClassId", value: input.preferredClassId },
    { key: "preferredSectionId", value: input.preferredSectionId },
  ]
  for (const { key, value } of preferId) {
    if (value !== undefined) data[key] = (value ?? null) as never
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.admissionApplication.update({
      where: { id },
      data,
      include: DETAIL_INCLUDE,
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "ADMISSION",
      entityId: id,
      summary: `Updated admission application ${row.applicationNumber}`,
    })

    return row
  })
  return toAdmissionDetail(updated)
}

export async function reviewAdmission(
  id: string,
  input: ReviewAdmissionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AdmissionDetail> {
  const prisma = await requirePrisma()
  const current = await findApplication(prisma, id, schoolId)
  if (!current) throw notFoundError("Admission application not found")
  assertReviewable(current)

  const status =
    input.status === "APPROVED"
      ? "APPROVED"
      : input.status === "REJECTED"
        ? "REJECTED"
        : "WITHDRAWN"

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.admissionApplication.update({
      where: { id },
      data: {
        status,
        reviewNote: input.note?.trim() ? input.note.trim() : null,
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        updatedBy: actor.id,
      },
      include: DETAIL_INCLUDE,
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "REVIEW",
      entityType: "ADMISSION",
      entityId: id,
      summary: `Reviewed admission application ${row.applicationNumber} as ${status}`,
      diff: {
        fields: [
          { field: "status", before: current.status, after: status },
          ...(input.note?.trim() ? [{ field: "reviewNote", after: input.note.trim() }] : []),
        ],
      },
    })

    return row
  })
  return toAdmissionDetail(updated)
}

export async function convertAdmission(
  id: string,
  input: ConvertAdmissionInput,
  schoolId: string,
  actor: AuthUser,
): Promise<AdmissionConvertResult> {
  const prisma = await requirePrisma()
  const current = await findApplication(prisma, id, schoolId)
  if (!current) throw notFoundError("Admission application not found")
  assertConvertible(current)

  // Resolve placement before opening the write transaction so invalid
  // placements fail fast with a clear message.
  const session = await resolveActiveSession(prisma, schoolId, input.academicSessionId)
  const { classId, sectionId } = await resolveClassAndSection(
    prisma,
    schoolId,
    input.classId,
    input.sectionId,
  )
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.update({
        where: { id: schoolId },
        data: { admissionCounter: { increment: 1 } },
      })
      const admissionNumber = buildAdmissionNumber(
        new Date().getUTCFullYear(),
        school.admissionCounter,
      )

      const [classRow, sectionRow] = await Promise.all([
        tx.class.findFirst({ where: { id: classId, schoolId }, select: { name: true } }),
        sectionId
          ? tx.section.findFirst({ where: { id: sectionId, class: { schoolId } }, select: { name: true } })
          : null,
      ])

      const student = await tx.student.create({
        data: {
          schoolId,
          admissionNumber,
          firstName: current.firstName,
          middleName: current.middleName,
          lastName: current.lastName,
          dateOfBirth: current.dateOfBirth,
          gender: current.gender,
          email: current.email,
          phone: current.phone,
          addressLine1: current.addressLine1,
          addressLine2: current.addressLine2,
          city: current.city,
          state: current.state,
          postalCode: current.postalCode,
          admissionDate: new Date(),
          createdBy: actor.id,
          updatedBy: actor.id,
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

      const existingGuardian = await tx.guardian.findFirst({
        where: {
          schoolId,
          name: current.guardianName,
          ...(current.guardianPhone
            ? { phone: current.guardianPhone }
            : current.guardianEmail
              ? { email: current.guardianEmail }
              : {}),
        },
        select: { id: true },
      })
      const guardian = existingGuardian
        ?? await tx.guardian.create({
          data: {
            schoolId,
            name: current.guardianName,
            phone: current.guardianPhone,
            email: current.guardianEmail,
          },
        })
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationshipType: current.guardianRelationshipType,
          isPrimary: true,
          isEmergencyContact: true,
        },
      })

      const updatedApplication = await tx.admissionApplication.update({
        where: { id },
        data: {
          status: "CONVERTED",
          convertedStudentId: student.id,
          convertedBy: actor.id,
          convertedAt: new Date(),
          updatedBy: actor.id,
        },
        include: DETAIL_INCLUDE,
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CONVERT",
        entityType: "ADMISSION",
        entityId: id,
        summary: `Converted admission ${updatedApplication.applicationNumber} to student ${admissionNumber}`,
        metadata: {
          applicationNumber: updatedApplication.applicationNumber,
          studentId: student.id,
          admissionNumber,
          academicSessionId: session.id,
          classId,
          sectionId: sectionId ?? null,
        },
      })

      return { application: updatedApplication, student, classRow, sectionRow }
    })

    return {
      application: toAdmissionDetail(result.application),
      student: {
        id: result.student.id,
        admissionNumber: result.student.admissionNumber,
        name: [result.student.firstName, result.student.middleName, result.student.lastName]
          .filter(Boolean)
          .join(" "),
        class: { id: classId, name: result.classRow?.name ?? "" },
        section: sectionId
          ? { id: sectionId, name: result.sectionRow?.name ?? "" }
          : null,
      },
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A student with this admission number already exists")
    }
    throw error
  }
}

export async function deleteAdmission(
  id: string,
  schoolId: string,
  actor: AuthUser,
): Promise<void> {
  const prisma = await requirePrisma()
  const application = await prisma.admissionApplication.findFirst({ where: { id, schoolId } })
  if (!application) throw notFoundError("Admission application not found")
  if (application.status !== "PENDING") {
    throw badRequestError("Only a pending admission application can be deleted")
  }
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await prisma.$transaction(async (tx) => {
    await tx.admissionApplication.delete({ where: { id } })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "DELETE",
      entityType: "ADMISSION",
      entityId: id,
      summary: `Deleted admission application ${application.applicationNumber}`,
      metadata: { applicationNumber: application.applicationNumber },
    })
  })
}

export async function getAdmissionsMeta(schoolId: string): Promise<AdmissionMeta> {
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

/**
 * Validates that any provided preferred placement references belong to the
 * school and that a preferred section belongs to the preferred class.
 */
async function validatePreferences(
  prisma: PrismaClient | Tx,
  schoolId: string,
  input: {
    preferredAcademicSessionId?: string | null
    preferredClassId?: string | null
    preferredSectionId?: string | null
  },
): Promise<void> {
  if (input.preferredAcademicSessionId) {
    const exists = await prisma.academicSession.findFirst({
      where: { id: input.preferredAcademicSessionId, schoolId },
      select: { id: true },
    })
    if (!exists) throw badRequestError("Preferred academic session is not valid for this school")
  }
  if (input.preferredClassId) {
    const cls = await prisma.class.findFirst({
      where: { id: input.preferredClassId, schoolId },
      select: { id: true },
    })
    if (!cls) throw badRequestError("Preferred class is not valid for this school")
  }
  if (input.preferredSectionId) {
    const section = await prisma.section.findFirst({
      where: { id: input.preferredSectionId, class: { schoolId } },
      select: { classId: true },
    })
    if (!section) throw badRequestError("Preferred section is not valid for this school")
    if (input.preferredClassId && section.classId !== input.preferredClassId) {
      throw badRequestError("Preferred section does not belong to the preferred class")
    }
  }
}
