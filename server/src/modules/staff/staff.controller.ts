import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createStaffSchema,
  listStaffsQuerySchema,
  updateStaffSchema,
} from "./staff.schema.js"
import * as staffService from "./staff.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listStaffsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listStaffsQuerySchema, req.query, "Invalid staff list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await staffService.listStaffs(query, schoolId)))
}

export const getStaffHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await staffService.getStaffById(routeParam(req.params.id), schoolId)))
}

export const createStaffHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createStaffSchema, req.body, "Invalid staff data")
  const { schoolId } = requireAuth(req)
  const created = await staffService.createStaff(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateStaffHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateStaffSchema, req.body, "Invalid staff data")
  const { schoolId } = requireAuth(req)
  const updated = await staffService.updateStaff(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}

export const getStaffMetaHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await staffService.getStaffMeta(schoolId)))
}
