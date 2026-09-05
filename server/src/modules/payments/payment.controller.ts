import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import { createPaymentSchema, listPaymentsQuerySchema } from "./payment.schema.js"
import { createPayment, getPaymentById, listPayments } from "./payment.service.js"

function requireAuth(req: { auth?: { id: string; name: string; school: { id: string } } }): {
  id: string
  name: string
  schoolId: string
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { id: req.auth.id, name: req.auth.name, schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const createPaymentHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createPaymentSchema, req.body, "Invalid payment request")
  const { id, name, schoolId } = requireAuth(req)
  const result = await createPayment(input, schoolId, id, name)
  res.status(result.replayed ? 200 : 201).json(ok(result))
}

export const listPaymentsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listPaymentsQuerySchema, req.query, "Invalid payments list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await listPayments(query, schoolId)))
}

export const getPaymentByIdHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await getPaymentById(routeParam(req.params.id), schoolId)))
}