import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  adjustActionSchema,
  listAdjustmentsQuerySchema,
  overrideAdjustmentSchema,
  requestAdjustmentSchema,
} from "./fee-adjustment.schema.js"
import {
  approveAdjustment,
  cancelAdjustment,
  getAdjustmentById,
  listAdjustments,
  overrideAdjustment,
  rejectAdjustment,
  requestAdjustment,
  reverseAdjustment,
} from "./fee-adjustment.service.js"

function requireAuth(req: { auth?: AuthUser }): {
  id: string
  name: string
  schoolId: string
  auth: AuthUser
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { id: req.auth.id, name: req.auth.name, schoolId: req.auth.school.id, auth: req.auth }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAdjustmentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAdjustmentsQuerySchema, req.query, "Invalid adjustments list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await listAdjustments(query, schoolId)))
}

export const getAdjustmentByIdHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await getAdjustmentById(routeParam(req.params.id), schoolId)))
}

export const requestAdjustmentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(requestAdjustmentSchema, req.body, "Invalid concession request")
  const { schoolId, auth } = requireAuth(req)
  const result = await requestAdjustment(input, schoolId, auth)
  res.status(201).json(ok(result))
}

export const approveAdjustmentHandler: RequestHandler = async (req, res) => {
  const body = parseWithZod(adjustActionSchema, req.body, "Invalid approval request")
  const { schoolId, auth } = requireAuth(req)
  res.json(ok(await approveAdjustment(routeParam(req.params.id), schoolId, auth, body.reason)))
}

export const overrideAdjustmentHandler: RequestHandler = async (req, res) => {
  const body = parseWithZod(overrideAdjustmentSchema, req.body, "Invalid override request")
  const { schoolId, auth } = requireAuth(req)
  res.json(ok(await overrideAdjustment(routeParam(req.params.id), schoolId, auth, body.overrideReason)))
}

export const rejectAdjustmentHandler: RequestHandler = async (req, res) => {
  const body = parseWithZod(adjustActionSchema, req.body, "Invalid rejection request")
  const { schoolId, auth } = requireAuth(req)
  res.json(ok(await rejectAdjustment(routeParam(req.params.id), schoolId, auth, body.reason)))
}

export const cancelAdjustmentHandler: RequestHandler = async (req, res) => {
  const body = parseWithZod(adjustActionSchema, req.body, "Invalid cancellation request")
  const { schoolId, auth } = requireAuth(req)
  res.json(ok(await cancelAdjustment(routeParam(req.params.id), schoolId, auth, body.reason)))
}

export const reverseAdjustmentHandler: RequestHandler = async (req, res) => {
  const body = parseWithZod(adjustActionSchema, req.body, "Invalid reversal request")
  const { schoolId, auth } = requireAuth(req)
  res.json(ok(await reverseAdjustment(routeParam(req.params.id), schoolId, auth, body.reason)))
}