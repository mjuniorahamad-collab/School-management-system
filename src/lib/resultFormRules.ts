// Client-side drafting + validation for marks-entry cells. The server remains
// authoritative; this mirrors its rules so typos surface before the round trip.

import type { MarksRowInput, ResultMarkCell, ResultSheetRow } from "@/types/results"

export interface MarkCellDraft {
  value: string
  isAbsent: boolean
}

const NUMBER_RE = /^\d+(\.\d{1,2})?$/

export function defaultMarkCell(mark: ResultMarkCell | undefined): MarkCellDraft {
  if (!mark) return { value: "", isAbsent: false }
  if (mark.isAbsent) return { value: "", isAbsent: true }
  return { value: mark.obtainedMarks ?? "", isAbsent: false }
}

/** Validates every drafted cell for one subject against its max marks. */
export function validateSubjectDraft(
  drafts: MarkCellDraft[],
  maxMarks: number,
): string | null {
  for (const draft of drafts) {
    if (draft.isAbsent) continue
    const trimmed = draft.value.trim()
    if (trimmed === "") continue
    if (!NUMBER_RE.test(trimmed)) return "Marks must be a number with at most two decimals"
    if (Number(trimmed) < 0) return "Marks cannot be negative"
    if (Number(trimmed) > maxMarks) return `Marks cannot exceed ${maxMarks}`
    if (Number(trimmed) > 99999.99) return "Marks are too large"
  }
  return null
}

/**
 * Builds the PUT payload for one subject from the roster rows and the active
 * drafts. Untouched cells reuse their saved server values (idempotent).
 */
export function subjectDraftToPayload(
  rows: ResultSheetRow[],
  drafts: Record<string, MarkCellDraft>,
  examSubjectId: string,
): MarksRowInput[] {
  return rows.map((row) => {
    const mark = row.marks.find((cell) => cell.examSubjectId === examSubjectId)
    const draft = drafts[`${examSubjectId}:${row.enrollmentId}`] ?? defaultMarkCell(mark)
    const obtainedMarks = draft.isAbsent || draft.value.trim() === ""
      ? null
      : Number(draft.value.trim())
    return {
      enrollmentId: row.enrollmentId,
      obtainedMarks,
      isAbsent: draft.isAbsent,
    }
  })
}