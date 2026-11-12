import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  copyTimetableDaySchema,
  createTimetableEntrySchema,
  listTimetableQuerySchema,
  updateTimetableEntrySchema,
} from "./timetable.schema.js"
import * as timetableService from "./timetable.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): {
  schoolId: string
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listTimetableEntriesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listTimetableQuerySchema, req.query, "Invalid timetable query")
  const auth = requireAuth(req)
  res.json(ok(await timetableService.listTimetableEntries(query, auth.schoolId, (req as any).teacherTimetableScope)))
}

export const getTimetableEntryHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await timetableService.getTimetableEntryById(routeParam(req.params.id), auth.schoolId)))
}

export const createTimetableEntryHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createTimetableEntrySchema, req.body, "Invalid timetable entry data")
  const auth = requireAuth(req)
  const created = await timetableService.createTimetableEntry(input, auth.schoolId)
  res.status(201).json(ok(created))
}

export const updateTimetableEntryHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateTimetableEntrySchema, req.body, "Invalid timetable entry data")
  const auth = requireAuth(req)
  const updated = await timetableService.updateTimetableEntry(routeParam(req.params.id), input, auth.schoolId)
  res.json(ok(updated))
}

export const deleteTimetableEntryHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  await timetableService.deleteTimetableEntry(routeParam(req.params.id), auth.schoolId)
  res.json(ok({ deleted: true }))
}

export const copyTimetableDayHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(copyTimetableDaySchema, req.body, "Invalid copy-day data")
  const auth = requireAuth(req)
  res.json(ok(await timetableService.copyTimetableDay(input, auth.schoolId)))
}
