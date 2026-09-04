import { z } from "zod"

export const STUDENT_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "TRANSFERRED",
  "WITHDRAWN",
  "GRADUATED",
] as const

export const STUDENT_GENDERS = ["MALE", "FEMALE", "OTHER"] as const

export const GUARDIAN_RELATIONSHIP_TYPES = [
  "FATHER",
  "MOTHER",
  "PARENT",
  "GUARDIAN",
  "LEGAL_GUARDIAN",
  "OTHER",
] as const

export const STUDENT_SORT_BY = ["name", "admissionNumber", "admissionDate"] as const
export const SORT_DIRECTIONS = ["asc", "desc"] as const

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")

const emptyToUndefined = z.literal("").transform(() => undefined)

/** Optional text field that treats an empty string as "not provided". */
function optionalText(max: number) {
  return z.union([emptyToUndefined, z.string().trim().min(1).max(max)]).optional()
}

/**
 * Optional text field that also accepts `null` (treated as absent). Used for
 * columns that are nullable in the database and may be explicitly cleared
 * (e.g. an empty optional middle/last name submitted as `null`).
 */
function nullableText(max: number) {
  return z.union([z.null(), emptyToUndefined, z.string().trim().min(1).max(max)]).optional()
}

function optionalEmail() {
  return z.union([emptyToUndefined, z.email("Enter a valid email address").max(200)]).optional()
}

/** Optional URL-query parameter that treats an empty string as absent. */
function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

export const guardianInputSchema = z
  .object({
    name: z.string().trim().min(1, "Guardian name is required").max(200),
    relationshipType: z.enum(GUARDIAN_RELATIONSHIP_TYPES),
    isPrimary: z.boolean().optional().default(false),
    isEmergencyContact: z.boolean().optional().default(false),
    email: optionalEmail(),
    phone: optionalText(30),
    address: optionalText(300),
  })
  .superRefine((data, ctx) => {
    if (!data.phone && !data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contact"],
        message: "Provide at least one of phone or email for each guardian",
      })
    }
  })

export const createStudentSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100),
    middleName: nullableText(100),
    lastName: nullableText(100),
    dateOfBirth: dateStringSchema,
    gender: z.enum(STUDENT_GENDERS),
    photoUrl: optionalText(500),
    status: z.enum(STUDENT_STATUSES).optional(),
    email: optionalEmail(),
    phone: optionalText(30),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(20),
    admissionDate: dateStringSchema.optional(),
    academicSessionId: z.string().min(1).optional(),
    classId: z.string().min(1, "Class is required"),
    sectionId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1)]).optional(),
    emergencyContactName: optionalText(200),
    emergencyContactPhone: optionalText(30),
    guardians: z.array(guardianInputSchema).min(1, "At least one guardian is required").max(4),
  })
  .strict()

export const updateStudentSchema = createStudentSchema
  .omit({ academicSessionId: true })
  .partial()
  .extend({
    middleName: z.string().trim().min(1).max(100).nullish(),
    lastName: z.string().trim().min(1).max(100).nullish(),
  })
  .strict()

export const listStudentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  status: optionalParam(z.enum(STUDENT_STATUSES)),
  sessionId: optionalParam(z.string().min(1).max(64)),
  classId: optionalParam(z.string().min(1).max(64)),
  sectionId: optionalParam(z.string().min(1).max(64)),
  sortBy: z.enum(STUDENT_SORT_BY).optional().default("name"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("asc"),
})

export type CreateStudentInput = z.infer<typeof createStudentSchema>
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>
export type GuardianInput = z.infer<typeof guardianInputSchema>