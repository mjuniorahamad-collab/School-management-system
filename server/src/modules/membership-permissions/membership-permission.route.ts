import { Router } from "express"
import type { Request, Response } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { fail } from "../../lib/response.js"
import {
  getMembershipPermissionsHandler,
  grantMembershipPermissionHandler,
} from "./membership-permission.controller.js"

export const membershipPermissionsRouter: Router = Router()

membershipPermissionsRouter.use(requireAuth)

membershipPermissionsRouter.get(
  "/:membershipId/permissions",
  requirePermission("membership-permissions:view"),
  getMembershipPermissionsHandler,
)

membershipPermissionsRouter.post(
  "/:membershipId/permissions",
  requirePermission("membership-permissions:grant"),
  grantMembershipPermissionHandler,
)

// The former full-replacement endpoint is permanently disabled. It could delete
// every override row for a membership, which V1 must never do.
membershipPermissionsRouter.put("/:membershipId/permissions", (_req: Request, res: Response) => {
  res.setHeader("Allow", "GET, POST")
  res.status(405).json(
    fail(
      "METHOD_NOT_ALLOWED",
      "Replacing membership permission overrides is not supported",
    ),
  )
})
