import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserMembershipSchema,
} from "./user.schema.js"
import * as userService from "./user.service.js"

function requireAuth(req: { auth?: AuthUser }): { schoolId: string; auth: AuthUser } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id, auth: req.auth }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listUsersHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listUsersQuerySchema, req.query, "Invalid users list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await userService.listUsers(query, schoolId)))
}

export const getUserHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await userService.getUserById(routeParam(req.params.id), schoolId)))
}

export const createUserHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createUserSchema, req.body, "Invalid user data")
  const { schoolId, auth } = requireAuth(req)
  const created = await userService.createUser(input, schoolId, auth)
  res.status(201).json(ok(created))
}

export const updateUserHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateUserMembershipSchema, req.body, "Invalid user update data")
  const { schoolId, auth } = requireAuth(req)
  const updated = await userService.updateUserMembership(
    routeParam(req.params.id),
    input,
    schoolId,
    auth,
  )
  res.json(ok(updated))
}

export const removeUserHandler: RequestHandler = async (req, res) => {
  const { schoolId, auth } = requireAuth(req)
  const userId = routeParam(req.params.id)
  await userService.removeUserFromTenant(userId, schoolId, auth)
  res.json(ok({ id: userId, removed: true }))
}
