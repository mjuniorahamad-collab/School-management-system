import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import { listRegistersQuerySchema, openRegisterSchema } from "./attendance-register.schema.js"
import * as attendanceRegisterService from "./attendance-register.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listRegistersHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listRegistersQuerySchema, req.query, "Invalid attendance register query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await attendanceRegisterService.listRegisters(query, schoolId)))
}

export const getRegisterHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await attendanceRegisterService.getRegisterById(routeParam(req.params.id), schoolId)))
}

export const openRegisterHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(openRegisterSchema, req.body, "Invalid attendance register data")
  const auth = requireAuth(req)
  res.status(201).json(ok(await attendanceRegisterService.openRegister(input, auth.school.id, auth)))
}

export const submitRegisterHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await attendanceRegisterService.submitRegister(routeParam(req.params.id), auth.school.id, auth)))
}

export const verifyRegisterHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  res.json(ok(await attendanceRegisterService.verifyRegister(routeParam(req.params.id), auth.school.id, auth)))
}
