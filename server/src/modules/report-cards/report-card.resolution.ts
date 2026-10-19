// Exam resolution for the Annual Report Card (docs/report-card.md §3).
//
// Generation is anchored on the student's ACTUAL `ExamResult` rows, then on the
// concrete exam instances of the scheme's exam type in the student's session. It
// never infers a result from the current class/section alone. The evaluation is
// ordered and mutually exclusive, exactly as specified.

import type {
  ExamInstanceInput,
  ExamResolution,
  ExamResolutionReason,
  ExamResolutionStatus,
  StudentExamResultRow,
} from "./report-card.types.js"

export interface ResolveExamTypeParams {
  examTypeId: string
  /** Exam types selected by the scheme. Used for the OUT_OF_SCOPE check. */
  schemeExamTypeIds: readonly string[]
  studentClassId: string
  studentSectionId: string | null
  /** All of the student's `ExamResult` rows. */
  results: readonly StudentExamResultRow[]
  /** All concrete exam instances in the session. */
  instances: readonly ExamInstanceInput[]
}

function resolution(
  examTypeId: string,
  status: ExamResolutionStatus,
  reason: ExamResolutionReason | null,
  examId: string | null = null,
): ExamResolution {
  const blocks =
    status === "AMBIGUOUS" ||
    (status === "MISSING" && reason !== null) // every MISSING branch blocks
  const requiresReview =
    status === "AMBIGUOUS" || (status === "MISSING" && reason === "IMPLICIT")
  return { examTypeId, status, reason, examId, blocks, requiresReview }
}

/**
 * Resolves one scheme exam type to a concrete exam for one student.
 *
 * The function is pure: it is given the student's result rows and the session's
 * exam instances and returns the resolution. `blocks` means generation must fail
 * closed; `requiresReview` is the subset that also needs a human decision.
 */
export function resolveExamType(params: ResolveExamTypeParams): ExamResolution {
  const { examTypeId, schemeExamTypeIds, studentClassId } = params

  // §3.4 — scheme eligibility: the type must be part of the scheme.
  if (!schemeExamTypeIds.includes(examTypeId)) {
    return resolution(examTypeId, "OUT_OF_SCOPE", null)
  }

  const rows = params.results.filter((row) => row.examTypeId === examTypeId)
  const instances = params.instances.filter((instance) => instance.examTypeId === examTypeId)
  const statusById = new Map(instances.map((instance) => [instance.id, instance.status]))

  // §3.1 — rows present (>= 1).
  if (rows.length === 1) {
    const row = rows[0]!
    // §3.3 — the single candidate is in a different class than the placement.
    if (row.classId !== studentClassId) {
      return resolution(examTypeId, "AMBIGUOUS", "CLASS_CHANGE", row.examId)
    }
    const status = statusById.get(row.examId)
    if (status === "FINAL") return resolution(examTypeId, "RESOLVED", null, row.examId)
    return resolution(examTypeId, "NOT_FINAL", null, row.examId)
  }

  if (rows.length >= 2) {
    const classes = new Set(rows.map((row) => row.classId))
    // §3.1 — spanning different classes.
    if (classes.size > 1) return resolution(examTypeId, "AMBIGUOUS", "CLASS_CHANGE")
    const sections = new Set(rows.map((row) => row.sectionId ?? "__CLASS__"))
    // §3.1 — same class but different sections.
    if (sections.size > 1) {
      return resolution(examTypeId, "AMBIGUOUS", "CROSS_SECTION_DUPLICATE")
    }
    // Same class and section with 2+ rows has no unambiguous concrete match.
    return resolution(examTypeId, "AMBIGUOUS", "IMPLICIT")
  }

  // §3.2 — no rows: fall back to the class instances of this exam type.
  const classInstances = instances.filter((instance) => instance.classId === studentClassId)

  if (classInstances.length === 0) {
    // §3.3 — exactly one candidate instance, in a different class.
    if (instances.length === 1) {
      return resolution(examTypeId, "AMBIGUOUS", "CLASS_CHANGE", instances[0]!.id)
    }
    // §3.2 — no instance exists for the class.
    return resolution(examTypeId, "MISSING", "NO_EXAM_INSTANCE")
  }

  if (classInstances.length > 1) {
    // §3.2 — multiple possible instances with no unambiguous match.
    return resolution(examTypeId, "MISSING", "IMPLICIT")
  }

  const only = classInstances[0]!
  if (only.status === "FINAL") {
    // §3.2 — a FINAL class instance exists but the student has no result row.
    return resolution(examTypeId, "MISSING", "NO_RESULT_ROW", only.id)
  }
  // §3.2 — an instance exists but none is FINAL.
  return resolution(examTypeId, "NOT_FINAL", null, only.id)
}

/**
 * Resolves every scheme exam type for one student and reports whether any
 * resolution blocks generation.
 */
export function resolveSchemeExams(
  examTypeIds: readonly string[],
  params: Omit<ResolveExamTypeParams, "examTypeId" | "schemeExamTypeIds">,
): { resolutions: ExamResolution[]; blocked: boolean; requiresReview: boolean } {
  const resolutions = examTypeIds.map((examTypeId) =>
    resolveExamType({ ...params, examTypeId, schemeExamTypeIds: examTypeIds }),
  )
  return {
    resolutions,
    blocked: resolutions.some((entry) => entry.blocks),
    requiresReview: resolutions.some((entry) => entry.requiresReview),
  }
}
