import { z } from "zod"

export const attendanceStatusEnum = z.enum(["PRESENT", "ABSENT", "LATE", "HOLIDAY"])

export const markAttendanceSchema = z
  .object({
    academicSessionId: z.string().uuid(),
    classId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    studentId: z.string().uuid(),
    status: attendanceStatusEnum,
    note: z.string().max(500).optional(),
  })
  .strict()

export const bulkMarkAttendanceSchema = z
  .object({
    academicSessionId: z.string().uuid(),
    classId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    records: z
      .array(
        z
          .object({
            studentId: z.string().uuid(),
            status: attendanceStatusEnum,
            note: z.string().max(500).optional(),
          })
          .strict(),
      )
      .min(1, "At least one record is required"),
  })
  .strict()

export const updateAttendanceSchema = z
  .object({
    status: attendanceStatusEnum.optional(),
    note: z.string().max(500).optional(),
  })
  .strict()

export const listAttendanceQuerySchema = z.object({
  academicSessionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export const attendanceSummaryQuerySchema = z.object({
  academicSessionId: z.string().uuid(),
  classId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>
export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>
export type AttendanceSummaryQueryInput = z.infer<typeof attendanceSummaryQuerySchema>
