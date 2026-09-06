import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createAssignmentHandler,
  createDriverHandler,
  createRouteHandler,
  createStopHandler,
  createVehicleHandler,
  getAssignmentContextHandler,
  getRouteHandler,
  getVehicleHandler,
  listAssignmentsHandler,
  listDriversHandler,
  listRoutesHandler,
  listStopsHandler,
  listVehiclesHandler,
  updateAssignmentHandler,
  updateDriverHandler,
  updateRouteHandler,
  updateStopHandler,
  updateVehicleHandler,
} from "./transport.controller.js"

// Transport module: vehicles, routes & stops, drivers, and session-bound
// student assignments. All tenant-scoped and status-lifecycle only — there is
// intentionally NO transport:delete route (delete permission is reserved);
// records are moved to INACTIVE/disabled so history survives.
export const transportRouter: Router = Router()

transportRouter.use(requireAuth)

// Vehicles
transportRouter.get("/vehicles", requirePermission("transport:view"), listVehiclesHandler)
transportRouter.post("/vehicles", requirePermission("transport:create"), createVehicleHandler)
transportRouter.get("/vehicles/:id", requirePermission("transport:view"), getVehicleHandler)
transportRouter.patch("/vehicles/:id", requirePermission("transport:update"), updateVehicleHandler)

// Routes
transportRouter.get("/routes", requirePermission("transport:view"), listRoutesHandler)
transportRouter.post("/routes", requirePermission("transport:create"), createRouteHandler)
transportRouter.get("/routes/:id", requirePermission("transport:view"), getRouteHandler)
transportRouter.patch("/routes/:id", requirePermission("transport:update"), updateRouteHandler)

// Stops (managed through a route so tenant + route scoping is always explicit)
transportRouter.get("/stops", requirePermission("transport:view"), listStopsHandler)
transportRouter.post("/routes/:id/stops", requirePermission("transport:create"), createStopHandler)
transportRouter.patch(
  "/routes/:id/stops/:stopId",
  requirePermission("transport:update"),
  updateStopHandler,
)

// Drivers
transportRouter.get("/drivers", requirePermission("transport:view"), listDriversHandler)
transportRouter.post("/drivers", requirePermission("transport:create"), createDriverHandler)
transportRouter.patch("/drivers/:id", requirePermission("transport:update"), updateDriverHandler)

// Assignments
transportRouter.get(
  "/assignments/context",
  requirePermission("transport:view"),
  getAssignmentContextHandler,
)
transportRouter.get("/assignments", requirePermission("transport:view"), listAssignmentsHandler)
transportRouter.post("/assignments", requirePermission("transport:create"), createAssignmentHandler)
transportRouter.patch("/assignments/:id", requirePermission("transport:update"), updateAssignmentHandler)