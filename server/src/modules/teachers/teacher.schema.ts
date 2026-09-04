import { z } from "zod"

export const TEACHER_GENDERS = ["MALE", "FEMALE", "OTHER"] as const
export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE", "ON_LEAVE"] as const

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")

const emptyToUndefined = z.literal("").transform(() => undefined)

/** Optional text field that treats an empty string as "not provided". */
function optionalText(max: number) {
  return z.union([emptyToUndefined, z.string().trim().min(1).max(max)]).optional()
}

/**
 * Optional text field that also accepts `null` (treated as absent). Used for
 * columns that are nullable in the database and may be explicitly cleared.
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

const classAssignmentSchema = z.object({
  classId: z.string().min(1),
  sectionId: z.union([z.null(), emptyToUndefined, z.string().trim().min(1)]).optional(),
})

/**
 * Optional link to the teacher's login account (global `User.id`). The server
 * verifies the user holds an ACTIVE membership with the TEACHER role in this
 * school, and that no other Teacher profile is already linked to the same user.
 */
const teacherUserIdSchema = z.union([z.string().uuid(), z.null(), emptyToUndefined]).optional()

export const createTeacherSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(100),
    middleName: nullableText(100),
    lastName: nullableText(100),
    gender: z.enum(TEACHER_GENDERS, { message: "Gender is required" }),
    dateOfBirth: z.union([z.null(), dateStringSchema]).optional(),
    email: optionalEmail(),
    phone: optionalText(30),
    address: optionalText(300),
    designation: z.string().trim().min(1, "Designation is required").max(100),
    qualification: optionalText(100),
    experience: z.union([z.null(), z.number().int().min(0).max(100)]).optional(),
    joiningDate: dateStringSchema,
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    photoUrl: optionalText(500),
    userId: teacherUserIdSchema,
    subjectIds: z.array(z.string().min(1)).optional(),
    classAssignments: z.array(classAssignmentSchema).optional(),
  })
  .strict()

export const updateTeacherSchema = createTeacherSchema.partial().strict()

export const listTeachersQuerySchema = z.object({
  search: optionalParam(z.string().trim().min(1).max(100)),
  status: optionalParam(z.enum(EMPLOYEE_STATUSES)),
  designation: optionalParam(z.string().trim().min(1).max(100)),
  gender: optionalParam(z.enum(TEACHER_GENDERS)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateTeacherInput = z.infer<typeof createTeacherSchema>
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>
export type ListTeachersQuery = z.infer<typeof listTeachersQuerySchema>
