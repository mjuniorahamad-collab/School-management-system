import { z } from "zod"

export const ADMISSION_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "CONVERTED",
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

export const ADMISSION_SORT_BY = ["name", "applicationNumber", "createdAt"] as const
export const SORT_DIRECTIONS = ["asc", "desc"] as const

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")

const emptyToUndefined = z.literal("").transform(() => undefined)

/** Optional text field that treats an empty string as "not provided". */
function optionalText(max: number) {
  return z.union([emptyToUndefined, z.string().trim().min(1).max(max)]).optional()
}

/** Optional text field that also accepts `null` (treated as absent). */
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

/** Optional UUID-ish identifier that treats an empty string as absent. */
const optionalId = () => optionalParam(z.string().trim().min(1).max(64))

export const createAdmissionSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100),
    middleName: nullableText(100),
    lastName: nullableText(100),
    dateOfBirth: dateStringSchema,
    gender: z.enum(STUDENT_GENDERS),
    email: optionalEmail(),
    phone: optionalText(30),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(20),
    preferredAcademicSessionId: optionalId(),
    preferredClassId: optionalId(),
    preferredSectionId: optionalId(),
    guardianName: z.string().trim().min(1, "Guardian name is required").max(200),
    guardianPhone: optionalText(30),
    guardianEmail: optionalEmail(),
    guardianRelationshipType: z.enum(GUARDIAN_RELATIONSHIP_TYPES).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.guardianPhone && !data.guardianEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["guardianContact"],
        message: "Provide at least one of guardian phone or email",
      })
    }
  })

export const updateAdmissionSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100).optional(),
    middleName: nullableText(100),
    lastName: nullableText(100),
    dateOfBirth: dateStringSchema.optional(),
    gender: z.enum(STUDENT_GENDERS).optional(),
    email: optionalEmail(),
    phone: optionalText(30),
    addressLine1: optionalText(200),
    addressLine2: optionalText(200),
    city: optionalText(100),
    state: optionalText(100),
    postalCode: optionalText(20),
    preferredAcademicSessionId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1).max(64)]).optional(),
    preferredClassId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1).max(64)]).optional(),
    preferredSectionId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1).max(64)]).optional(),
    guardianName: z.string().trim().min(1, "Guardian name is required").max(200).optional(),
    guardianPhone: optionalText(30),
    guardianEmail: optionalEmail(),
    guardianRelationshipType: z.enum(GUARDIAN_RELATIONSHIP_TYPES).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" })

/** Review action: sets a terminal status + optional note. */
export const reviewAdmissionSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "WITHDRAWN"]),
    note: z.string().trim().max(500).optional(),
  })
  .strict()

/** Convert-to-Student: resolve placement (active session + class + section). */
export const convertAdmissionSchema = z
  .object({
    academicSessionId: optionalId(),
    classId: z.string().trim().min(1, "Class is required"),
    sectionId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1)]).optional(),
  })
  .strict()

export const listAdmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  status: optionalParam(z.enum(ADMISSION_STATUSES)),
  sortBy: z.enum(ADMISSION_SORT_BY).optional().default("createdAt"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("desc"),
})

export type CreateAdmissionInput = z.infer<typeof createAdmissionSchema>
export type UpdateAdmissionInput = z.infer<typeof updateAdmissionSchema>
export type ReviewAdmissionInput = z.infer<typeof reviewAdmissionSchema>
export type ConvertAdmissionInput = z.infer<typeof convertAdmissionSchema>
export type ListAdmissionsQuery = z.infer<typeof listAdmissionsQuerySchema>
