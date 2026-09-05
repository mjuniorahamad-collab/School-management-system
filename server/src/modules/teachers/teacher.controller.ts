import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createTeacherSchema,
  listTeachersQuerySchema,
  updateTeacherSchema,
} from "./teacher.schema.js"
import * as teacherService from "./teacher.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listTeachersHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listTeachersQuerySchema, req.query, "Invalid teachers list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await teacherService.listTeachers(query, schoolId)))
}

export const getTeacherHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await teacherService.getTeacherById(routeParam(req.params.id), schoolId)))
}

export const createTeacherHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createTeacherSchema, req.body, "Invalid teacher data")
  const auth = requireAuth(req)
  const created = await teacherService.createTeacher(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateTeacherHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateTeacherSchema, req.body, "Invalid teacher data")
  const auth = requireAuth(req)
  const updated = await teacherService.updateTeacher(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}

export const getTeacherMetaHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await teacherService.getTeacherMeta(schoolId)))
}
