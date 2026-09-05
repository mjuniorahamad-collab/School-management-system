import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  createEventSchema,
  listEventsQuerySchema,
  updateEventSchema,
} from "./event.schema.js"
import * as eventService from "./event.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listEventsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listEventsQuerySchema, req.query, "Invalid events list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await eventService.listEvents(query, schoolId)))
}

export const getEventHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await eventService.getEventById(routeParam(req.params.id), schoolId)))
}

export const createEventHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createEventSchema, req.body, "Invalid event data")
  const auth = requireAuth(req)
  const created = await eventService.createEvent(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateEventHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateEventSchema, req.body, "Invalid event data")
  const auth = requireAuth(req)
  const updated = await eventService.updateEvent(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}

export const deleteEventHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const id = routeParam(req.params.id)
  await eventService.deleteEvent(id, auth.school.id, auth)
  res.json(ok({ id, deleted: true }))
}
