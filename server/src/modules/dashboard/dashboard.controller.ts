import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import { attendanceQuerySchema, feesQuerySchema } from "./dashboard.schema.js"
import * as dashboardService from "./dashboard.service.js"

function extractSchoolId(req: { auth?: AuthUser }): string {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth.school.id
}

export const getStatsHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getStats(schoolId)))
}

export const getAttendanceHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  const query = parseWithZod(attendanceQuerySchema, req.query, "Invalid attendance query")
  res.json(ok(await dashboardService.getAttendance(schoolId, query.period)))
}

export const getFeeAnalyticsHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  const query = parseWithZod(feesQuerySchema, req.query, "Invalid fees query")
  res.json(ok(await dashboardService.getFeeAnalytics(schoolId, query.period)))
}

export const getFeeCollectionStatusHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getFeeCollectionStatus(schoolId)))
}

export const getTopClassesHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getTopClasses(schoolId)))
}

export const getRecentStudentsHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getRecentStudents(schoolId)))
}

export const getUpcomingEventsHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getUpcomingEvents(schoolId)))
}

export const getImportantNoticesHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getImportantNotices(schoolId)))
}

export const getRecentActivityHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getRecentActivity(schoolId)))
}

export const getBirthdayStudentsHandler: RequestHandler = async (req, res) => {
  const schoolId = extractSchoolId(req)
  res.json(ok(await dashboardService.getBirthdayStudents(schoolId)))
}
