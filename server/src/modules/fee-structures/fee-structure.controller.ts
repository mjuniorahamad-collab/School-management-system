import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  createFeeStructureSchema,
  listFeeStructuresQuerySchema,
  updateFeeStructureSchema,
} from "./fee-structure.schema.js"
import * as feeStructureService from "./fee-structure.service.js"

function requireAuth(req: { auth?: AuthUser }): {
  id: string
  schoolId: string
  auth: AuthUser
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { id: req.auth.id, schoolId: req.auth.school.id, auth: req.auth }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listFeeStructuresHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listFeeStructuresQuerySchema, req.query, "Invalid fee structures list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeStructureService.listFeeStructures(query, schoolId)))
}

export const getFeeStructureHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeStructureService.getFeeStructureById(routeParam(req.params.id), schoolId)))
}

export const createFeeStructureHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createFeeStructureSchema, req.body, "Invalid fee structure data")
  const { schoolId, auth } = requireAuth(req)
  const created = await feeStructureService.createFeeStructure(input, schoolId, auth)
  res.status(201).json(ok(created))
}

export const updateFeeStructureHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateFeeStructureSchema, req.body, "Invalid fee structure data")
  const { schoolId, auth } = requireAuth(req)
  const updated = await feeStructureService.updateFeeStructure(routeParam(req.params.id), input, schoolId, auth)
  res.json(ok(updated))
}