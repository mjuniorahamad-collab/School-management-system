import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createStudentSchema,
  listStudentsQuerySchema,
  updateStudentSchema,
} from "./student.schema.js"
import * as studentService from "./student.service.js"

function requireAuth(req: { auth?: { id: string; school: { id: string } } }): {
  id: string
  schoolId: string
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { id: req.auth.id, schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listStudentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listStudentsQuerySchema, req.query, "Invalid students list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await studentService.listStudents(query, schoolId)))
}

export const getStudentHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await studentService.getStudentById(routeParam(req.params.id), schoolId)))
}

export const createStudentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createStudentSchema, req.body, "Invalid student data")
  const { id: actorId, schoolId } = requireAuth(req)
  const created = await studentService.createStudent(input, schoolId, actorId)
  res.status(201).json(ok(created))
}

export const updateStudentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateStudentSchema, req.body, "Invalid student data")
  const { id: actorId, schoolId } = requireAuth(req)
  const updated = await studentService.updateStudent(routeParam(req.params.id), input, schoolId, actorId)
  res.json(ok(updated))
}

export const getStudentsMetaHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await studentService.getStudentsMeta(schoolId)))
}

export const exportStudentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listStudentsQuerySchema, req.query, "Invalid students export query")
  const { schoolId } = requireAuth(req)
  const csv = await studentService.exportStudentsCsv(query, schoolId)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", 'attachment; filename="students.csv"')
  res.send(csv)
}