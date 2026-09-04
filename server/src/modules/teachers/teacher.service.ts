import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { CreateTeacherInput, ListTeachersQuery, UpdateTeacherInput } from "./teacher.schema.js"
import { DETAIL_INCLUDE, mapTeacherDetail, mapTeacherListItem } from "./teacher.mapper.js"
import type { TeacherDetail, TeacherListResult, TeacherMeta } from "./teacher.types.js"
import { buildTeacherNumber } from "./teacher-number.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listTeachers(
  query: ListTeachersQuery,
  schoolId: string,
): Promise<TeacherListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TeacherWhereInput = { schoolId }
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
  if (query.designation) where.designation = { contains: query.designation, mode: "insensitive" }
  if (query.gender) where.gender = query.gender

  const [total, rows] = await prisma.$transaction([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  return {
    items: rows.map(mapTeacherListItem),
    total,
  }
}

export async function getTeacherById(id: string, schoolId: string): Promise<TeacherDetail> {
  const prisma = await requirePrisma()
  const teacher = await prisma.teacher.findFirst({
    where: { id, schoolId },
    include: DETAIL_INCLUDE,
  })
  if (!teacher) throw notFoundError("Teacher not found")
  return mapTeacherDetail(teacher)
}

export async function getTeacherMeta(schoolId: string): Promise<TeacherMeta> {
  const prisma = await requirePrisma()
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
  return { subjects, classes }
}

export async function createTeacher(
  input: CreateTeacherInput,
  schoolId: string,
): Promise<TeacherDetail> {
  const prisma = await requirePrisma()

  const subjectIds = input.subjectIds ?? []
  const classAssignments = input.classAssignments ?? []

  // Validate subject IDs belong to this school
  if (subjectIds.length > 0) {
    const count = await prisma.subject.count({
      where: { id: { in: subjectIds }, schoolId },
    })
    if (count !== subjectIds.length) {
      throw badRequestError("One or more subject IDs are invalid")
    }
  }

  // Validate class IDs belong to this school
  const classIds = classAssignments.map((a) => a.classId)
  if (classIds.length > 0) {
    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, schoolId },
      include: { sections: { select: { id: true } } },
    })
    const classById = new Map(classes.map((c) => [c.id, c]))
    for (const assignment of classAssignments) {
      const cls = classById.get(assignment.classId)
      if (!cls) {
        throw badRequestError("One or more class IDs are invalid for this school")
      }
      const sectionId = assignment.sectionId ?? null
      if (cls.sections.length === 0) {
        if (sectionId) throw badRequestError(`Class "${cls.name}" has no sections to assign`)
      } else if (!sectionId) {
        throw badRequestError(`Section is required for class "${cls.name}"`)
      } else if (!cls.sections.some((s) => s.id === sectionId)) {
        throw badRequestError(`Section is not valid for class "${cls.name}"`)
      }
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Increment teacher counter and generate employee ID
      const updatedSchool = await tx.school.update({
        where: { id: schoolId },
        data: { teacherCounter: { increment: 1 } },
      })
      const year = new Date().getFullYear()
      const employeeId = buildTeacherNumber(year, updatedSchool.teacherCounter - 1)

      const dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
      const joiningDate = new Date(input.joiningDate)

      const teacher = await tx.teacher.create({
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
          designation: input.designation,
          qualification: input.qualification ?? null,
          experience: input.experience ?? null,
          joiningDate,
          status: (input.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE") ?? "ACTIVE",
          photoUrl: input.photoUrl ?? null,
        },
      })

      // Connect subjects
      if (subjectIds.length > 0) {
        await tx.teacherSubject.createMany({
          data: subjectIds.map((subjectId) => ({
            teacherId: teacher.id,
            subjectId,
          })),
        })
      }

      // Connect class assignments
      if (classAssignments.length > 0) {
        await tx.teacherClass.createMany({
          data: classAssignments.map((a) => ({
            teacherId: teacher.id,
            classId: a.classId,
            sectionId: a.sectionId ?? null,
          })),
        })
      }

      return mapTeacherDetail(
        await tx.teacher.findFirstOrThrow({
          where: { id: teacher.id },
          include: DETAIL_INCLUDE,
        }),
      )
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A teacher with this employee ID already exists")
    }
    throw error
  }
}

