import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  createNotificationSchema,
  listNotificationsQuerySchema,
} from "./notification.schema.js"
import * as notificationService from "./notification.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listNotificationsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listNotificationsQuerySchema, req.query, "Invalid notifications list query")
  const auth = requireAuth(req)
  res.json(ok(await notificationService.listMyNotifications(query, auth.school.id, auth.id)))
}

export const createNotificationHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createNotificationSchema, req.body, "Invalid notification data")
  const auth = requireAuth(req)
  const created = await notificationService.createNotification(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const unreadCountHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await notificationService.getMyUnreadCount(auth.school.id, auth.id)))
}

export const markReadHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const result = await notificationService.markRead(routeParam(req.params.id), auth.school.id, auth.id)
  res.json(ok(result))
}

export const markAllReadHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await notificationService.markAllRead(auth.school.id, auth.id)))
}