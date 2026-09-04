import type { SubjectFormPayload } from "@/types/subjects"

export interface SubjectFormValue {
  code: string
  name: string
  sortOrder: string
}

export interface SubjectFormError {
  field: keyof SubjectFormValue
  message: string
}

export function validateSubjectForm(value: SubjectFormValue): SubjectFormError[] {
  const errors: SubjectFormError[] = []
  if (!value.code.trim()) errors.push({ field: "code", message: "Subject code is required" })
  if (!value.name.trim()) errors.push({ field: "name", message: "Subject name is required" })
  return errors
}

/** Mirrors the backend normalization: trim, collapse whitespace, uppercase. */
export function normalizeSubjectCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}

export function subjectFormToPayload(value: SubjectFormValue): SubjectFormPayload {
  const payload: SubjectFormPayload = {
    code: normalizeSubjectCode(value.code),
    name: value.name.trim(),
  }
  const sortOrder = value.sortOrder.trim()
  if (sortOrder) {
    const parsed = Number(sortOrder)
    if (Number.isInteger(parsed) && parsed >= 0) payload.sortOrder = parsed
  }
  return payload
}
