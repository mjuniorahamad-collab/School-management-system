// Validation helpers for the Annual Report Card domain (docs/report-card.md §4,
// §7, §13).
//
// Pure zod schemas and rule helpers only. They deliberately contain no invented
// academic defaults: required configuration is validated for shape here and its
// absence is the caller's blocker, never silently defaulted.

import { z } from "zod"
import { badRequestError } from "../../lib/ApiError.js"
import type { MarkStatus } from "./report-card.types.js"

export const markStatusSchema = z.enum(["SCORED", "ABSENT", "NOT_APPLICABLE", "PENDING"])

export const aggregationPolicySchema = z.enum(["RAW", "PERCENTAGE_WEIGHTED"])

export const absencePolicySchema = z.enum(["EXCLUDE_AND_REVIEW", "TREAT_SUBJECT_AS_FAILED"])

export const overallPassModeSchema = z.enum([
  "ALL_SUBJECTS",
  "PERCENT_AND_MAX_FAILED",
  "CORE_SUBJECTS_AND_PERCENT",
])

/** An exact decimal string (as Prisma returns for DECIMAL columns). */
export const decimalStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(?:\.\d+)?$/, "Expected an exact decimal value")

/** A scheme exam weight must be strictly positive (docs/report-card.md §5). */
export const examWeightSchema = decimalStringSchema.refine(
  (value) => Number(value) > 0,
  "Exam weight must be strictly positive",
)

/**
 * Rejects `NOT_APPLICABLE` on a core subject at entry (docs/report-card.md §4).
 *
 * A core subject is mandatory by definition, so marking it not-applicable must
 * fail loudly at the point of entry rather than silently excluding it from the
 * core-subject condition later.
 */
export function assertMarkStatusEntryAllowed(input: {
  isCoreSubject: boolean
  status: MarkStatus
}): void {
  if (input.isCoreSubject && input.status === "NOT_APPLICABLE") {
    throw badRequestError("A core subject cannot be marked NOT_APPLICABLE")
  }
}
