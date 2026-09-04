import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import { listRolesHandler } from "./role.controller.js"

// Roles module. The role catalog is platform-defined; within a tenant it is a
// read-only list of roles assignable by a tenant administrator (SUPER_ADMIN is
// intentionally excluded). Role grants are set on the platform side.
export const rolesRouter: Router = Router()

rolesRouter.use(requireAuth)

rolesRouter.get("/", requirePermission("roles:view"), listRolesHandler)
