import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createPeriodSlotSchema,
  listPeriodSlotsQuerySchema,
  updatePeriodSlotSchema,
} from "./period-slot.schema.js"
import * as periodSlotService from "./period-slot.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listPeriodSlotsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listPeriodSlotsQuerySchema, req.query, "Invalid periods list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await periodSlotService.listPeriodSlots(query, schoolId)))
}

export const getPeriodSlotHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await periodSlotService.getPeriodSlotById(routeParam(req.params.id), schoolId)))
}

export const createPeriodSlotHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createPeriodSlotSchema, req.body, "Invalid period data")
  const auth = requireAuth(req)
  const created = await periodSlotService.createPeriodSlot(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updatePeriodSlotHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updatePeriodSlotSchema, req.body, "Invalid period data")
  const auth = requireAuth(req)
  const updated = await periodSlotService.updatePeriodSlot(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}
