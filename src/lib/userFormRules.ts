import type { CreateUserInput, MembershipStatus } from "@/types/users"

export interface UserFormValue {
  name: string
  email: string
  password: string
  roleId: string
  status: MembershipStatus
}

export interface UserFormError {
  field: keyof UserFormValue
  message: string
}

/** Client-side validation mirroring the backend create/patch schemas. */
export function validateUserForm(value: UserFormValue, opts?: { requirePassword?: boolean }): UserFormError[] {
  const errors: UserFormError[] = []
  if (!value.name.trim()) errors.push({ field: "name", message: "Name is required" })
  else if (value.name.trim().length > 120) errors.push({ field: "name", message: "Name must be 120 characters or fewer" })
  if (!value.email.trim()) errors.push({ field: "email", message: "Email is required" })
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim())) {
    errors.push({ field: "email", message: "Enter a valid email address" })
  } else if (value.email.trim().length > 200) {
    errors.push({ field: "email", message: "Email must be 200 characters or fewer" })
  }
  if (opts?.requirePassword) {
    if (!value.password) errors.push({ field: "password", message: "Password is required" })
    else if (value.password.length < 8) {
      errors.push({ field: "password", message: "Password must be at least 8 characters" })
    } else if (value.password.length > 200) {
      errors.push({ field: "password", message: "Password must be 200 characters or fewer" })
    }
  }
  if (!value.roleId) errors.push({ field: "roleId", message: "Role is required" })
  return errors
}

/** Maps form state to the create payload (password only when provided). */
export function userFormToCreatePayload(value: UserFormValue): CreateUserInput {
  const payload: CreateUserInput = {
    name: value.name.trim(),
    email: value.email.trim().toLowerCase(),
    roleId: value.roleId,
  }
  if (value.password) payload.password = value.password
  return payload
}