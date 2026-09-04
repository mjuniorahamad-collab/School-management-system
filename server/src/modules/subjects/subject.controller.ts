import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  updateSubjectSchema,
} from "./subject.schema.js"
import * as subjectService from "./subject.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listSubjectsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listSubjectsQuerySchema, req.query, "Invalid subjects list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await subjectService.listSubjects(query, schoolId)))
}

export const getSubjectHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await subjectService.getSubjectById(routeParam(req.params.id), schoolId)))
}

export const createSubjectHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createSubjectSchema, req.body, "Invalid subject data")
  const { schoolId } = requireAuth(req)
  const created = await subjectService.createSubject(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateSubjectHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSubjectSchema, req.body, "Invalid subject data")
  const { schoolId } = requireAuth(req)
  const updated = await subjectService.updateSubject(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
