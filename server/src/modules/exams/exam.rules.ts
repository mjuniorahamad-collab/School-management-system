export const EXAM_STATUSES = ["DRAFT", "PUBLISHED", "FINAL", "ARCHIVED"] as const

export type ExamStatus = (typeof EXAM_STATUSES)[number]

/**
 * Lifecycle rules for Exams & Results.
 *
 * DRAFT → PUBLISHED (marks entry) → FINAL (frozen, aggregates/rank computed)
 * → ARCHIVED (history). A FINAL exam can only leave its state by being reopened
 * to PUBLISHED (admin/principal correction), after which it must be finalized
 * again. ARCHIVED is terminal.
 *
 * Transitions split across two permission scopes:
 *   - Publish/archive (DRAFT→PUBLISHED, *→ARCHIVED): `exams:update`.
 *   - Finalize / reopen (PUBLISHED→FINAL, FINAL→PUBLISHED): `results:publish`.
 */
const EXAM_STATUS_TRANSITIONS: Record<ExamStatus, readonly ExamStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["FINAL", "ARCHIVED"],
  FINAL: ["PUBLISHED"],
  ARCHIVED: [],
}

export function canTransitionExamStatus(from: ExamStatus, to: ExamStatus): boolean {
  return EXAM_STATUS_TRANSITIONS[from].includes(to)
}

// The action-level guards below are explicit (not derived from the generic
// transition map) so "publish" (first-time DRAFT → PUBLISHED) and "reopen"
// (FINAL → PUBLISHED) stay distinct even though both land on PUBLISHED.

export function canPublishExam(from: ExamStatus): boolean {
  return from === "DRAFT"
}

export function canArchiveExam(from: ExamStatus): boolean {
  return from === "DRAFT" || from === "PUBLISHED"
}

export function canFinalizeExam(from: ExamStatus): boolean {
  return from === "PUBLISHED"
}

export function canReopenExam(from: ExamStatus): boolean {
  return from === "FINAL"
}