export async function updateTeacher(
  id: string,
  input: UpdateTeacherInput,
  schoolId: string,
): Promise<TeacherDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.teacher.findFirst({ where: { id, schoolId }, select: { id: true } })
  if (!existing) throw notFoundError("Teacher not found")

  const subjectIds = input.subjectIds
  const classAssignments = input.classAssignments

  try {
    return await prisma.$transaction(async (tx) => {
      // Re-validate every subject/class/section reference against this school
      // (mirrors createTeacher) so a caller cannot link this teacher to
      // another tenant's subjects/classes by crafting IDs in the body.
      if (subjectIds !== undefined && subjectIds.length > 0) {
        const count = await tx.subject.count({
          where: { id: { in: subjectIds }, schoolId },
        })
        if (count !== subjectIds.length) {
          throw badRequestError("One or more subject IDs are invalid for this school")
        }
      }

      if (classAssignments !== undefined && classAssignments.length > 0) {
        const assignClassIds = [...new Set(classAssignments.map((a) => a.classId))]
        const classes = await tx.class.findMany({
          where: { id: { in: assignClassIds }, schoolId },
          include: { sections: { select: { id: true } } },
        })
        const classById = new Map(classes.map((c) => [c.id, c]))
        for (const assignment of classAssignments) {
          const cls = classById.get(assignment.classId)
          if (!cls) {
            throw badRequestError("One or more class IDs are invalid for this school")
          }
          const sectionId = assignment.sectionId ?? null
          if (cls.sections.length === 0) {
            if (sectionId) {
              throw badRequestError(`Class "${cls.name}" has no sections to assign`)
            }
          } else if (!sectionId) {
            throw badRequestError(`Section is required for class "${cls.name}"`)
          } else if (!cls.sections.some((s) => s.id === sectionId)) {
            throw badRequestError(`Section is not valid for class "${cls.name}"`)
          }
        }
      }

      const data: Prisma.TeacherUncheckedUpdateInput = {}
      if (input.firstName !== undefined) data.firstName = input.firstName
      if (input.middleName !== undefined) data.middleName = input.middleName ?? null
      if (input.lastName !== undefined) data.lastName = input.lastName ?? null
      if (input.gender !== undefined) data.gender = input.gender as "MALE" | "FEMALE" | "OTHER"
      if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null
      if (input.email !== undefined) data.email = input.email ?? null
      if (input.phone !== undefined) data.phone = input.phone ?? null
      if (input.address !== undefined) data.address = input.address ?? null
      if (input.designation !== undefined) data.designation = input.designation
      if (input.qualification !== undefined) data.qualification = input.qualification ?? null
      if (input.experience !== undefined) data.experience = input.experience ?? null
      if (input.joiningDate !== undefined) data.joiningDate = new Date(input.joiningDate)
      if (input.status !== undefined) data.status = input.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE"
      if (input.photoUrl !== undefined) data.photoUrl = input.photoUrl ?? null

      await tx.teacher.update({ where: { id }, data })

      // Replace subjects if provided
      if (subjectIds !== undefined) {
        await tx.teacherSubject.deleteMany({ where: { teacherId: id } })
        if (subjectIds.length > 0) {
          await tx.teacherSubject.createMany({
            data: subjectIds.map((subjectId) => ({ teacherId: id, subjectId })),
          })
        }
      }

      // Replace class assignments if provided
      if (classAssignments !== undefined) {
        await tx.teacherClass.deleteMany({ where: { teacherId: id } })
        if (classAssignments.length > 0) {
          await tx.teacherClass.createMany({
            data: classAssignments.map((a) => ({
              teacherId: id,
              classId: a.classId,
              sectionId: a.sectionId ?? null,
            })),
          })
        }
      }

      return mapTeacherDetail(
        await tx.teacher.findFirstOrThrow({
          where: { id },
          include: DETAIL_INCLUDE,
        }),
      )
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A teacher with this employee ID already exists")
    }
    throw error
  }
}
