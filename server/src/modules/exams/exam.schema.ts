import { z } from "zod"
import { EXAM_STATUSES } from "./exam.rules.js"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
const uuid = z.string().uuid()

/** Empty string is treated as "whole class / not provided". */
const sectionIdSchema = z
  .union([uuid, z.literal("")])
  .nullish()
  .transform((value) => (value ?? null) || null)

/**
 * Update path: an omitted `sectionId` means "unchanged", while an explicit
 * empty string or null clears it ("whole class"). Mirrors Homework.
 */
const updateSectionIdSchema = z
  .union([uuid, z.literal("")])
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null))

export const examSubjectInputSchema = z.object({
  subjectId: uuid,
  teacherId: uuid,
  maxMarks: z.number().positive("maxMarks must be positive").max(99999.99),
  passMarks: z.number().positive("passMarks must be positive").max(99999.99),
})

/** A valid exam subject list: 1–30 entries, each with passMarks ≤ maxMarks. */
function subjectListSchema() {
  return z
    .array(examSubjectInputSchema)
    .min(1, "At least one subject is required")
    .max(30, "At most 30 subjects per exam")
    .refine(
      (subjects) => subjects.every((subject) => subject.passMarks <= subject.maxMarks),
      "passMarks must not exceed maxMarks",
    )
}

export const createExamSchema = z
  .object({
    academicSessionId: uuid,
    examTypeId: uuid,
    name: z.string().trim().min(1, "Name is required").max(200),
    classId: uuid,
    sectionId: sectionIdSchema,
    startDate: dateString,
    endDate: dateString,
    status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
    subjects: subjectListSchema(),
  })
  .strict()
  .refine((data) => data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })

export const updateExamSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(200).optional(),
    startDate: dateString.optional(),
    endDate: dateString.optional(),
    sectionId: updateSectionIdSchema,
  })
  .strict()
  .refine((data) => data.endDate === undefined || data.startDate === undefined || data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  })

export const updateExamSubjectsSchema = z
  .object({
    subjects: subjectListSchema(),
  })
  .strict()

/** Only publish/archive flow through the exam-status endpoint; FINAL/reopen live under results:publish. */
export const updateExamStatusSchema = z
  .object({
    status: z.enum(["PUBLISHED", "ARCHIVED"]),
  })
  .strict()

export const listExamQuerySchema = z.object({
  academicSessionId: uuid.optional(),
  examTypeId: uuid.optional(),
  classId: uuid.optional(),
  sectionId: uuid.optional(),
  status: z.enum(EXAM_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["startDate", "name"]).default("startDate"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
})

export type ExamSubjectInput = z.infer<typeof examSubjectInputSchema>
export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
export type UpdateExamSubjectsInput = z.infer<typeof updateExamSubjectsSchema>
export type UpdateExamStatusInput = z.infer<typeof updateExamStatusSchema>
export type ListExamQuery = z.infer<typeof listExamQuerySchema>