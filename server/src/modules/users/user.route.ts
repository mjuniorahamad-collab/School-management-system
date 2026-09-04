import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createUserHandler,
  getUserHandler,
  listUsersHandler,
  removeUserHandler,
  updateUserHandler,
} from "./user.controller.js"

// Users & tenant-membership module. All operations are tenant-scoped: the
// school is resolved server-side from the authenticated session (never from the
// request body), so a caller can only manage users within their own tenant.
export const usersRouter: Router = Router()

usersRouter.use(requireAuth)

usersRouter.get("/", requirePermission("users:view"), listUsersHandler)
usersRouter.post("/", requirePermission("users:create"), createUserHandler)
usersRouter.get("/:id", requirePermission("users:view"), getUserHandler)
usersRouter.patch("/:id", requirePermission("users:update"), updateUserHandler)
usersRouter.delete("/:id", requirePermission("users:delete"), removeUserHandler)
