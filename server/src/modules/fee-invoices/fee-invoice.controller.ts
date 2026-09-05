import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  generateInvoicesSchema,
  generationPreviewSchema,
  listInvoicesQuerySchema,
} from "./fee-invoice.schema.js"
import * as feeInvoiceService from "./fee-invoice.service.js"

function requireAuth(req: { auth?: AuthUser }): {
  id: string
  schoolId: string
  auth: AuthUser
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { id: req.auth.id, schoolId: req.auth.school.id, auth: req.auth }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listInvoicesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listInvoicesQuerySchema, req.query, "Invalid invoices list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeInvoiceService.listInvoices(query, schoolId)))
}

export const getInvoiceHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeInvoiceService.getInvoiceById(routeParam(req.params.id), schoolId)))
}

export const getGenerationPreviewHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(generationPreviewSchema, req.query, "Invalid generation preview query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await feeInvoiceService.getGenerationPreview(input, schoolId)))
}

export const generateInvoicesHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(generateInvoicesSchema, req.body, "Invalid invoice generation request")
  const { id, schoolId, auth } = requireAuth(req)
  const result = await feeInvoiceService.generateInvoices(input, schoolId, id, auth)
  res.status(201).json(ok(result))
}