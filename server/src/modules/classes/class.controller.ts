import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createClassSchema,
  listClassesQuerySchema,
  updateClassSchema,
} from "./class.schema.js"
import * as classService from "./class.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listClassesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listClassesQuerySchema, req.query, "Invalid classes list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await classService.listClasses(query, schoolId)))
}

export const getClassHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await classService.getClassById(routeParam(req.params.id), schoolId)))
}

export const createClassHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createClassSchema, req.body, "Invalid class data")
  const auth = requireAuth(req)
  const created = await classService.createClass(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateClassHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateClassSchema, req.body, "Invalid class data")
  const auth = requireAuth(req)
  const updated = await classService.updateClass(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}
