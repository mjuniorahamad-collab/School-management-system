import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createAssignmentSchema,
  listAssignmentQuerySchema,
  updateAssignmentSchema,
} from "./assignment.schema.js"
import * as assignmentService from "./assignment.service.js"

function requireAuth(req: {
  auth?: AuthUser
}): { schoolId: string; userId: string; roles: string[]; name: string; email: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return {
    schoolId: req.auth.school.id,
    userId: req.auth.id,
    roles: req.auth.roles,
    name: req.auth.name,
    email: req.auth.email,
  }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAssignmentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAssignmentQuerySchema, req.query, "Invalid assignment query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await assignmentService.listAssignments(query, schoolId)))
}

export const getAssignmentHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await assignmentService.getAssignmentById(routeParam(req.params.id), schoolId)))
}

export const getAssignmentContextHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await assignmentService.getAssignmentContext(actor.schoolId, actor)))
}

export const createAssignmentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createAssignmentSchema, req.body, "Invalid assignment data")
  const actor = requireAuth(req)
  const created = await assignmentService.createAssignment(input, actor)
  res.status(201).json(ok(created))
}

export const updateAssignmentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAssignmentSchema, req.body, "Invalid assignment data")
  const actor = requireAuth(req)
  const updated = await assignmentService.updateAssignment(routeParam(req.params.id), input, actor)
  res.json(ok(updated))
}

export const deleteAssignmentHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await assignmentService.deleteAssignment(routeParam(req.params.id), actor)))
}