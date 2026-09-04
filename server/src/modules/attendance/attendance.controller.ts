import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  attendanceSummaryQuerySchema,
  bulkMarkAttendanceSchema,
  listAttendanceQuerySchema,
  markAttendanceSchema,
  updateAttendanceSchema,
} from "./attendance.schema.js"
import * as attendanceService from "./attendance.service.js"

function requireAuth(req: { auth?: { school: { id: string }; id: string } }): {
  schoolId: string
  userId: string
} {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id, userId: req.auth.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAttendanceRecordsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAttendanceQuerySchema, req.query, "Invalid attendance query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await attendanceService.listAttendanceRecords(query, schoolId)))
}

export const getAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await attendanceService.getAttendanceRecordById(routeParam(req.params.id), schoolId)))
}

export const markAttendanceHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(markAttendanceSchema, req.body, "Invalid attendance data")
  const { schoolId, userId } = requireAuth(req)
  const created = await attendanceService.markAttendance(input, schoolId, userId)
  res.status(201).json(ok(created))
}

export const bulkMarkAttendanceHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(bulkMarkAttendanceSchema, req.body, "Invalid bulk attendance data")
  const { schoolId, userId } = requireAuth(req)
  res.json(ok(await attendanceService.bulkMarkAttendance(input, schoolId, userId)))
}

export const updateAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAttendanceSchema, req.body, "Invalid attendance data")
  const { schoolId } = requireAuth(req)
  const updated = await attendanceService.updateAttendanceRecord(routeParam(req.params.id), input, schoolId)
  res.json(ok(updated))
}

export const deleteAttendanceRecordHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  await attendanceService.deleteAttendanceRecord(routeParam(req.params.id), schoolId)
  res.json(ok({ deleted: true }))
}

export const getAttendanceSummaryHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(attendanceSummaryQuerySchema, req.query, "Invalid attendance summary query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await attendanceService.getAttendanceSummary(query, schoolId)))
}
