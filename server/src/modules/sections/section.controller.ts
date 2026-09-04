import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createSectionSchema,
  listSectionsQuerySchema,
  updateSectionSchema,
} from "./section.schema.js"
import * as sectionService from "./section.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listSectionsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listSectionsQuerySchema, req.query, "Invalid sections list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await sectionService.listSections(query, schoolId)))
}

export const getSectionHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await sectionService.getSectionById(routeParam(req.params.id), schoolId)))
}

export const createSectionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createSectionSchema, req.body, "Invalid section data")
  const { schoolId } = requireAuth(req)
  const created = await sectionService.createSection(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateSectionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSectionSchema, req.body, "Invalid section data")
  const { schoolId } = requireAuth(req)
  const updated = await sectionService.updateSection(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
