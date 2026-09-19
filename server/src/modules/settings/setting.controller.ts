import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import { updateSettingsSchema } from "./setting.schema.js"
import * as settingService from "./setting.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

export const getSettingsHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await settingService.getSettings(schoolId)))
}

/**
 * Tenant-scoped branding read available to any authenticated user of the school
 * (no permission required): the chrome/sidebar/header need the editable school
 * name for portal-only roles that must not receive the full settings payload.
 */
export const getBrandingHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await settingService.getBranding(schoolId)))
}

export const updateSettingsHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSettingsSchema, req.body, "Invalid settings data")
  const auth = requireAuth(req)
  res.json(ok(await settingService.updateSettings(input, auth.school.id, auth)))
}
