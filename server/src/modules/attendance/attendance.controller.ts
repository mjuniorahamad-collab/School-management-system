import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  attendanceSummaryQuerySchema,
  bulkMarkAttendanceSchema,
  listAttendanceQuerySchema,
  markAttendanceSchema,
  updateAttendanceSchema,
} from "./attendance.schema.js"
import * as attendanceService from "./attendance.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAttendanceRecordsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAttendanceQuerySchema, req.query, "Invalid attendance query")
  const { school } = requireAuth(req)
  res.json(ok(await attendanceService.listAttendanceRecords(query, school.id)))
}

export const getAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const { school } = requireAuth(req)
  res.json(ok(await attendanceService.getAttendanceRecordById(routeParam(req.params.id), school.id)))
}

export const markAttendanceHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(markAttendanceSchema, req.body, "Invalid attendance data")
  const auth = requireAuth(req)
  const created = await attendanceService.markAttendance(
    input,
    auth.school.id,
    auth,
  )
  res.status(201).json(ok(created))
}

export const bulkMarkAttendanceHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(bulkMarkAttendanceSchema, req.body, "Invalid bulk attendance data")
  const auth = requireAuth(req)
  res.json(ok(await attendanceService.bulkMarkAttendance(input, auth.school.id, auth)))
}

export const updateAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAttendanceSchema, req.body, "Invalid attendance data")
  const auth = requireAuth(req)
  const updated = await attendanceService.updateAttendanceRecord(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

export const deleteAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  await attendanceService.deleteAttendanceRecord(routeParam(req.params.id), auth.school.id, auth)
  res.json(ok({ deleted: true }))
}

export const getAttendanceSummaryHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(attendanceSummaryQuerySchema, req.query, "Invalid attendance summary query")
  const auth = requireAuth(req)
  res.json(ok(await attendanceService.getAttendanceSummary(query, auth.school.id)))
}
