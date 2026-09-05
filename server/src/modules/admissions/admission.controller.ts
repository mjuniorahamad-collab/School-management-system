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

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const listAdmissionsHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listAdmissionsQuerySchema, req.query, "Invalid admissions list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await admissionService.listAdmissions(query, schoolId)))
}

export const getAdmissionHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await admissionService.getAdmissionById(routeParam(req.params.id), schoolId)))
}

export const createAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createAdmissionSchema, req.body, "Invalid admission data")
  const auth = requireAuth(req)
  const created = await admissionService.createAdmission(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateAdmissionSchema, req.body, "Invalid admission data")
  const auth = requireAuth(req)
  const updated = await admissionService.updateAdmission(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(updated))
}

export const reviewAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(reviewAdmissionSchema, req.body, "Invalid review data")
  const auth = requireAuth(req)
  const reviewed = await admissionService.reviewAdmission(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(reviewed))
}

export const convertAdmissionHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(convertAdmissionSchema, req.body, "Invalid conversion data")
  const auth = requireAuth(req)
  const converted = await admissionService.convertAdmission(
    routeParam(req.params.id),
    input,
    auth.school.id,
    auth,
  )
  res.json(ok(converted))
}

export const deleteAdmissionHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const id = routeParam(req.params.id)
  await admissionService.deleteAdmission(id, auth.school.id, auth)
  res.json(ok({ id, deleted: true }))
}

export const getAdmissionsMetaHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await admissionService.getAdmissionsMeta(schoolId)))
}
