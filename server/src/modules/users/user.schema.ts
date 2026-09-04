import { z } from "zod"

const emptyToUndefined = z.literal("").transform(() => undefined)

/** Optional URL-query / body string that treats an empty string as absent. */
function optionalText(max: number) {
  return z.union([emptyToUndefined, z.string().trim().min(1).max(max)]).optional()
}

/** Tenant membership status toggles. */
export const membershipStatusSchema = z.enum(["ACTIVE", "INACTIVE"])

export const listUsersQuerySchema = z.object({
  search: optionalText(100),
  status: membershipStatusSchema.optional(),
  roleId: optionalText(50),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * Create a global user and grant them a role in the caller's tenant. `schoolId`
 * is NEVER accepted here — it is resolved server-side from the authenticated
 * tenant, so a caller cannot place a user into a tenant they do not belong to.
 */
export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    email: z.email("Enter a valid email address").max(200),
    // Required only when the account does not exist yet. Ignored for existing
    // users (never overwrites an existing password hash).
    password: z.string().min(8, "Password must be at least 8 characters").max(200).optional(),
    roleId: z.string().min(1, "Role is required"),
  })
  .strict()

/** Update a user's membership within the caller's tenant (role and/or status). */
export const updateUserMembershipSchema = z
  .object({
    roleId: z.string().trim().min(1).max(50).optional(),
    status: membershipStatusSchema.optional(),
  })
  .strict()
  .refine((value) => value.roleId !== undefined || value.status !== undefined, {
    message: "Provide at least one of roleId or status",
  })

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserMembershipInput = z.infer<typeof updateUserMembershipSchema>
