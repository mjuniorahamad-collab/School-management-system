import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createCalendarDaySchema,
  listCalendarDaysQuerySchema,
  updateCalendarDaySchema,
  upsertCalendarSchema,
} from "./academic-calendar.schema.js"
import * as academicCalendarService from "./academic-calendar.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listCalendarsHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await academicCalendarService.listCalendars(schoolId)))
}

export const getCalendarHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(
    ok(await academicCalendarService.getCalendarBySession(routeParam(req.params.academicSessionId), schoolId)),
  )
}

export const upsertCalendarHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(upsertCalendarSchema, req.body, "Invalid academic calendar data")
  const auth = requireAuth(req)
  res.json(
    ok(
      await academicCalendarService.upsertCalendar(
        routeParam(req.params.academicSessionId),
        input,
        auth.school.id,
        auth,
      ),
    ),
  )
}

export const confirmCalendarHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(
    ok(
      await academicCalendarService.confirmCalendar(
        routeParam(req.params.academicSessionId),
        auth.school.id,
        auth,
      ),
    ),
  )
}

export const listCalendarDaysHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listCalendarDaysQuerySchema, req.query, "Invalid calendar days query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await academicCalendarService.listCalendarDays(query, schoolId)))
}

export const createCalendarDayHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createCalendarDaySchema, req.body, "Invalid calendar day data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await academicCalendarService.createCalendarDay(input, auth.school.id, auth)))
}

export const updateCalendarDayHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateCalendarDaySchema, req.body, "Invalid calendar day data")
  const auth = requireAuth(req)
  res.json(
    ok(
      await academicCalendarService.updateCalendarDay(
        routeParam(req.params.id),
        input,
        auth.school.id,
        auth,
      ),
    ),
  )
}

export const deleteCalendarDayHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  await academicCalendarService.deleteCalendarDay(routeParam(req.params.id), auth.school.id, auth)
  res.json(ok({ deleted: true }))
}

export const confirmCalendarDayHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(
    ok(await academicCalendarService.confirmCalendarDay(routeParam(req.params.id), auth.school.id, auth)),
  )
}
