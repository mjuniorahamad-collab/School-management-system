import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createNotificationHandler,
  listNotificationsHandler,
  markAllReadHandler,
  markReadHandler,
  unreadCountHandler,
} from "./notification.controller.js"

// Notifications module — per-user in-app notification feed, tenant-scoped.
//
// `notifications:view` is universal (every role holds it, parents/students
// included) and governs all read surfaces; reads are always re-scoped to the
// caller's `schoolId` + `userId`, so cross-tenant and direct-ID access to
// another member's notification resolves to 404. `notifications:create`
// (leadership only) governs the manual send; automatic event triggers emit
// inside their own service transactions and bypass HTTP entirely.
// Static routes are registered before `/:id/read` so Express never binds
// "unread-count" or "read-all" as an id.
export const notificationsRouter: Router = Router()

notificationsRouter.use(requireAuth)

notificationsRouter.get("/", requirePermission("notifications:view"), listNotificationsHandler)
notificationsRouter.get("/unread-count", requirePermission("notifications:view"), unreadCountHandler)
notificationsRouter.post("/read-all", requirePermission("notifications:view"), markAllReadHandler)
notificationsRouter.post("/", requirePermission("notifications:create"), createNotificationHandler)
notificationsRouter.post("/:id/read", requirePermission("notifications:view"), markReadHandler)