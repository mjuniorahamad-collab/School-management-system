import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createHomeworkSchema,
  listHomeworkQuerySchema,
  updateHomeworkSchema,
} from "./homework.schema.js"
import * as homeworkService from "./homework.service.js"

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

export const listHomeworkHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listHomeworkQuerySchema, req.query, "Invalid homework query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await homeworkService.listHomework(query, schoolId)))
}

export const getHomeworkHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await homeworkService.getHomeworkById(routeParam(req.params.id), schoolId)))
}

export const getHomeworkContextHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await homeworkService.getHomeworkContext(actor.schoolId, actor)))
}

export const createHomeworkHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createHomeworkSchema, req.body, "Invalid homework data")
  const actor = requireAuth(req)
  const created = await homeworkService.createHomework(input, actor)
  res.status(201).json(ok(created))
}

export const updateHomeworkHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateHomeworkSchema, req.body, "Invalid homework data")
  const actor = requireAuth(req)
  const updated = await homeworkService.updateHomework(routeParam(req.params.id), input, actor)
  res.json(ok(updated))
}

export const deleteHomeworkHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await homeworkService.deleteHomework(routeParam(req.params.id), actor)))
}