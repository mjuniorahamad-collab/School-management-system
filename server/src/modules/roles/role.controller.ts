import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import * as roleService from "./role.service.js"

export const listRolesHandler: RequestHandler = async (_req, res) => {
  res.json(ok(await roleService.listAssignableRoles()))
}
