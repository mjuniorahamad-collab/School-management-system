import type { StaffFormPayload } from "@/types/staff"

export interface StaffFormValue {
  firstName: string
  middleName: string
  lastName: string
  gender: string
  dateOfBirth: string
  email: string
  phone: string
  address: string
  department: string
  designation: string
  qualification: string
  experience: string
  joiningDate: string
}

export interface StaffFormError {
  field: keyof StaffFormValue
  message: string
}

export function validateStaffForm(value: StaffFormValue): StaffFormError[] {
  const errors: StaffFormError[] = []
  if (!value.firstName.trim()) errors.push({ field: "firstName", message: "First name is required" })
  if (!value.gender) errors.push({ field: "gender", message: "Gender is required" })
  if (!value.department.trim()) errors.push({ field: "department", message: "Department is required" })
  if (!value.designation.trim()) errors.push({ field: "designation", message: "Designation is required" })
  if (!value.joiningDate.trim()) errors.push({ field: "joiningDate", message: "Joining date is required" })
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(value.joiningDate.trim())) {
    errors.push({ field: "joiningDate", message: "Use YYYY-MM-DD format" })
  }
  if (value.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    errors.push({ field: "email", message: "Enter a valid email address" })
  }
  return errors
}

export function staffFormToPayload(value: StaffFormValue): StaffFormPayload {
  const payload: StaffFormPayload = {
    firstName: value.firstName.trim(),
    gender: value.gender,
    department: value.department.trim(),
    designation: value.designation.trim(),
    joiningDate: value.joiningDate.trim(),
  }
  if (value.middleName.trim()) payload.middleName = value.middleName.trim()
  if (value.lastName.trim()) payload.lastName = value.lastName.trim()
  if (value.dateOfBirth.trim()) payload.dateOfBirth = value.dateOfBirth.trim()
  if (value.email.trim()) payload.email = value.email.trim()
  if (value.phone.trim()) payload.phone = value.phone.trim()
  if (value.address.trim()) payload.address = value.address.trim()
  if (value.qualification.trim()) payload.qualification = value.qualification.trim()
  if (value.experience.trim()) {
    const parsed = Number(value.experience.trim())
    if (Number.isInteger(parsed) && parsed >= 0) payload.experience = parsed
  }
  return payload
}
