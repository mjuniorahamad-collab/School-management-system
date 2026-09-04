import type { ClassFormPayload } from "@/types/classes"

export interface ClassFormValue {
  name: string
  sortOrder: string
}

export interface ClassFormError {
  field: keyof ClassFormValue
  message: string
}

export function validateClassForm(value: ClassFormValue): ClassFormError[] {
  const errors: ClassFormError[] = []
  if (!value.name.trim()) errors.push({ field: "name", message: "Class name is required" })
  return errors
}

export function classFormToPayload(value: ClassFormValue): ClassFormPayload {
  const payload: ClassFormPayload = { name: value.name.trim() }
  const sortOrder = value.sortOrder.trim()
  if (sortOrder) {
    const parsed = Number(sortOrder)
    if (Number.isInteger(parsed) && parsed >= 0) payload.sortOrder = parsed
  }
  return payload
}
