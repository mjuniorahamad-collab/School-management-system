import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  addParticipantsSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  listRecipientsQuerySchema,
  sendMessageSchema,
} from "./message.schema.js"
import * as messageService from "./message.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listConversationsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listConversationsQuerySchema, req.query, "Invalid conversations list query")
  const auth = requireAuth(req)
  res.json(ok(await messageService.listConversations(query, auth.school.id, auth.id)))
}

export const createConversationHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createConversationSchema, req.body, "Invalid conversation data")
  const auth = requireAuth(req)
  const created = input.type === "DIRECT"
    ? await messageService.createDirectConversation(input, auth.school.id, auth)
    : await messageService.createGroupConversation(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const getConversationHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const detail = await messageService.getConversation(routeParam(req.params.id), auth.school.id, auth.id)
  res.json(ok(detail))
}

export const listMessagesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listMessagesQuerySchema, req.query, "Invalid messages list query")
  const auth = requireAuth(req)
  const result = await messageService.listMessages(routeParam(req.params.id), query, auth.school.id, auth.id)
  res.json(ok(result))
}

export const sendMessageHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(sendMessageSchema, req.body, "Invalid message data")
  const auth = requireAuth(req)
  const sent = await messageService.sendMessage(routeParam(req.params.id), input, auth.school.id, auth)
  res.status(201).json(ok(sent))
}

export const markConversationReadHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const result = await messageService.markConversationRead(routeParam(req.params.id), auth.school.id, auth.id)
  res.json(ok(result))
}

export const archiveConversationHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const result = await messageService.archiveConversation(routeParam(req.params.id), auth.school.id, auth)
  res.json(ok(result))
}

export const addParticipantsHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(addParticipantsSchema, req.body, "Invalid participants data")
  const auth = requireAuth(req)
  const detail = await messageService.addParticipants(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(detail))
}

export const listRecipientsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listRecipientsQuerySchema, req.query, "Invalid recipients query")
  const auth = requireAuth(req)
  res.json(ok(await messageService.listRecipients(query, auth.school.id, auth.id)))
}

export const unreadCountHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await messageService.getUnreadCount(auth.school.id, auth.id)))
}