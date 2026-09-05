import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  putSubjectMarksSchema,
  resultSheetQuerySchema,
} from "./result.schema.js"
import * as resultService from "./result.service.js"

function requireAuth(req: {
  auth?: { id: string; roles: string[]; school: { id: string } }
}): { schoolId: string; userId: string; roles: string[] } {
  if (!req.auth) throw new Error("Expected authenticated request")
  return { schoolId: req.auth.school.id, userId: req.auth.id, roles: req.auth.roles }
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export const getResultSheetHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(resultSheetQuerySchema, req.query, "Invalid results query")
  const actor = requireAuth(req)
  res.json(
    ok(
      await resultService.getResultSheet(
        routeParam(req.params.examId),
        actor.schoolId,
        actor,
        query,
      ),
    ),
  )
}

export const putSubjectMarksHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(putSubjectMarksSchema, req.body, "Invalid marks data")
  const actor = requireAuth(req)
  const result = await resultService.putSubjectMarks(
    routeParam(req.params.examId),
    routeParam(req.params.examSubjectId),
    input,
    actor,
  )
  res.json(ok(result))
}

export const finalizeExamHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await resultService.finalizeExam(routeParam(req.params.examId), actor)))
}

export const reopenExamHandler: RequestHandler = async (req, res) => {
  const actor = requireAuth(req)
  res.json(ok(await resultService.reopenExam(routeParam(req.params.examId), actor)))
}