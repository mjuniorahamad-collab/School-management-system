export type TaskStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED"

export const TASK_STATUSES: readonly TaskStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

/**
 * Lifecycle rules shared by Homework and Assignments.
 *
 * DRAFT → PUBLISHED → ARCHIVED (with a DRAFT → ARCHIVED shortcut). There is no
 * stored CLOSED state — "overdue" is derived from `dueDate < today`, so the UI
 * can never drift from the real due date.
 */
const TASK_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_STATUS_TRANSITIONS[from].includes(to)
}

/** Compares `YYYY-MM-DD` strings (safe: both are date-only, UTC-midnight). */
export function isTaskOverdue(dueDate: string, today: string): boolean {
  return dueDate < today
}

/** Server-local calendar date as `YYYY-MM-DD` (no timezone conversion). */
export function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}