import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createGradingBandSchema,
  listGradingBandsQuerySchema,
  updateGradingBandSchema,
} from "./grading-band.schema.js"
import * as gradingBandService from "./grading-band.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listGradingBandsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listGradingBandsQuerySchema, req.query, "Invalid grading bands list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await gradingBandService.listGradingBands(query, schoolId)))
}

export const getGradingBandHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await gradingBandService.getGradingBandById(routeParam(req.params.id), schoolId)))
}

export const createGradingBandHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createGradingBandSchema, req.body, "Invalid grading band data")
  const { schoolId } = requireAuth(req)
  const created = await gradingBandService.createGradingBand(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateGradingBandHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateGradingBandSchema, req.body, "Invalid grading band data")
  const { schoolId } = requireAuth(req)
  const updated = await gradingBandService.updateGradingBand(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
