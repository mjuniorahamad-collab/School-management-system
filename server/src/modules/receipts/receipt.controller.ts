import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import { listReceiptsQuerySchema } from "./receipt.schema.js"
import { getReceiptById, listReceipts } from "./receipt.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listReceiptsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listReceiptsQuerySchema, req.query, "Invalid receipts list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await listReceipts(query, schoolId)))
}

export const getReceiptByIdHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await getReceiptById(routeParam(req.params.id), schoolId)))
}