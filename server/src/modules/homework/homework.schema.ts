import { z } from "zod"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
const taskStatus = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"])
const createStatus = z.enum(["DRAFT", "PUBLISHED"])
const uuid = z.string().uuid()

/** Empty string is treated as "whole class / not provided". */
const sectionIdSchema = z
  .union([uuid, z.literal("")])
  .nullish()
  .transform((value) => (value ?? null) || null)

/**
 * Update path: an omitted `sectionId` means "unchanged", while an explicit
 * empty string or null clears it ("whole class"). The nullish variant above
 * would collapse omission to null and wipe a section on unrelated edits.
 */
const updateSectionIdSchema = z
  .union([uuid, z.literal("")])
  .optional()
  .transform((value) => (value === undefined ? undefined : value || null))

const emptyToNull = z.literal("").transform(() => null)

/** Optional non-empty text (empty string treated as "not provided"). */
function optionalText(max: number) {
  return z.union([emptyToNull, z.string().trim().min(1).max(max)]).optional()
}

const targetingFields = {
  academicSessionId: uuid,
  classId: uuid,
  sectionId: sectionIdSchema,
  subjectId: uuid,
  teacherId: uuid,
} as const

export const createHomeworkSchema = z
  .object({
    ...targetingFields,
    title: z.string().trim().min(1, "Title is required").max(200),
    instructions: optionalText(5000),
    dueDate: dateString,
    status: createStatus.default("DRAFT"),
  })
  .strict()

export const updateHomeworkSchema = z
  .object({
    academicSessionId: uuid.optional(),
    classId: uuid.optional(),
    sectionId: updateSectionIdSchema,
    subjectId: uuid.optional(),
    teacherId: uuid.optional(),
    title: z.string().trim().min(1, "Title is required").max(200).optional(),
    instructions: optionalText(5000),
    dueDate: dateString.optional(),
    status: taskStatus.optional(),
  })
  .strict()

export const listHomeworkQuerySchema = z.object({
  academicSessionId: uuid.optional(),
  classId: uuid.optional(),
  sectionId: uuid.optional(),
  subjectId: uuid.optional(),
  teacherId: uuid.optional(),
  status: taskStatus.optional(),
  dueDateFrom: dateString.optional(),
  dueDateTo: dateString.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["dueDate", "title"]).default("dueDate"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
})

export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>
export type ListHomeworkQuery = z.infer<typeof listHomeworkQuerySchema>