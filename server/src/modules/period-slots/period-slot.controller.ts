import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createPeriodSlotSchema,
  listPeriodSlotsQuerySchema,
  updatePeriodSlotSchema,
} from "./period-slot.schema.js"
import * as periodSlotService from "./period-slot.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listPeriodSlotsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listPeriodSlotsQuerySchema, req.query, "Invalid periods list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await periodSlotService.listPeriodSlots(query, schoolId)))
}

export const getPeriodSlotHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await periodSlotService.getPeriodSlotById(routeParam(req.params.id), schoolId)))
}

export const createPeriodSlotHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createPeriodSlotSchema, req.body, "Invalid period data")
  const { schoolId } = requireAuth(req)
  const created = await periodSlotService.createPeriodSlot(input, schoolId)
  res.status(201).json(ok(created))
}

export const updatePeriodSlotHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updatePeriodSlotSchema, req.body, "Invalid period data")
  const { schoolId } = requireAuth(req)
  const updated = await periodSlotService.updatePeriodSlot(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
