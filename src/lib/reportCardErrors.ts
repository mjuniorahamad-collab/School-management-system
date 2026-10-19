// Maps Report Card API failures to actionable, non-leaking messages.
//
// The backend messages are already user-facing and never contain internal
// identifiers, so they are preferred when present. This helper guarantees a
// non-empty string, adds reason-specific context to
// `REPORT_CARD_ARCHIVE_MISMATCH` (from `error.details.reason`), and falls back
// to a mapped message when a known code arrives with no message. Raw internal
// details (e.g. storage keys, snapshot hashes) are never surfaced.

import { ApiClientError } from "@/lib/apiClient"
import type { ReportCardArchiveMismatchReason } from "@/types/reportCard"

const GENERIC_FALLBACK = "Something went wrong. Please try again."

const REPORT_CARD_ERROR_MESSAGES: Record<string, string> = {
  REPORT_CARD_DRAFT_EXISTS:
    "An active draft already exists for this student and session. Finalize or discard it before generating a new version.",
  REPORT_CARD_INVALID_STATE: "This action is not allowed in the report card's current state.",
  REPORT_CARD_NOT_PUBLISHABLE:
    "The report card is not publishable yet. Resolve the outstanding academic issues first.",
  REPORT_CARD_REISSUE_REASON_REQUIRED:
    "A reissue reason is required when superseding an already-published report card.",
  REPORT_CARD_ARCHIVE_REQUIRED:
    "A confirmed PDF archive must be attached before this report card can be issued.",
  REPORT_CARD_ARCHIVE_MISMATCH: "The uploaded PDF does not match this report card version.",
  REPORT_CARD_ARCHIVE_EXISTS: "This report card version already has a confirmed PDF archive.",
  REPORT_CARD_INVALID_PDF: "The uploaded file is not a valid PDF document.",
}

const ARCHIVE_MISMATCH_REASONS: Record<ReportCardArchiveMismatchReason, string> = {
  REPORT_CARD: "The uploaded PDF belongs to a different report card.",
  VERSION: "The uploaded PDF is bound to a different version of this report card.",
  SNAPSHOT_HASH: "The uploaded PDF is bound to a different frozen snapshot of this report card.",
}

function readArchiveMismatchReason(details: unknown): ReportCardArchiveMismatchReason | null {
  if (details !== null && typeof details === "object" && "reason" in details) {
    const reason = (details as { reason?: unknown }).reason
    if (reason === "REPORT_CARD" || reason === "VERSION" || reason === "SNAPSHOT_HASH") {
      return reason
    }
  }
  return null
}

export function reportCardErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    if (error instanceof Error) return error.message || GENERIC_FALLBACK
    return GENERIC_FALLBACK
  }

  const backendMessage = error.message?.trim()

  if (error.code === "REPORT_CARD_ARCHIVE_MISMATCH") {
    const reason = readArchiveMismatchReason(error.details)
    if (reason) return ARCHIVE_MISMATCH_REASONS[reason]
  }

  if (backendMessage) return backendMessage
  if (error.code && REPORT_CARD_ERROR_MESSAGES[error.code]) {
    return REPORT_CARD_ERROR_MESSAGES[error.code]
  }
  return GENERIC_FALLBACK
}
