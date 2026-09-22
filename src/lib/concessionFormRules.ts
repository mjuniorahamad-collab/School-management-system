import type { AdjustmentKind, RequestAdjustmentInput } from "@/types/concessions"

export interface ConcessionRequestFormValue {
  invoiceId: string
  kind: AdjustmentKind
  value: string
  reason: string
}

export interface ConcessionRequestFormError {
  field: keyof ConcessionRequestFormValue
  message: string
}

const REASON_MAX_LENGTH = 500

/** Mirrors the backend moneySchema: a positive amount with at most two decimals. */
export function isValidMoney(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false
  const cents = Math.round(value * 100)
  return Math.abs(value * 100 - cents) < 1e-9
}

export function validateConcessionRequestForm(value: ConcessionRequestFormValue): ConcessionRequestFormError[] {
  const errors: ConcessionRequestFormError[] = []
  if (!value.invoiceId.trim()) {
    errors.push({ field: "invoiceId", message: "An invoice is required" })
  }
  const parsedValue = Number(value.value)
  if (value.value.trim() === "" || !isValidMoney(parsedValue)) {
    errors.push({ field: "value", message: "Enter a positive amount with at most two decimal places" })
  } else if (value.kind === "PERCENTAGE" && parsedValue > 100) {
    errors.push({ field: "value", message: "A percentage concession cannot exceed 100" })
  }
  if (value.reason.trim().length > REASON_MAX_LENGTH) {
    errors.push({ field: "reason", message: `Reason must be at most ${REASON_MAX_LENGTH} characters` })
  }
  return errors
}

export function concessionRequestFormToPayload(value: ConcessionRequestFormValue): RequestAdjustmentInput {
  const payload: RequestAdjustmentInput = {
    invoiceId: value.invoiceId.trim(),
    kind: value.kind,
    value: Number(value.value),
  }
  const reason = value.reason.trim()
  if (reason) payload.reason = reason
  return payload
}