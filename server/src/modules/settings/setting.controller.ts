import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import { updateSettingsSchema } from "./setting.schema.js"
import * as settingService from "./setting.service.js"

function requireAuth(req: { auth?: { school: { id: string } } }): { schoolId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id }
}

export const getSettingsHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await settingService.getSettings(schoolId)))
}

export const updateSettingsHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateSettingsSchema, req.body, "Invalid settings data")
  const { schoolId } = requireAuth(req)
  res.json(ok(await settingService.updateSettings(input, schoolId)))
}
