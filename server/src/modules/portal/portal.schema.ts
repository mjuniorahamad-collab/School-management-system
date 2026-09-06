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