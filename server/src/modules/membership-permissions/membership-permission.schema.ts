import { z } from "zod"

/**
 * V1 accepts one permission code only. The server sets `effect = ALLOW`
 * itself, so `effect` (DENY in particular), `grantedById`, and any other
 * unexpected field are rejected by the strict schema.
 */
export const grantMembershipPermissionSchema = z
  .object({
    permissionCode: z.string().min(1),
  })
  .strict()

export type GrantMembershipPermissionInput = z.infer<typeof grantMembershipPermissionSchema>
