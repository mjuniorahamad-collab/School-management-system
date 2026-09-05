import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import * as examService from "./exam.service.js"
import {
  createExamSchema,
  listExamQuerySchema,
  updateExamSchema,
  updateExamStatusSchema,
  updateExamSubjectsSchema,
} from "./exam.schema.js"

function requireAuth(req: {
  auth?: { id: string; roles: string[]; school: { id: string } }
}): { schoolId: string; userId: string; roles: string[] } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id, userId: req.auth.id, roles: req.auth.roles }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listExamsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listExamQuerySchema, req.query, "Invalid exams query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await examService.listExams(query, schoolId)))
}

export const getExamHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await examService.getExamById(routeParam(req.params.id), schoolId)))
}

export const getExamContextHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await examService.getExamContext(actor.schoolId, actor)))
}

export const createExamHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createExamSchema, req.body, "Invalid exam data")
  const actor = requireAuth(req)
  const created = await examService.createExam(input, actor)
  res.status(201).json(ok(created))
}

export const updateExamHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateExamSchema, req.body, "Invalid exam data")
  const actor = requireAuth(req)
  const updated = await examService.updateExam(routeParam(req.params.id), input, actor)
  res.json(ok(updated))
}

export const updateExamSubjectsHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateExamSubjectsSchema, req.body, "Invalid exam subject list")
  const actor = requireAuth(req)
  const updated = await examService.updateExamSubjects(routeParam(req.params.id), input, actor)
  res.json(ok(updated))
}

export const updateExamStatusHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateExamStatusSchema, req.body, "Invalid exam status")
  const actor = requireAuth(req)
  const updated = await examService.updateExamStatus(routeParam(req.params.id), input, actor)
  res.json(ok(updated))
}

export const deleteExamHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await examService.deleteExam(routeParam(req.params.id), actor)))
}