import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  createNoticeSchema,
  listNoticesQuerySchema,
  updateNoticeSchema,
} from "./notice.schema.js"
import * as noticeService from "./notice.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listNoticesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listNoticesQuerySchema, req.query, "Invalid notices list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await noticeService.listNotices(query, schoolId)))
}

export const getNoticeHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await noticeService.getNoticeById(routeParam(req.params.id), schoolId)))
}

export const createNoticeHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createNoticeSchema, req.body, "Invalid notice data")
  const auth = requireAuth(req)
  const created = await noticeService.createNotice(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateNoticeHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateNoticeSchema, req.body, "Invalid notice data")
  const auth = requireAuth(req)
  const updated = await noticeService.updateNotice(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}

export const deleteNoticeHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const id = routeParam(req.params.id)
  await noticeService.deleteNotice(id, auth.school.id, auth)
  res.json(ok({ id, deleted: true }))
}
