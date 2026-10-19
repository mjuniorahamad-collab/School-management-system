// Report Card domain errors
import {
  ApiError,
  REPORT_CARD_ARCHIVE_EXISTS,
  REPORT_CARD_ARCHIVE_MISMATCH,
  REPORT_CARD_ARCHIVE_REQUIRED,
  REPORT_CARD_DRAFT_EXISTS,
  REPORT_CARD_INVALID_PDF,
  REPORT_CARD_INVALID_STATE,
  REPORT_CARD_NOT_PUBLISHABLE,
  REPORT_CARD_REISSUE_REASON_REQUIRED,
  REPORT_CARD_SIGNATORIES_INVALID,
  REPORT_CARD_SIGNATORIES_REQUIRED,
  badRequestError,
  notFoundError,
} from "../../lib/ApiError.js"

export function reportCardNotFoundError(): ApiError {
  return notFoundError("Report card not found")
}

export function reportCardSchemeNotFoundError(): ApiError {
  return notFoundError("Report card scheme not found")
}

export function invalidReportCardStateError(message: string): ApiError {
  return badRequestError(message)
}

export function reportCardGenerationBlockedError(message: string, details?: unknown): ApiError {
  return badRequestError(message, details)
}

/**
 * The tenant has no usable report card signatory configuration: it is unset or
 * an empty list. Signatories are required (§8a), so generation is refused until
 * an administrator configures at least one { role, name } pair in Settings.
 */
export function reportCardSignatoriesRequiredError(): ApiError {
  return new ApiError(
    400,
    REPORT_CARD_SIGNATORIES_REQUIRED,
    "Report card signatories are required: configure at least one signatory (role and name) in Settings before generating a report card",
  )
}

/**
 * The stored signatory configuration exists but cannot be parsed into a valid
 * non-empty list of { role, name } pairs. This is a data-integrity failure, not
 * a user omission, and is surfaced distinctly so it can be corrected in Settings.
 */
export function reportCardSignatoriesInvalidError(): ApiError {
  return new ApiError(
    400,
    REPORT_CARD_SIGNATORIES_INVALID,
    "The report card signatory configuration is invalid; correct it in Settings before generating a report card",
  )
}

/**
 * There is already an active DRAFT for this (school, academic session, student).
 * Generation is not idempotent: a second concurrent or repeated request must
 * surface a clear conflict rather than silently accumulate another draft. The
 * pre-write check and the unique-constraint backstop both map here.
 */
export function reportCardDraftExistsError(version?: number): ApiError {
  const suffix = typeof version === "number" ? ` (version ${version})` : ""
  return new ApiError(
    409,
    REPORT_CARD_DRAFT_EXISTS,
    `An active draft report card already exists for this student and academic session${suffix}. Finalize or discard it before generating a new version.`,
  )
}

export function reportCardAlreadyIssuedError(): ApiError {
  return badRequestError("Report card is already issued and cannot be modified")
}

/**
 * The requested lifecycle transition is not legal from the card's current
 * status (e.g. publishing a card that is not a DRAFT). Rejected rather than
 * silently ignored so an already-published version is never re-stamped.
 */
export function reportCardInvalidStateError(message: string): ApiError {
  return new ApiError(409, REPORT_CARD_INVALID_STATE, message)
}

/**
 * The frozen card does not satisfy the §8 academic publication preconditions
 * (unresolved exams, review-required subject, or an overall result that is not
 * PASS/FAIL) or, for a v2 snapshot, does not carry a valid frozen signatory
 * list. The card stays a DRAFT; the blocker (and, where applicable, a
 * machine-readable `reason`) is surfaced to the actor.
 */
export function reportCardNotPublishableError(message: string, details?: unknown): ApiError {
  return new ApiError(409, REPORT_CARD_NOT_PUBLISHABLE, message, details)
}

/**
 * A correction to an already-published (PENDING_ARCHIVE/ISSUED) version is a
 * NEW version and must carry an explicit reissue reason (docs/report-card.md
 * §8), so a superseding version is never created without a recorded rationale.
 */
export function reportCardReissueReasonRequiredError(): ApiError {
  return new ApiError(
    400,
    REPORT_CARD_REISSUE_REASON_REQUIRED,
    "A reissue reason is required when superseding an already-published report card",
  )
}

/**
 * Issuance is blocked because the tenant requires a valid, human-confirmed PDF
 * archive first (docs/report-card.md §9). The card stays PENDING_ARCHIVE —
 * never issued without an artifact that can be produced on demand.
 */
export function reportCardArchiveRequiredError(): ApiError {
  return new ApiError(
    409,
    REPORT_CARD_ARCHIVE_REQUIRED,
    "A validated, confirmed PDF archive must be attached before this report card can be issued",
  )
}

/**
 * The confirmed artifact is not bound to the exact version being issued: it
 * belongs to a different report card, a different version, or a different
 * `snapshotHash`. Refused rather than issued, so an archived PDF can never be
 * presented as the record of a version it does not describe (§9 "verify").
 */
export function reportCardArchiveMismatchError(
  reason: "REPORT_CARD" | "VERSION" | "SNAPSHOT_HASH",
): ApiError {
  const messages = {
    REPORT_CARD: "The uploaded archive belongs to a different report card",
    VERSION: "The uploaded archive is bound to a different report card version",
    SNAPSHOT_HASH:
      "The uploaded archive is bound to a different frozen snapshot of this report card",
  } as const
  return new ApiError(409, REPORT_CARD_ARCHIVE_MISMATCH, messages[reason], { reason })
}

/**
 * The report card already has a confirmed archive for its current version.
 * Replacement requires deleting the existing archive first (§9), so an
 * accidental double upload can never silently replace a signed-off artifact.
 */
export function reportCardArchiveExistsError(): ApiError {
  return new ApiError(
    409,
    REPORT_CARD_ARCHIVE_EXISTS,
    "This report card version already has a confirmed PDF archive; delete it before uploading another",
  )
}

/**
 * The uploaded bytes are not a PDF (magic bytes fail `%PDF-`). Rejected before
 * anything is written to storage or the database.
 */
export function reportCardInvalidPdfError(): ApiError {
  return new ApiError(400, REPORT_CARD_INVALID_PDF, "The uploaded file is not a valid PDF document")
}