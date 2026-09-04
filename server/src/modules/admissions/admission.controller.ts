import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import type { AuthUser } from "../../types/auth.js"
import {
  convertAdmissionSchema,
  createAdmissionSchema,
  listAdmissionsQuerySchema,
  reviewAdmissionSchema,
  updateAdmissionSchema,
} from "./admission.schema.js"
import * as admissionService from "./admission.service.js"

function requireAuth(req: { auth?: AuthUser }): { schoolId: string; actorId: string } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id, actorId: req.auth.id }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAdmissionsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAdmissionsQuerySchema, req.query, "Invalid admissions list query")
  const { schoolId } = requireAuth(req)
  res.json(ok(await admissionService.listAdmissions(query, schoolId)))
}

export const getAdmissionHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await admissionService.getAdmissionById(routeParam(req.params.id), schoolId)))
}

export const createAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createAdmissionSchema, req.body, "Invalid admission data")
  const { schoolId, actorId } = requireAuth(req)
  const created = await admissionService.createAdmission(input, schoolId, actorId)
  res.status(201).json(ok(created))
}

export const updateAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAdmissionSchema, req.body, "Invalid admission data")
  const { schoolId, actorId } = requireAuth(req)
  const updated = await admissionService.updateAdmission(
    routeParam(req.params.id),
    input,
    schoolId,
    actorId,
  )
  res.json(ok(updated))
}

export const reviewAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(reviewAdmissionSchema, req.body, "Invalid review data")
  const { schoolId, actorId } = requireAuth(req)
  const reviewed = await admissionService.reviewAdmission(
    routeParam(req.params.id),
    input,
    schoolId,
    actorId,
  )
  res.json(ok(reviewed))
}

export const convertAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(convertAdmissionSchema, req.body, "Invalid conversion data")
  const { schoolId, actorId } = requireAuth(req)
  const converted = await admissionService.convertAdmission(
    routeParam(req.params.id),
    input,
    schoolId,
    actorId,
  )
  res.json(ok(converted))
}

export const deleteAdmissionHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  const id = routeParam(req.params.id)
  await admissionService.deleteAdmission(id, schoolId)
  res.json(ok({ id, deleted: true }))
}

export const getAdmissionsMetaHandler: RequestHandler = async (req, res) => {
  const { schoolId } = requireAuth(req)
  res.json(ok(await admissionService.getAdmissionsMeta(schoolId)))
}
