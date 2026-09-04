import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createFeeHeadSchema,
  listFeeHeadsQuerySchema,
  updateFeeHeadSchema,
} from "./fee-head.schema.js"
import * as feeHeadService from "./fee-head.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listFeeHeadsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listFeeHeadsQuerySchema, req.query, "Invalid fee heads list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeHeadService.listFeeHeads(query, schoolId)))
}

export const getFeeHeadHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeHeadService.getFeeHeadById(routeParam(req.params.id), schoolId)))
}

export const createFeeHeadHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createFeeHeadSchema, req.body, "Invalid fee head data")
  const { schoolId } = requireAuth(req)
  const created = await feeHeadService.createFeeHead(input, schoolId)
  res.status(201).json(ok(created))
}

export const updateFeeHeadHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateFeeHeadSchema, req.body, "Invalid fee head data")
  const { schoolId } = requireAuth(req)
  const updated = await feeHeadService.updateFeeHead(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}
