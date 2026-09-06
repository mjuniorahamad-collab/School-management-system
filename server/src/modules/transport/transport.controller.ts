import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createAssignmentSchema,
  createDriverSchema,
  createRouteSchema,
  createStopSchema,
  createVehicleSchema,
  listAssignmentContextQuerySchema,
  listAssignmentsQuerySchema,
  listDriversQuerySchema,
  listRoutesQuerySchema,
  listStopsQuerySchema,
  listVehiclesQuerySchema,
  updateAssignmentSchema,
  updateDriverSchema,
  updateRouteSchema,
  updateStopSchema,
  updateVehicleSchema,
} from "./transport.schema.js"
import * as transportService from "./transport.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

// Vehicles

export const listVehiclesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listVehiclesQuerySchema, req.query, "Invalid vehicles list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.listVehicles(query, schoolId)))
}

export const getVehicleHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.getVehicleById(routeParam(req.params.id), schoolId)))
}

export const createVehicleHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createVehicleSchema, req.body, "Invalid vehicle data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await transportService.createVehicle(input, auth.school.id, auth)))
}

export const updateVehicleHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateVehicleSchema, req.body, "Invalid vehicle data")
  const auth = requireAuth(req)
  const updated = await transportService.updateVehicle(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

// Routes

export const listRoutesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listRoutesQuerySchema, req.query, "Invalid routes list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.listRoutes(query, schoolId)))
}

export const getRouteHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.getRouteDetail(routeParam(req.params.id), schoolId)))
}

export const createRouteHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createRouteSchema, req.body, "Invalid route data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await transportService.createRoute(input, auth.school.id, auth)))
}

export const updateRouteHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateRouteSchema, req.body, "Invalid route data")
  const auth = requireAuth(req)
  const updated = await transportService.updateRoute(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

// Stops

export const listStopsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listStopsQuerySchema, req.query, "Invalid stops list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.listStops(query, schoolId)))
}

export const createStopHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createStopSchema, req.body, "Invalid stop data")
  const auth = requireAuth(req)
  const created = await transportService.createStop(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.status(201).json(ok(created))
}

export const updateStopHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateStopSchema, req.body, "Invalid stop data")
  const auth = requireAuth(req)
  const updated = await transportService.updateStop(
    routeParam(req.params.id),
    routeParam(req.params.stopId),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

// Drivers

export const listDriversHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listDriversQuerySchema, req.query, "Invalid drivers list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.listDrivers(query, schoolId)))
}

export const createDriverHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createDriverSchema, req.body, "Invalid driver data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await transportService.createDriver(input, auth.school.id, auth)))
}

export const updateDriverHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateDriverSchema, req.body, "Invalid driver data")
  const auth = requireAuth(req)
  const updated = await transportService.updateDriver(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

// Assignments

export const listAssignmentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAssignmentsQuerySchema, req.query, "Invalid assignments list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.listAssignments(query, schoolId)))
}

export const getAssignmentContextHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(
    listAssignmentContextQuerySchema,
    req.query,
    "Invalid assignment context query",
  )
  const schoolId = requireAuth(req).school.id
  res.json(ok(await transportService.getAssignmentContext(query, schoolId)))
}

export const createAssignmentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createAssignmentSchema, req.body, "Invalid assignment data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await transportService.createAssignment(input, auth.school.id, auth)))
}

export const updateAssignmentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAssignmentSchema, req.body, "Invalid assignment data")
  const auth = requireAuth(req)
  const updated = await transportService.updateAssignment(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}