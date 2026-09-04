import { z } from "zod"

export const timetableDayEnum = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
])

export const createTimetableEntrySchema = z
  .object({
    academicSessionId: z.string().uuid(),
    dayOfWeek: timetableDayEnum,
    periodSlotId: z.string().uuid(),
    classId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    subjectId: z.string().uuid(),
    teacherId: z.string().uuid(),
  })
  .strict()

export const updateTimetableEntrySchema = z
  .object({
    academicSessionId: z.string().uuid().optional(),
    dayOfWeek: timetableDayEnum.optional(),
    periodSlotId: z.string().uuid().optional(),
    classId: z.string().uuid().optional(),
    sectionId: z.string().uuid().nullable().optional(),
    subjectId: z.string().uuid().optional(),
    teacherId: z.string().uuid().optional(),
  })
  .strict()

export const copyTimetableDaySchema = z
  .object({
    academicSessionId: z.string().uuid(),
    sourceDay: timetableDayEnum,
    targetDay: timetableDayEnum,
  })
  .strict()

export const listTimetableQuerySchema = z.object({
  academicSessionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  dayOfWeek: timetableDayEnum.optional(),
})

export type CreateTimetableEntryInput = z.infer<typeof createTimetableEntrySchema>
export type UpdateTimetableEntryInput = z.infer<typeof updateTimetableEntrySchema>
export type CopyTimetableDayInput = z.infer<typeof copyTimetableDaySchema>
export type ListTimetableQuery = z.infer<typeof listTimetableQuerySchema>
