import { z } from "zod"

// Portal module validation. Query params are coerced/limited; body inputs are
// strict objects so unknown fields are rejected at the boundary.

export const portalListQuerySchema = z.object({
  sessionId: z.string().uuid("A valid session id is required").optional(),
})

export const portalNoticesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const profileLinkSchema = z
  .object({
    profileType: z.enum(["STUDENT", "GUARDIAN"], "Profile type must be STUDENT or GUARDIAN"),
    profileId: z.string().uuid("A valid profile id is required"),
  })
  .strict()

export const createProfileLinkSchema = z
  .object({
    userId: z.string().uuid("A valid user id is required"),
    profileType: z.enum(["STUDENT", "GUARDIAN"], "Profile type must be STUDENT or GUARDIAN"),
    profileId: z.string().uuid("A valid profile id is required"),
  })
  .strict()

export const deleteProfileLinkSchema = z
  .object({
    userId: z.string().uuid("A valid user id is required"),
    profileType: z.enum(["STUDENT", "GUARDIAN"], "Profile type must be STUDENT or GUARDIAN"),
    profileId: z.string().uuid("A valid profile id is required"),
  })
  .strict()

export const provisionPortalAccountSchema = z
  .object({
    profileType: z.enum(["STUDENT", "GUARDIAN"], "Profile type must be STUDENT or GUARDIAN"),
    profileId: z.string().uuid("A valid profile id is required"),
    parentName: z.string().trim().min(1, "Parent name is required").max(120, "Parent name is too long"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("A valid email address is required")
      .max(200, "Email is too long"),
  })
  .strict()

export const regenerateActivationSchema = z
  .object({
    userId: z.string().uuid("A valid user id is required"),
  })
  .strict()

export const activatePortalAccountSchema = z
  .object({
    token: z.string().min(20, "A valid activation token is required").max(200, "Invalid activation token"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(200, "Password must be 200 characters or fewer"),
  })
  .strict()