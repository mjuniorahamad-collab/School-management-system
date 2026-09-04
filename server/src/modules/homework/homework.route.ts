import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createHomeworkHandler,
  deleteHomeworkHandler,
  getHomeworkContextHandler,
  getHomeworkHandler,
  listHomeworkHandler,
  updateHomeworkHandler,
} from "./homework.controller.js"

export const homeworkRouter: Router = Router()

homeworkRouter.use(requireAuth)

// `/context` must precede `/:id` so it is never captured as an id.
homeworkRouter.get("/context", requirePermission("homework:view"), getHomeworkContextHandler)
homeworkRouter.get("/", requirePermission("homework:view"), listHomeworkHandler)
homeworkRouter.post("/", requirePermission("homework:create"), createHomeworkHandler)
homeworkRouter.get("/:id", requirePermission("homework:view"), getHomeworkHandler)
homeworkRouter.patch("/:id", requirePermission("homework:update"), updateHomeworkHandler)
homeworkRouter.delete("/:id", requirePermission("homework:delete"), deleteHomeworkHandler)