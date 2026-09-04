import type { AcademicSessionFormPayload } from "@/types/academicSessions"

export interface SessionFormValue {
  name: string
  code: string
  startDate: string
  endDate: string
  status: string
}

export interface SessionFormError {
  field: keyof SessionFormValue
  message: string
}

/** Returns a human-readable error message for an invalid ISO date string, or null. */
export function validateDateInput(value: string): string | null {
  if (!value) return "Date is required"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Use YYYY-MM-DD format"
  return null
}

/**
 * Validates the whole session form. Returns an array of field errors; an empty
 * array means the form is valid.
 */
export function validateSessionForm(value: SessionFormValue): SessionFormError[] {
  const errors: SessionFormError[] = []

  if (!value.name.trim()) errors.push({ field: "name", message: "Session name is required" })
  if (!value.code.trim()) errors.push({ field: "code", message: "Session code is required" })

  const startError = validateDateInput(value.startDate)
  if (startError) errors.push({ field: "startDate", message: startError })

  const endError = validateDateInput(value.endDate)
  if (endError) errors.push({ field: "endDate", message: endError })

  const startOk = value.startDate && !validateDateInput(value.startDate)
  const endOk = value.endDate && !validateDateInput(value.endDate)
  if (startOk && endOk && value.startDate >= value.endDate) {
    errors.push({ field: "endDate", message: "End date must be after the start date" })
  }

  return errors
}

/**
 * Builds the API payload from raw form state. Only includes the status when
 * explicitly chosen so create defaults server-side to UPCOMING.
 */
export function sessionFormToPayload(value: SessionFormValue): AcademicSessionFormPayload {
  const payload: AcademicSessionFormPayload = {
    name: value.name.trim(),
    code: value.code.trim(),
    startDate: value.startDate,
    endDate: value.endDate,
  }
  if (value.status) payload.status = value.status as AcademicSessionFormPayload["status"]
  return payload
}
