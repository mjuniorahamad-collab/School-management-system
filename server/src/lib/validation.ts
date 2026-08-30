import { z } from "zod"
import { validationError } from "./ApiError.js"

/** Normalizes zod issues into a client-safe `{ path, message }[]` shape. */
export function zodIssues(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }))
}

/**
 * Parses input with the given zod schema and throws the API validation error
 * envelope on failure. Controllers use this at the boundary so validation is
 * uniform across feature modules.
 */
export function parseWithZod<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  message = "Invalid request",
): z.infer<TSchema> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw validationError(message, { issues: zodIssues(parsed.error) })
  }
  return parsed.data
}