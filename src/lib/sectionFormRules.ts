export interface SectionFormValue {
  classId: string
  name: string
}

export interface SectionFormError {
  field: keyof SectionFormValue
  message: string
}

/**
 * Validates the section form. Requires a class selection; the section name must
 * be non-empty.
 */
export function validateSectionForm(value: SectionFormValue): SectionFormError[] {
  const errors: SectionFormError[] = []
  if (!value.classId) errors.push({ field: "classId", message: "A class is required" })
  if (!value.name.trim()) errors.push({ field: "name", message: "Section name is required" })
  return errors
}
