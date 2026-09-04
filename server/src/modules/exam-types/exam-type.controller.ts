import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createExamTypeSchema,
  listExamTypesQuerySchema,
  updateExamTypeSchema,
} from "./exam-type.schema.js"
import * as examTypeService from "./exam-type.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listExamTypesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listExamTypesQuerySchema, req.query, "Invalid exam types list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await examTypeService.listExamTypes(query, schoolId)))
}

export const getExamTypeHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await examTypeService.getExamTypeById(routeParam(req.params.id), schoolId)))
}

export const createExamTypeHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createExamTypeSchema, req.body, "Invalid exam type data")
  const { schoolId } = requireAuth(req)
  const created = await examTypeService.createExamType(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateExamTypeHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateExamTypeSchema, req.body, "Invalid exam type data")
  const { schoolId } = requireAuth(req)
  const updated = await examTypeService.updateExamType(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
