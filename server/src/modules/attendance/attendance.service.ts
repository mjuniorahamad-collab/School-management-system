import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { computeAttendancePercent } from "./attendance.rules.js"
import type {
  AttendanceSummaryQueryInput,
  BulkMarkAttendanceInput,
  ListAttendanceQuery,
  MarkAttendanceInput,
  UpdateAttendanceInput,
} from "./attendance.schema.js"
import { toAttendanceRecordDetail, toAttendanceRecordListItem } from "./attendance.mapper.js"
import type {
  AttendanceRecordDetail,
  AttendanceRecordListResult,
  AttendanceSummaryItem,
  AttendanceSummaryResult,
} from "./attendance.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

const RECORD_INCLUDE = {
  student: { select: { firstName: true, lastName: true, admissionNumber: true } },
  class: { select: { name: true } },
  section: { select: { name: true } },
  markedByUser: { select: { name: true } },
} satisfies Prisma.AttendanceRecordInclude

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listAttendanceRecords(
  query: ListAttendanceQuery,
  schoolId: string,
): Promise<AttendanceRecordListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.AttendanceRecordWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  if (query.studentId) where.studentId = query.studentId
  if (query.dateFrom || query.dateTo) {
    where.date = {}
    if (query.dateFrom) where.date.gte = new Date(`${query.dateFrom}T00:00:00.000Z`)
    if (query.dateTo) where.date.lte = new Date(`${query.dateTo}T23:59:59.999Z`)
  }

  const [total, rows] = await prisma.$transaction([
    prisma.attendanceRecord.count({ where }),
    prisma.attendanceRecord.findMany({
      where,
      include: RECORD_INCLUDE,
      orderBy: [{ date: "desc" }, { student: { firstName: "asc" } }],
    }),
  ])

  return {
    items: rows.map(toAttendanceRecordListItem),
    total,
  }
}

export async function getAttendanceRecordById(
  id: string,
  schoolId: string,
): Promise<AttendanceRecordDetail> {
  const prisma = await requirePrisma()
  const record = await prisma.attendanceRecord.findFirst({
    where: { id, schoolId },
    include: RECORD_INCLUDE,
  })
  if (!record) throw notFoundError("Attendance record not found")
  return toAttendanceRecordDetail(record)
}

export async function markAttendance(
  input: MarkAttendanceInput,
  schoolId: string,
  userId: string,
): Promise<AttendanceRecordDetail> {
  const prisma = await requirePrisma()
  const date = new Date(input.date)

  const enrollment = await findEnrollment(
    prisma,
    input.studentId,
    input.academicSessionId,
    schoolId,
    input.classId,
    input.sectionId ?? null,
  )

  try {
    const record = await prisma.attendanceRecord.upsert({
      where: {
        schoolId_enrollmentId_date: {
          schoolId,
          enrollmentId: enrollment.id,
          date,
        },
      },
      create: {
        schoolId,
        academicSessionId: input.academicSessionId,
        classId: enrollment.classId,
        sectionId: enrollment.sectionId,
        date,
        studentId: input.studentId,
        enrollmentId: enrollment.id,
        status: input.status,
        note: input.note ?? null,
        markedBy: userId,
      },
      update: {
        status: input.status,
        note: input.note ?? null,
        markedBy: userId,
      },
      include: RECORD_INCLUDE,
    })
    return toAttendanceRecordDetail(record)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw badRequestError("Invalid student or enrollment reference")
    }
    throw error
  }
}

export async function bulkMarkAttendance(
  input: BulkMarkAttendanceInput,
  schoolId: string,
  userId: string,
): Promise<{ marked: number }> {
  const prisma = await requirePrisma()
  const date = new Date(input.date)

  const studentIds = input.records.map((r) => r.studentId)
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      studentId: { in: studentIds },
      academicSessionId: input.academicSessionId,
      classId: input.classId,
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
    },
    include: {
      student: { select: { schoolId: true } },
    },
  })

  const enrollmentMap = new Map(
    enrollments
      .filter((e) => e.student.schoolId === schoolId)
      .map((e) => [e.studentId, e]),
  )

  let marked = 0

  for (const record of input.records) {
    const enrollment = enrollmentMap.get(record.studentId)
    if (!enrollment) continue

    try {
      await prisma.attendanceRecord.upsert({
        where: {
          schoolId_enrollmentId_date: {
            schoolId,
            enrollmentId: enrollment.id,
            date,
          },
        },
        create: {
          schoolId,
          academicSessionId: input.academicSessionId,
          classId: enrollment.classId,
          sectionId: enrollment.sectionId,
          date,
          studentId: record.studentId,
          enrollmentId: enrollment.id,
          status: record.status,
          note: record.note ?? null,
          markedBy: userId,
        },
        update: {
          status: record.status,
          note: record.note ?? null,
          markedBy: userId,
        },
      })
      marked++
    } catch {
      // Skip failed records silently in bulk mode.
      continue
    }
  }

  return { marked }
}

