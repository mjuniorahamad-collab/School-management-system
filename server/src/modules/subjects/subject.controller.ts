import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  updateSubjectSchema,
} from "./subject.schema.js"
import * as subjectService from "./subject.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listSubjectsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listSubjectsQuerySchema, req.query, "Invalid subjects list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await subjectService.listSubjects(query, schoolId)))
}

export const getSubjectHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await subjectService.getSubjectById(routeParam(req.params.id), schoolId)))
}

export const createSubjectHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createSubjectSchema, req.body, "Invalid subject data")
  const auth = requireAuth(req)
  const created = await subjectService.createSubject(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateSubjectHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSubjectSchema, req.body, "Invalid subject data")
  const auth = requireAuth(req)
  const updated = await subjectService.updateSubject(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}
