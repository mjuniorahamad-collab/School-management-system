import type { Request, Response } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import { grantMembershipPermissionSchema } from "./membership-permission.schema.js"
import {
  getMembershipPermissions,
  grantMembershipPermission,
} from "./membership-permission.service.js"

function requireAuthUser(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function requireMembershipId(req: Request): string {
  return Array.isArray(req.params.membershipId)
    ? req.params.membershipId[0]
    : req.params.membershipId
}

export async function getMembershipPermissionsHandler(req: Request, res: Response) {
  const membershipId = requireMembershipId(req)
  const actor = requireAuthUser(req)
  const result = await getMembershipPermissions(membershipId, actor)
  res.json(ok(result))
}

export async function grantMembershipPermissionHandler(req: Request, res: Response) {
  const membershipId = requireMembershipId(req)
  const actor = requireAuthUser(req)
  const parsed = parseWithZod(
    grantMembershipPermissionSchema,
    req.body,
    "Invalid membership permission grant data",
  )
  const result = await grantMembershipPermission(membershipId, parsed, actor)
  res.json(ok(result))
}