export async function updateAttendanceRecord(
  id: string,
  input: UpdateAttendanceInput,
  schoolId: string,
): Promise<AttendanceRecordDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.attendanceRecord.findFirst({
    where: { id, schoolId },
    select: { id: true },
  })
  if (!existing) throw notFoundError("Attendance record not found")

  const data: Prisma.AttendanceRecordUncheckedUpdateInput = {}
  if (input.status !== undefined) data.status = input.status
  if (input.note !== undefined) data.note = input.note ?? null

  if (Object.keys(data).length === 0) {
    return getAttendanceRecordById(id, schoolId)
  }

  const updated = await prisma.attendanceRecord.update({
    where: { id },
    data,
    include: RECORD_INCLUDE,
  })
  return toAttendanceRecordDetail(updated)
}

export async function deleteAttendanceRecord(id: string, schoolId: string): Promise<void> {
  const prisma = await requirePrisma()
  const existing = await prisma.attendanceRecord.findFirst({
    where: { id, schoolId },
    select: { id: true },
  })
  if (!existing) throw notFoundError("Attendance record not found")
  await prisma.attendanceRecord.delete({ where: { id } })
}

export async function getAttendanceSummary(
  query: AttendanceSummaryQueryInput,
  schoolId: string,
): Promise<AttendanceSummaryResult> {
  const prisma = await requirePrisma()
  const dateFrom = new Date(`${query.dateFrom}T00:00:00.000Z`)
  const dateTo = new Date(`${query.dateTo}T23:59:59.999Z`)

  // Find all students enrolled in this class/section for this session.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicSessionId: query.academicSessionId,
      classId: query.classId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      student: { schoolId, status: "ACTIVE" },
    },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
    },
    orderBy: { student: { firstName: "asc" } },
  })

  // Find all attendance records for this class in the date range.
  const attendanceRecords = await prisma.attendanceRecord.findMany({
    where: {
      schoolId,
      academicSessionId: query.academicSessionId,
      classId: query.classId,
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      date: { gte: dateFrom, lte: dateTo },
    },
    select: {
      enrollmentId: true,
      status: true,
      date: true,
    },
  })

  // Count total school days (distinct calendar dates with any records in range).
  // Derived from the records already fetched above — the typed filter (gte/lte,
  // UTC day boundaries) reliably applies the range, whereas a raw SQL DISTINCT
  // query with bound Date parameters is prone to timezone-cast drift on the
  // @db.Date column. Using the fetched set keeps totalDays consistent with the
  // per-student stats computed from the same records.
  const totalDays = new Set(attendanceRecords.map((r) => r.date.toISOString().slice(0, 10))).size

  // Build per-enrollment stats.
  const statsMap = new Map<string, { present: number; absent: number; late: number; holiday: number }>()

  for (const record of attendanceRecords) {
    const existing = statsMap.get(record.enrollmentId) ?? { present: 0, absent: 0, late: 0, holiday: 0 }
    switch (record.status) {
      case "PRESENT":
        existing.present++
        break
      case "ABSENT":
        existing.absent++
        break
      case "LATE":
        existing.late++
        break
      case "HOLIDAY":
        existing.holiday++
        break
    }
    statsMap.set(record.enrollmentId, existing)
  }

  const items: AttendanceSummaryItem[] = enrollments.map((enrollment) => {
    const stats = statsMap.get(enrollment.id) ?? { present: 0, absent: 0, late: 0, holiday: 0 }
    return {
      studentId: enrollment.studentId,
      studentName: [enrollment.student.firstName, enrollment.student.lastName]
        .filter(Boolean)
        .join(" "),
      admissionNumber: enrollment.student.admissionNumber,
      totalDays,
      present: stats.present,
      absent: stats.absent,
      late: stats.late,
      holiday: stats.holiday,
      attendancePercent: computeAttendancePercent(stats.present + stats.late, totalDays),
    }
  })

  return { items, totalDays }
}

async function findEnrollment(
  prisma: PrismaClient,
  studentId: string,
  academicSessionId: string,
  schoolId: string,
  classId: string,
  sectionId: string | null,
) {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true },
  })
  if (!student) throw badRequestError("Student not found in this school")

  const enrollment = await prisma.studentEnrollment.findFirst({
    where: {
      studentId,
      academicSessionId,
    },
  })
  if (!enrollment) throw badRequestError("Student is not enrolled in this academic session")

  // Validate class/section match the enrollment.
  if (enrollment.classId !== classId) {
    throw badRequestError("Student is not enrolled in the specified class")
  }
  if (sectionId !== undefined && enrollment.sectionId !== sectionId) {
    throw badRequestError("Student is not enrolled in the specified section")
  }

  return enrollment
}
