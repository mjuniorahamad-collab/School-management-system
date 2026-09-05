import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { CreateStaffInput, ListStaffsQuery, UpdateStaffInput } from "./staff.schema.js"
import { mapStaffDetail, mapStaffListItem } from "./staff.mapper.js"
import type { StaffDetail, StaffListResult, StaffMeta } from "./staff.types.js"
import { buildStaffNumber } from "./staff-number.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listStaffs(
  query: ListStaffsQuery,
  schoolId: string,
): Promise<StaffListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.StaffWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { middleName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
      { employeeId: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
    ]
  }
  if (query.status) where.status = query.status
  if (query.department) where.department = { contains: query.department, mode: "insensitive" }
  if (query.designation) where.designation = { contains: query.designation, mode: "insensitive" }
  if (query.gender) where.gender = query.gender

  const [total, rows] = await prisma.$transaction([
    prisma.staff.count({ where }),
    prisma.staff.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  return {
    items: rows.map(mapStaffListItem),
    total,
  }
}

export async function getStaffById(id: string, schoolId: string): Promise<StaffDetail> {
  const prisma = await requirePrisma()
  const staff = await prisma.staff.findFirst({ where: { id, schoolId } })
  if (!staff) throw notFoundError("Staff member not found")
  return mapStaffDetail(staff)
}

export async function getStaffMeta(schoolId: string): Promise<StaffMeta> {
  const prisma = await requirePrisma()
  const rows = await prisma.staff.findMany({
    where: { schoolId },
    select: { department: true, designation: true },
  })
  const departments = [...new Set(rows.map((r) => r.department))].sort()
  const designations = [...new Set(rows.map((r) => r.designation))].sort()
  return { departments, designations }
}

export async function createStaff(
  input: CreateStaffInput,
  schoolId: string,
  actor: AuthUser,
): Promise<StaffDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    return await prisma.$transaction(async (tx) => {
      const updatedSchool = await tx.school.update({
        where: { id: schoolId },
        data: { staffCounter: { increment: 1 } },
      })
      const year = new Date().getFullYear()
      const employeeId = buildStaffNumber(year, updatedSchool.staffCounter - 1)

      const dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
      const joiningDate = new Date(input.joiningDate)

      const staff = await tx.staff.create({
        data: {
          schoolId,
          employeeId,
          firstName: input.firstName,
          middleName: input.middleName ?? null,
          lastName: input.lastName ?? null,
          gender: input.gender as "MALE" | "FEMALE" | "OTHER",
          dateOfBirth,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          department: input.department,
          designation: input.designation,
          qualification: input.qualification ?? null,
          experience: input.experience ?? null,
          joiningDate,
          status: (input.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE") ?? "ACTIVE",
          photoUrl: input.photoUrl ?? null,
          emergencyContactName: input.emergencyContactName ?? null,
          emergencyContactRelationship: input.emergencyContactRelationship ?? null,
          emergencyContactPhone: input.emergencyContactPhone ?? null,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "STAFF",
        entityId: staff.id,
        summary: `Added staff member ${staff.firstName} ${staff.lastName ?? ""} (${employeeId})`,
        metadata: {
          employeeId,
          department: staff.department,
          designation: staff.designation,
        },
      })

      return mapStaffDetail(staff)
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A staff member with this employee ID already exists")
    }
    throw error
  }
}

export async function updateStaff(
  id: string,
  input: UpdateStaffInput,
  schoolId: string,
  actor: AuthUser,
): Promise<StaffDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.staff.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Staff member not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const data: Prisma.StaffUncheckedUpdateInput = {}
  if (input.firstName !== undefined) data.firstName = input.firstName
  if (input.middleName !== undefined) data.middleName = input.middleName ?? null
  if (input.lastName !== undefined) data.lastName = input.lastName ?? null
  if (input.gender !== undefined) data.gender = input.gender as "MALE" | "FEMALE" | "OTHER"
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
  if (input.email !== undefined) data.email = input.email ?? null
  if (input.phone !== undefined) data.phone = input.phone ?? null
  if (input.address !== undefined) data.address = input.address ?? null
  if (input.department !== undefined) data.department = input.department
  if (input.designation !== undefined) data.designation = input.designation
  if (input.qualification !== undefined) data.qualification = input.qualification ?? null
  if (input.experience !== undefined) data.experience = input.experience ?? null
  if (input.joiningDate !== undefined) data.joiningDate = new Date(input.joiningDate)
  if (input.status !== undefined) data.status = input.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE"
  if (input.photoUrl !== undefined) data.photoUrl = input.photoUrl ?? null
  if (input.emergencyContactName !== undefined) data.emergencyContactName = input.emergencyContactName ?? null
  if (input.emergencyContactRelationship !== undefined) data.emergencyContactRelationship = input.emergencyContactRelationship ?? null
  if (input.emergencyContactPhone !== undefined) data.emergencyContactPhone = input.emergencyContactPhone ?? null

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.staff.update({ where: { id }, data })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: input.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
        entityType: "STAFF",
        entityId: id,
        summary:
          input.status !== undefined
            ? `Changed staff status to ${input.status}`
            : "Updated staff record",
        diff: {
          fields: [
            ...(input.status !== undefined
              ? [{ field: "status", before: undefined, after: input.status }]
              : []),
            ...(input.department !== undefined
              ? [{ field: "department", after: input.department }]
              : []),
            ...(input.designation !== undefined
              ? [{ field: "designation", after: input.designation }]
              : []),
          ],
        },
      })

      return row
    })
    return mapStaffDetail(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A staff member with this employee ID already exists")
    }
    throw error
  }
}
